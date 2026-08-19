[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Preview', 'Build')][string]$Operation,
    [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$VersionCode,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')][string]$VersionName,
    [ValidateSet('staging', 'production')][string]$Channel = 'staging',
    [ValidateSet('provision', 'update')][string]$ReleaseOperation = 'update',
    [ValidatePattern('^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')][string]$PackageName = 'com.tusenda84.admin',
    [string]$DisplayName = 'Tu Senda 84 Admin',
    [string]$AdminUrl = 'https://tusenda84.com/admin',
    [ValidatePattern('^$|^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$')][string]$ExpectedSigningCertSha256 = '',
    [ValidatePattern('^$|^[a-f0-9]{64}$')][string]$IconSha256 = '',
    [ValidatePattern('^$|^[a-f0-9]{64}$')][string]$SplashSha256 = '',
    [ValidatePattern('^#[A-F0-9]{6}$')][string]$SplashBackgroundColor = '#FFFFFF',
    [string]$IconPath,
    [string]$SplashPath,
    [ValidateSet('Debug', 'Release')][string]$BuildType = 'Release',
    [string]$SigningPropertiesPath,
    [string]$ConfirmedPreviewPath,
    [ValidatePattern('^$|^[a-f0-9]{64}$')][string]$ConfirmedPreviewHash = '',
    [switch]$ExecuteBuild
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repositoryRoot 'mobile-admin'
$engineManifestPath = Join-Path $mobileRoot 'engine.json'
if (-not (Test-Path -LiteralPath $engineManifestPath -PathType Leaf)) { throw 'Falta el contrato del motor Mobile Admin.' }
$engineManifest = Get-Content -LiteralPath $engineManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$engineManifest.name -ne 'Tu Senda 84 Admin Engine' -or [string]$engineManifest.version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$' `
    -or [int]$engineManifest.contract_version -lt 1) { throw 'El contrato del motor Mobile Admin es inválido.' }

function ConvertTo-CanonicalJson {
    param([Parameter(Mandatory = $true)]$Value)
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [bool]) { return $(if ($Value) { 'true' } else { 'false' }) }
    if ($Value -is [string]) { return ($Value | ConvertTo-Json -Compress) }
    if ($Value -is [ValueType]) { return ([Convert]::ToString($Value, [Globalization.CultureInfo]::InvariantCulture)) }
    if ($Value -is [Collections.IEnumerable] -and $Value -isnot [Collections.IDictionary]) {
        return '[' + ((@($Value) | ForEach-Object { ConvertTo-CanonicalJson $_ }) -join ',') + ']'
    }
    $properties = if ($Value -is [Collections.IDictionary]) { @($Value.Keys) } else { @($Value.PSObject.Properties.Name) }
    return '{' + (($properties | Sort-Object | ForEach-Object {
        $key = [string]$_
        $item = if ($Value -is [Collections.IDictionary]) { $Value[$key] } else { $Value.$key }
        ($key | ConvertTo-Json -Compress) + ':' + (ConvertTo-CanonicalJson $item)
    }) -join ',') + '}'
}

function Get-Sha256Text {
    param([string]$Value)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        return ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally { $algorithm.Dispose() }
}

