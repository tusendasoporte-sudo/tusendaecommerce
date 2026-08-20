[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9-]{1,62}$')][string]$ConfigKey,
    [Parameter(Mandatory = $true)][ValidateSet('Preview', 'Provision', 'Update')][string]$Operation,
    [string]$ConfigPath,
    [string]$BrandPath,
    [ValidateSet('Provision', 'Update')][string]$PreviewFor,
    [int]$VersionCode,
    [string]$VersionName,
    [string]$ConfirmedPreviewPath,
    [ValidatePattern('^$|^[a-f0-9]{64}$')][string]$ConfirmedPreviewHash,
    [string]$SigningPropertiesPath,
    [string]$UploadSigningPropertiesPath,
    [string]$SecretsRoot,
    [string]$ApiBaseUrl,
    [string]$ExistingFirebaseProjectNumber,
    [string]$ExistingFirebaseAppId,
    [string]$ExistingSigningCertSha256,
    [string]$ExistingUploadCertSha256,
    [ValidateSet('Debug', 'Release')][string]$BuildType = 'Release',
    [switch]$AllowFirebaseProvisioning,
    [switch]$AllowSigningGeneration,
    [switch]$ExecuteBuild
)

$ErrorActionPreference = 'Stop'

function Get-Sha256Lower {
    param([Parameter(Mandatory = $true)][string]$Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = $null
    try {
        $stream = [IO.File]::OpenRead($Path)
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        if ($stream) { $stream.Dispose() }
        $algorithm.Dispose()
    }
}

$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $mobileRoot
$validator = Join-Path $mobileRoot 'scripts\validate-store-config.ps1'
$config = & $validator -ConfigKey $ConfigKey -ExternalConfigPath $ConfigPath -ExternalBrandPath $BrandPath -PassThru
$engineRevision = [string](& git -C $repositoryRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or $engineRevision.Trim().ToLowerInvariant() -notmatch '^[a-f0-9]{40}$') {
    throw 'No se pudo determinar la revision Git del motor.'
}
$engineRevision = $engineRevision.Trim().ToLowerInvariant()
$workspaceChanges = @(& git -C $repositoryRoot status --porcelain --untracked-files=all 2>$null)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el estado Git del motor.' }
$workspaceClean = $workspaceChanges.Count -eq 0
$effectiveOperation = if ($Operation -eq 'Preview') {
    if ($PreviewFor) { $PreviewFor } elseif ($ConfigKey -eq 'powerzona') { 'Update' } else { 'Provision' }
} else { $Operation }
if ($VersionCode -le 0) { $VersionCode = $config.VersionCode }
if (-not $VersionName) { $VersionName = $config.VersionName }
if ($VersionName -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw 'VersionName invalido.' }

function Get-PreviewHash {
    param([string]$PayloadJson)
    $previewContract = if ($BrandPath) { 'v2' } else { 'v1' }
    $bytes = [Text.Encoding]::UTF8.GetBytes("pz_storefront_app_runner_preview:$previewContract|$PayloadJson")
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Read-PrivateProperties {
    param([string]$Path)
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -gt 0) { $values[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim() }
    }
    return $values
}

function Get-SigningCertificateFingerprint {
    param([string]$PropertiesPath)
    $signing = Read-PrivateProperties -Path $PropertiesPath
    $keystorePath = [string]$signing.storeFile
    if (-not [IO.Path]::IsPathRooted($keystorePath)) { $keystorePath = Join-Path (Split-Path -Parent $PropertiesPath) $keystorePath }
    $keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
    if (-not (Test-Path -LiteralPath $keytool)) { $keytool = 'keytool.exe' }
    $env:PZ_KEYTOOL_READ_PASSWORD = [string]$signing.storePassword
    try {
        $certificate = & $keytool -list -v -keystore $keystorePath -alias ([string]$signing.keyAlias) `
            -storepass:env PZ_KEYTOOL_READ_PASSWORD 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la firma configurada.' }
        $line = $certificate | Where-Object { $_ -match 'SHA256:\s*((?:[A-F0-9]{2}:){31}[A-F0-9]{2})' } | Select-Object -First 1
        if (-not $line -or $line -notmatch 'SHA256:\s*((?:[A-F0-9]{2}:){31}[A-F0-9]{2})') { throw 'Firma sin huella SHA-256 valida.' }
        return $Matches[1]
    } finally { Remove-Item Env:PZ_KEYTOOL_READ_PASSWORD -ErrorAction SilentlyContinue }
}

$payload = [ordered]@{
    schema_version = if ($BrandPath) { 2 } else { 1 }
    config_key = $ConfigKey
    operation = $effectiveOperation.ToLowerInvariant()
    identity = [ordered]@{
        store_key = $config.StoreKey; app_key = $config.AppKey; display_name = $config.DisplayName
        package_name = $config.ApplicationId; store_url = $config.StoreUrl; brand_key = $config.BrandKey
    }
    engine = [ordered]@{
        version = $config.EngineVersion
        revision = $engineRevision
        workspace_clean = $workspaceClean
    }
    firebase = [ordered]@{
        project_id = $config.FirebaseProjectId
        create_project = $effectiveOperation -eq 'Provision' -and $config.FirebaseProvisioning -eq 'create'
        register_android_app = $effectiveOperation -eq 'Provision' -and $config.FirebaseProvisioning -eq 'create'
    }
    signing = [ordered]@{
        create_app_signing_key = $effectiveOperation -eq 'Provision'
        create_play_upload_key = $config.Distribution -eq 'play_and_direct' -and -not $ExistingUploadCertSha256
        custodian = 'Tu Senda 84'
    }
    build = [ordered]@{
        version_code = $VersionCode; version_name = $VersionName; apk = $true
        aab = $config.Distribution -eq 'play_and_direct'; build_type = $BuildType.ToLowerInvariant()
    }
    delivery = [ordered]@{
        store_admin = @('apk', 'checksums', 'instructions')
        master_only = if ($config.Distribution -eq 'play_and_direct') { @('aab', 'build_manifest') } else { @('build_manifest') }
    }
}
if ($BrandPath) {
    $payload.branding = [ordered]@{
        palette = $config.Brand.palette
        assets = [ordered]@{
            icon = [ordered]@{
                sha256 = [string]$config.Brand.assets.icon.sha256
                width = [int]$config.Brand.assets.icon.width
                height = [int]$config.Brand.assets.icon.height
                bytes = [int64]$config.Brand.assets.icon.bytes
                normalizer_version = [string]$config.Brand.assets.icon.normalizer_version
            }
            splash = [ordered]@{
                sha256 = [string]$config.Brand.assets.splash.sha256
                width = [int]$config.Brand.assets.splash.width
                height = [int]$config.Brand.assets.splash.height
                bytes = [int64]$config.Brand.assets.splash.bytes
                normalizer_version = [string]$config.Brand.assets.splash.normalizer_version
            }
        }
    }
}
$payloadJson = $payload | ConvertTo-Json -Depth 10 -Compress
$previewHash = Get-PreviewHash -PayloadJson $payloadJson

if ($Operation -eq 'Preview') {
    if ($AllowFirebaseProvisioning -or $AllowSigningGeneration -or $ExecuteBuild) { throw 'Preview no admite efectos externos ni compilacion.' }
    $previewDirectory = Join-Path $mobileRoot 'build\previews'
    New-Item -ItemType Directory -Path $previewDirectory -Force | Out-Null
    $previewPath = Join-Path $previewDirectory "$($config.StoreKey)-$previewHash.json"
    [ordered]@{ preview_hash = $previewHash; payload = $payload } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $previewPath -Encoding UTF8
    [pscustomobject]@{ PreviewPath = $previewPath; PreviewHash = $previewHash; Payload = $payload }
    return
}

if (-not $ConfirmedPreviewPath -or -not (Test-Path -LiteralPath $ConfirmedPreviewPath -PathType Leaf)) { throw 'Falta la vista previa confirmada.' }
$confirmed = Get-Content -LiteralPath $ConfirmedPreviewPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($confirmed.preview_hash -ne $ConfirmedPreviewHash -or $confirmed.preview_hash -ne $previewHash) {
    throw 'La vista previa confirmada no coincide exactamente con la solicitud actual.'
}
if (-not $ExecuteBuild) { throw 'La ejecucion requiere -ExecuteBuild despues de confirmar la vista previa.' }
if ($BuildType -eq 'Release' -and -not $config.Publishable) { throw 'La configuracion no publicable solo admite Debug.' }
if ($BuildType -eq 'Release' -and -not $workspaceClean) { throw 'Release requiere un workspace Git limpio y versionado.' }

$firebaseResult = $null
$signingCertSha256 = $ExistingSigningCertSha256
$uploadCertSha256 = $ExistingUploadCertSha256
if ($Operation -eq 'Provision' -and [bool]$payload.firebase.create_project) {
    if (-not $AllowFirebaseProvisioning) { throw 'El aprovisionamiento Firebase requiere autorizacion separada.' }
    $firebaseScript = Join-Path $PSScriptRoot 'provision-store-firebase.ps1'
    $firebaseResult = & $firebaseScript -ConfirmedPreviewPath $ConfirmedPreviewPath `
        -ConfirmedPreviewHash $ConfirmedPreviewHash -GoogleServicesOutputPath (Join-Path $mobileRoot 'app\google-services.json')
}

if ($BuildType -eq 'Release') {
    if ($Operation -eq 'Provision' -and -not $SigningPropertiesPath) {
        if (-not $AllowSigningGeneration -or -not $SecretsRoot) { throw 'Generar la firma requiere autorizacion y SecretsRoot externo.' }
        $signingResult = & (Join-Path $PSScriptRoot 'generate-store-signing.ps1') -ConfigKey $ConfigKey -SecretsRoot $SecretsRoot `
            -KeyPurpose app -ConfirmedPreviewPath $ConfirmedPreviewPath -ConfirmedPreviewHash $ConfirmedPreviewHash
        $SigningPropertiesPath = $signingResult.PropertiesPath
        $signingCertSha256 = $signingResult.CertificateSha256
    }
    if ([bool]$payload.build.aab -and -not $UploadSigningPropertiesPath) {
        if (-not [bool]$payload.signing.create_play_upload_key) { throw 'Falta la firma de subida existente requerida para el AAB.' }
        if (-not $AllowSigningGeneration -or -not $SecretsRoot) { throw 'Generar la firma de subida requiere autorizacion y SecretsRoot externo.' }
        $uploadResult = & (Join-Path $PSScriptRoot 'generate-store-signing.ps1') -ConfigKey $ConfigKey -SecretsRoot $SecretsRoot `
            -KeyPurpose upload -ConfirmedPreviewPath $ConfirmedPreviewPath -ConfirmedPreviewHash $ConfirmedPreviewHash
        $UploadSigningPropertiesPath = $uploadResult.PropertiesPath
        $uploadCertSha256 = $uploadResult.CertificateSha256
    }
    if (-not $SigningPropertiesPath) { throw 'Release requiere la firma privada exclusiva de la tienda.' }
    & $validator -ConfigKey $ConfigKey -ExternalConfigPath $ConfigPath -ExternalBrandPath $BrandPath `
        -RequireFirebase -SigningPropertiesPath $SigningPropertiesPath
    if (-not $signingCertSha256) { $signingCertSha256 = Get-SigningCertificateFingerprint -PropertiesPath $SigningPropertiesPath }
    if ([bool]$payload.build.aab -and -not $uploadCertSha256 -and $UploadSigningPropertiesPath) {
        $uploadCertSha256 = Get-SigningCertificateFingerprint -PropertiesPath $UploadSigningPropertiesPath
    }
}

$releaseDirectory = Join-Path $mobileRoot "releases\$($config.StoreKey)\$VersionName-$VersionCode"
if (Test-Path -LiteralPath $releaseDirectory) {
    $existingReleaseContents = @(Get-ChildItem -LiteralPath $releaseDirectory -Force)
    if ($existingReleaseContents.Count -gt 0) { throw 'La salida de esta version ya existe; no se sobrescribe.' }
    Remove-Item -LiteralPath $releaseDirectory -Force
}
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$gradle = Join-Path $mobileRoot 'gradlew.bat'
$previousSigning = [string]$env:PZ_STOREFRONT_SIGNING_PROPERTIES
$previousConfigFile = [string]$env:PZ_STOREFRONT_CONFIG_FILE
$previousBrandFile = [string]$env:PZ_STOREFRONT_BRAND_CONFIG_FILE
$gradleLocationPushed = $false
try {
    Push-Location -LiteralPath $mobileRoot
    $gradleLocationPushed = $true
    $gradleArgs = @("-PPZ_STOREFRONT_CONFIG=$ConfigKey", "-PPZ_STOREFRONT_VERSION_CODE=$VersionCode", "-PPZ_STOREFRONT_VERSION_NAME=$VersionName", '--no-daemon')
    if ($ApiBaseUrl) { $gradleArgs += "-PPZ_STOREFRONT_API_BASE_URL=$ApiBaseUrl" }
    if ($ConfigPath) { $env:PZ_STOREFRONT_CONFIG_FILE = $config.ConfigPath }
    if ($BrandPath) { $env:PZ_STOREFRONT_BRAND_CONFIG_FILE = $config.BrandPath }
    if ($BuildType -eq 'Debug') {
        & $gradle 'clean' 'testDebugUnitTest' 'lintDebug' 'assembleDebug' @gradleArgs
        if ($LASTEXITCODE -ne 0) { throw 'Gradle no completo el build Debug.' }
        $apkSource = Join-Path $mobileRoot 'app\build\outputs\apk\debug\app-debug.apk'
    } else {
        $env:PZ_STOREFRONT_SIGNING_PROPERTIES = $SigningPropertiesPath
        & $gradle 'clean' 'testDebugUnitTest' @gradleArgs
        if ($LASTEXITCODE -ne 0) { throw 'Gradle no completo las pruebas unitarias previas al Release.' }
        & $gradle 'lintRelease' 'assembleRelease' @gradleArgs
        if ($LASTEXITCODE -ne 0) { throw 'Gradle no completo el APK Release.' }
        $apkSource = Join-Path $mobileRoot 'app\build\outputs\apk\release\app-release.apk'
    }
    $apkName = "$($config.StoreKey)-$VersionName-$VersionCode-direct.apk"
    Copy-Item -LiteralPath $apkSource -Destination (Join-Path $releaseDirectory $apkName)
    $artifactNames = @($apkName)
    if ($BuildType -eq 'Release' -and [bool]$payload.build.aab) {
        if (-not $UploadSigningPropertiesPath) { throw 'El AAB requiere una clave de subida exclusiva de la app.' }
        $env:PZ_STOREFRONT_SIGNING_PROPERTIES = $UploadSigningPropertiesPath
        $playGradleArgs = @($gradleArgs) + '-PPZ_STOREFRONT_PLAY_BUNDLE=true'
        & $gradle 'bundleRelease' @playGradleArgs
        if ($LASTEXITCODE -ne 0) { throw 'Gradle no completo el AAB Release.' }
        $aabName = "$($config.StoreKey)-$VersionName-$VersionCode-play.aab"
        Copy-Item -LiteralPath (Join-Path $mobileRoot 'app\build\outputs\bundle\release\app-release.aab') -Destination (Join-Path $releaseDirectory $aabName)
        $artifactNames += $aabName
    }
    $checksums = foreach ($name in $artifactNames) {
        $hash = Get-Sha256Lower (Join-Path $releaseDirectory $name)
        "$hash  $name"
    }
    $checksums | Set-Content -LiteralPath (Join-Path $releaseDirectory 'SHA256SUMS.txt') -Encoding UTF8
    @(
        "Tienda: $($config.DisplayName)"
        "Paquete: $($config.ApplicationId)"
        "Version: $VersionName ($VersionCode)"
        "Motor: $($config.EngineVersion) ($engineRevision)"
        'Verifique SHA256SUMS.txt antes de instalar el APK.'
        'Tu Senda 84 conserva la firma, Firebase y los artefactos exclusivos del Master.'
    ) | Set-Content -LiteralPath (Join-Path $releaseDirectory 'INSTRUCCIONES.txt') -Encoding UTF8
    $manifest = [ordered]@{
        schema_version = 1; preview_hash = $previewHash; config_key = $ConfigKey
        operation = $effectiveOperation.ToLowerInvariant(); engine_version = $config.EngineVersion; git_commit = $engineRevision
        generated_at = [DateTime]::UtcNow.ToString('o'); artifacts = $artifactNames
        firebase_project_id = $config.FirebaseProjectId; firebase_app_id = if ($firebaseResult) { $firebaseResult.FirebaseAppId } else { '' }
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $releaseDirectory 'build-manifest.json') -Encoding UTF8
    [pscustomobject]@{
        OutputDirectory = $releaseDirectory; Artifacts = $artifactNames; PreviewHash = $previewHash
        FirebaseProjectNumber = if ($firebaseResult) { $firebaseResult.ProjectNumber } else { $ExistingFirebaseProjectNumber }
        FirebaseAppId = if ($firebaseResult) { $firebaseResult.FirebaseAppId } else { $ExistingFirebaseAppId }
        SigningCertSha256 = $signingCertSha256; UploadCertSha256 = $uploadCertSha256
        EngineVersion = $config.EngineVersion; EngineRevision = $engineRevision
    }
} finally {
    if ($gradleLocationPushed) { Pop-Location }
    if ($previousSigning) { $env:PZ_STOREFRONT_SIGNING_PROPERTIES = $previousSigning }
    else { Remove-Item Env:PZ_STOREFRONT_SIGNING_PROPERTIES -ErrorAction SilentlyContinue }
    if ($previousConfigFile) { $env:PZ_STOREFRONT_CONFIG_FILE = $previousConfigFile }
    else { Remove-Item Env:PZ_STOREFRONT_CONFIG_FILE -ErrorAction SilentlyContinue }
    if ($previousBrandFile) { $env:PZ_STOREFRONT_BRAND_CONFIG_FILE = $previousBrandFile }
    else { Remove-Item Env:PZ_STOREFRONT_BRAND_CONFIG_FILE -ErrorAction SilentlyContinue }
}