function Get-Sha256File {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-Properties {
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

function Get-SigningFingerprint {
    param([string]$PropertiesPath)
    $signing = Read-Properties $PropertiesPath
    foreach ($key in @('storeFile', 'storePassword', 'keyAlias', 'keyPassword')) {
        if (-not [string]$signing[$key]) { throw "Firma incompleta: falta $key." }
    }
    $keystore = [string]$signing.storeFile
    if (-not [IO.Path]::IsPathRooted($keystore)) { $keystore = Join-Path (Split-Path -Parent $PropertiesPath) $keystore }
    if (-not (Test-Path -LiteralPath $keystore -PathType Leaf)) { throw 'No existe el keystore configurado.' }
    $keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' } else { 'keytool.exe' }
    $env:PZ_ADMIN_KEYSTORE_PASSWORD = [string]$signing.storePassword
    try {
        $output = & $keytool -list -v -keystore $keystore -alias ([string]$signing.keyAlias) -storepass:env PZ_ADMIN_KEYSTORE_PASSWORD 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el certificado configurado.' }
        $line = $output | Where-Object { $_ -match 'SHA256:\s*((?:[A-F0-9]{2}:){31}[A-F0-9]{2})' } | Select-Object -First 1
        if (-not $line -or $line -notmatch 'SHA256:\s*((?:[A-F0-9]{2}:){31}[A-F0-9]{2})') { throw 'La firma no expone SHA-256 válido.' }
        return $Matches[1]
    } finally { Remove-Item Env:PZ_ADMIN_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue }
}

if ($AdminUrl -notmatch '^https://') { throw 'AdminUrl debe usar HTTPS.' }
$preview = [ordered]@{
    schema_version = 2
    app = 'mobile-admin'
    channel = $Channel
    engine = [ordered]@{ name = [string]$engineManifest.name; version = [string]$engineManifest.version; contract_version = [int]$engineManifest.contract_version }
    operation = $ReleaseOperation
    identity = [ordered]@{
        display_name = $DisplayName
        package_name = $PackageName
        admin_url = $AdminUrl
        signing_cert_sha256 = $ExpectedSigningCertSha256
    }
    build = [ordered]@{ version_code = $VersionCode; version_name = $VersionName; apk = $true; build_type = 'release' }
    appearance = [ordered]@{ icon_sha256 = $IconSha256; splash_sha256 = $SplashSha256; splash_background_color = $SplashBackgroundColor }
    delivery = [ordered]@{ authenticated_only = $true; master_test_approval_required = $true; automatic_authorized_admin_delivery = $true; mandatory_after_publication = $true }
}
$canonical = ConvertTo-CanonicalJson $preview
$previewHash = Get-Sha256Text "pz_admin_app_preview:v2|$canonical"

if ($Operation -eq 'Preview') {
    if ($ExecuteBuild -or $SigningPropertiesPath -or $IconPath -or $SplashPath) { throw 'Preview no admite compilación, firma ni archivos físicos.' }
    $previewDirectory = Join-Path $mobileRoot 'build\previews'
    New-Item -ItemType Directory -Path $previewDirectory -Force | Out-Null
    $previewPath = Join-Path $previewDirectory "mobile-admin-$VersionName-$VersionCode-$previewHash.json"
    [ordered]@{ preview_hash = $previewHash; preview = $preview } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $previewPath -Encoding UTF8
    return [pscustomobject]@{ PreviewPath = $previewPath; PreviewHash = $previewHash; Preview = $preview }
}

if (-not $ExecuteBuild) { throw 'Build requiere -ExecuteBuild y una vista previa confirmada.' }
if (-not $ConfirmedPreviewPath -or -not (Test-Path -LiteralPath $ConfirmedPreviewPath -PathType Leaf)) { throw 'Falta la vista previa confirmada.' }
$confirmed = Get-Content -LiteralPath $ConfirmedPreviewPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($confirmed.preview_hash -ne $ConfirmedPreviewHash -or $ConfirmedPreviewHash -ne $previewHash) { throw 'La vista previa confirmada no coincide.' }

$gitRevision = [string](& git -C $repositoryRoot rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $gitRevision.Trim() -notmatch '^[a-f0-9]{40}$') { throw 'No se pudo fijar la revisión Git.' }
$workspaceChanges = @(& git -C $repositoryRoot status --porcelain --untracked-files=all)
if ($BuildType -eq 'Release' -and $workspaceChanges.Count -ne 0) { throw 'Release requiere un workspace Git limpio.' }

$signingCert = ''
if ($BuildType -eq 'Release') {
    if (-not $SigningPropertiesPath -or -not (Test-Path -LiteralPath $SigningPropertiesPath -PathType Leaf)) {
        throw 'Release requiere la firma existente; C10.8 nunca genera una nueva.'
    }
    $signingCert = Get-SigningFingerprint $SigningPropertiesPath
    if ($ExpectedSigningCertSha256 -and $ExpectedSigningCertSha256 -ne $signingCert) { throw 'La firma no coincide con la identidad congelada.' }
}

foreach ($brand in @(
    @{ Label = 'icono'; Hash = $IconSha256; Path = $IconPath },
    @{ Label = 'splash'; Hash = $SplashSha256; Path = $SplashPath }
)) {
    if ($brand.Hash) {
        if (-not $brand.Path -or -not (Test-Path -LiteralPath $brand.Path -PathType Leaf)) { throw "Falta el archivo físico de $($brand.Label)." }
        if ((Get-Sha256File $brand.Path) -ne $brand.Hash) { throw "El checksum de $($brand.Label) no coincide con la vista previa." }
    } elseif ($brand.Path) { throw "No se admite un archivo de $($brand.Label) sin checksum confirmado." }
}

$releaseDirectory = Join-Path $mobileRoot "releases\$Channel\$VersionName-$VersionCode"
if (Test-Path -LiteralPath $releaseDirectory) { throw 'La salida ya existe y no se sobrescribirá.' }
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$gradle = Join-Path $mobileRoot 'gradlew.bat'
$brandBackupDirectory = Join-Path ([IO.Path]::GetTempPath()) ("pz-admin-brand-" + [Guid]::NewGuid().ToString('N'))
$iconTarget = Join-Path $mobileRoot 'app\src\main\res\drawable-nodpi\ic_launcher_brand_foreground.png'
$splashXmlTarget = Join-Path $mobileRoot 'app\src\main\res\drawable\splash_icon.xml'
$splashPngTarget = Join-Path $mobileRoot 'app\src\main\res\drawable-nodpi\splash_icon.png'
try {
    New-Item -ItemType Directory -Path $brandBackupDirectory | Out-Null
    if ($IconSha256) {
        Copy-Item -LiteralPath $iconTarget -Destination (Join-Path $brandBackupDirectory 'ic_launcher_brand_foreground.png')
        Copy-Item -LiteralPath $IconPath -Destination $iconTarget -Force
    }
    if ($SplashSha256) {
        Copy-Item -LiteralPath $splashXmlTarget -Destination (Join-Path $brandBackupDirectory 'splash_icon.xml')
        Remove-Item -LiteralPath $splashXmlTarget -Force
        Copy-Item -LiteralPath $SplashPath -Destination $splashPngTarget
    }
    $gradleArgs = @("-PPZ_ADMIN_VERSION_CODE=$VersionCode", "-PPZ_ADMIN_VERSION_NAME=$VersionName", "-PPZ_APPLICATION_ID=$PackageName", "-PPZ_APP_NAME=$DisplayName", "-PPZ_ADMIN_URL=$AdminUrl", "-PPZ_SPLASH_BACKGROUND=$SplashBackgroundColor", '--no-daemon')
    if ($BuildType -eq 'Debug') {
        & $gradle 'clean' 'testDebugUnitTest' 'lintDebug' 'assembleDebug' @gradleArgs
        $sourceApk = Join-Path $mobileRoot 'app\build\outputs\apk\debug\app-debug.apk'
    } else {
        $gradleArgs += "-PPZ_ADMIN_SIGNING_PROPERTIES=$SigningPropertiesPath"
        & $gradle 'clean' 'testDebugUnitTest' 'lintRelease' 'assembleRelease' @gradleArgs
        $sourceApk = Join-Path $mobileRoot 'app\build\outputs\apk\release\app-release.apk'
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sourceApk -PathType Leaf)) { throw 'Gradle no produjo el APK esperado.' }
    $apkName = "mobile-admin-$VersionName-$VersionCode.apk"
    Copy-Item -LiteralPath $sourceApk -Destination (Join-Path $releaseDirectory $apkName)
    $apkHash = Get-Sha256File (Join-Path $releaseDirectory $apkName)
    "$apkHash  $apkName" | Set-Content -LiteralPath (Join-Path $releaseDirectory 'SHA256SUMS.txt') -Encoding UTF8
    @("Aplicación: $DisplayName", "Paquete: $PackageName", "Versión: $VersionName ($VersionCode)", "Motor: $($engineManifest.name) $($engineManifest.version)", "SHA-256: $apkHash", 'Instalar sin desinstalar la versión anterior.') | Set-Content -LiteralPath (Join-Path $releaseDirectory 'INSTRUCCIONES.txt') -Encoding UTF8
    [ordered]@{
        schema_version = 2; app = 'mobile-admin'; channel = $Channel
        engine = [ordered]@{ name = [string]$engineManifest.name; version = [string]$engineManifest.version; contract_version = [int]$engineManifest.contract_version; git_commit = $gitRevision.Trim() }
        version_code = $VersionCode; version_name = $VersionName; package_name = $PackageName; signing_cert_sha256 = $signingCert
        appearance = [ordered]@{ icon_sha256 = $IconSha256; splash_sha256 = $SplashSha256; splash_background_color = $SplashBackgroundColor }
        apk = $apkName; sha256 = $apkHash
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $releaseDirectory 'build-manifest.json') -Encoding UTF8
    return [pscustomobject]@{ OutputDirectory = $releaseDirectory; ApkName = $apkName; ApkSha256 = $apkHash; SigningCertSha256 = $signingCert; PreviewHash = $previewHash }
} catch {
    if (Test-Path -LiteralPath $releaseDirectory) { Remove-Item -LiteralPath $releaseDirectory -Recurse -Force }
    throw
} finally {
    if ($IconSha256 -and (Test-Path -LiteralPath (Join-Path $brandBackupDirectory 'ic_launcher_brand_foreground.png'))) {
        Copy-Item -LiteralPath (Join-Path $brandBackupDirectory 'ic_launcher_brand_foreground.png') -Destination $iconTarget -Force
    }
    if ($SplashSha256) {
        if (Test-Path -LiteralPath $splashPngTarget) { Remove-Item -LiteralPath $splashPngTarget -Force }
        if (Test-Path -LiteralPath (Join-Path $brandBackupDirectory 'splash_icon.xml')) {
            Copy-Item -LiteralPath (Join-Path $brandBackupDirectory 'splash_icon.xml') -Destination $splashXmlTarget -Force
        }
    }
    Get-ChildItem -LiteralPath $brandBackupDirectory -File -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
    if (Test-Path -LiteralPath $brandBackupDirectory) { Remove-Item -LiteralPath $brandBackupDirectory -Force }
}
