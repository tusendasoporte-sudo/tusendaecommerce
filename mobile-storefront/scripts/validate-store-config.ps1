[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,62}$')]
    [string]$ConfigKey,
    [string]$ExternalConfigPath,
    [string]$ExternalBrandPath,
    [switch]$RequireFirebase,
    [string]$SigningPropertiesPath,
    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $mobileRoot

function Read-PropertiesFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    $values = [ordered]@{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) { throw "Linea invalida en $Path." }
        $key = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($values.Contains($key)) { throw "Clave duplicada '$key' en $Path." }
        $values[$key] = $value
    }
    return $values
}

function Assert-Pattern {
    param([string]$Value, [string]$Pattern, [string]$ErrorMessage)
    if ($Value -cnotmatch $Pattern) { throw $ErrorMessage }
}

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

function Get-PngDimensions {
    param([Parameter(Mandatory = $true)][string]$Path)
    $stream = [IO.File]::OpenRead($Path)
    try {
        $header = New-Object byte[] 24
        if ($stream.Read($header, 0, 24) -ne 24 -or
            -not ($header[0] -eq 0x89 -and $header[1] -eq 0x50 -and $header[2] -eq 0x4e -and $header[3] -eq 0x47 -and
                $header[4] -eq 0x0d -and $header[5] -eq 0x0a -and $header[6] -eq 0x1a -and $header[7] -eq 0x0a -and
                $header[12] -eq 0x49 -and $header[13] -eq 0x48 -and $header[14] -eq 0x44 -and $header[15] -eq 0x52)) {
            throw "El recurso $Path no es un PNG valido."
        }
        $width = [int64]$header[16] * 16777216 + [int64]$header[17] * 65536 + [int64]$header[18] * 256 + $header[19]
        $height = [int64]$header[20] * 16777216 + [int64]$header[21] * 65536 + [int64]$header[22] * 256 + $header[23]
        return [pscustomobject]@{ Width = $width; Height = $height }
    } finally { $stream.Dispose() }
}

$configPath = if ($ExternalConfigPath) {
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExternalConfigPath)
} else { Join-Path $mobileRoot "config\$ConfigKey.properties" }
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw "No existe $configPath." }
$config = Read-PropertiesFile -Path $configPath
$enginePath = Join-Path $mobileRoot 'config\engine.properties'
if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) { throw "No existe $enginePath." }
$engine = Read-PropertiesFile -Path $enginePath
if ($engine.Count -ne 2 -or $engine['schema.version'] -ne '1' -or
    [string]$engine['engine.version'] -cnotmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'La version aprobada del motor es invalida.'
}
$required = @(
    'schema.version', 'store.key', 'app.key', 'store.url', 'app.display_name',
    'application.id', 'brand.key', 'firebase.project_id', 'firebase.provisioning', 'distribution',
    'build.publishable', 'version.code', 'version.name'
)
foreach ($key in $required) {
    if (-not $config.Contains($key) -or -not [string]$config[$key]) { throw "Falta '$key' en $configPath." }
}
if ($config['schema.version'] -ne '1') { throw 'schema.version debe ser 1.' }
Assert-Pattern $config['store.key'] '^[a-z0-9][a-z0-9-]{1,62}$' 'store.key invalido.'
Assert-Pattern $config['app.key'] '^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$' 'app.key invalido.'
Assert-Pattern $config['application.id'] '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' 'application.id invalido.'
Assert-Pattern $config['brand.key'] '^[a-z0-9][a-z0-9-]{1,62}$' 'brand.key invalido.'
Assert-Pattern $config['firebase.project_id'] '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' 'firebase.project_id invalido.'
if ($config['firebase.provisioning'] -notin @('existing', 'create')) { throw 'firebase.provisioning invalido.' }
Assert-Pattern $config['version.name'] '^[0-9]+\.[0-9]+\.[0-9]+$' 'version.name debe ser semantico.'
$versionCode = 0
if (-not [int]::TryParse($config['version.code'], [ref]$versionCode) -or $versionCode -lt 1) { throw 'version.code invalido.' }
$expectedUrl = "https://$(([uri]$config['store.url']).Host)/t/$($config['store.key'])"
if ($config['store.url'] -ne $expectedUrl) { throw 'store.url debe ser HTTPS, sin puerto/ruta extra, y terminar en /t/{store.key}.' }
if ($config['distribution'] -notin @('play_and_direct', 'direct')) { throw 'distribution invalida.' }
if ($config['store.key'] -eq 'powerzona' -and $config['distribution'] -ne 'play_and_direct') { throw 'PowerZona requiere play_and_direct.' }
if ($config['store.key'] -ne 'powerzona' -and $config['distribution'] -ne 'direct') { throw 'Una tienda tenant requiere direct.' }
if ($config['build.publishable'] -notin @('true', 'false')) { throw 'build.publishable debe ser true o false.' }

$brandPath = if ($ExternalBrandPath) {
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExternalBrandPath)
} else { Join-Path $mobileRoot "brands\$($config['brand.key'])\brand.json" }
if (-not (Test-Path -LiteralPath $brandPath -PathType Leaf)) { throw "No existe $brandPath." }
$brand = Get-Content -LiteralPath $brandPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($brand.schema_version -ne 1 -or $brand.brand_key -ne $config['brand.key'] -or
    $brand.store_key -ne $config['store.key'] -or $brand.display_name -ne $config['app.display_name'] -or
    $brand.application_id -ne $config['application.id'] -or $brand.store_url -ne $config['store.url'] -or
    [bool]$brand.publishable -ne ($config['build.publishable'] -eq 'true') -or
    $brand.firebase_android.project_id -ne $config['firebase.project_id'] -or
    $brand.firebase_android.package_name -ne $config['application.id'] -or
    [bool]$brand.firebase_android.tracked_in_git) {
    throw 'brand.json no coincide exactamente con la configuracion.'
}
foreach ($assetName in @('icon', 'splash')) {
    $asset = $brand.assets.$assetName
    $assetPath = Join-Path (Split-Path -Parent $brandPath) $asset.file
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) { throw "Falta el recurso $assetName." }
    if ($ExternalBrandPath) {
        $inheritedEngineAsset = [string]$asset.normalizer_version -ceq 'engine-brand-v1'
        $expectedWidth = if ($inheritedEngineAsset) { [int]$asset.width } elseif ($assetName -eq 'icon') { 1024 } else { 1080 }
        $expectedHeight = if ($inheritedEngineAsset) { [int]$asset.height } elseif ($assetName -eq 'icon') { 1024 } else { 1920 }
        $dimensions = Get-PngDimensions -Path $assetPath
        $length = (Get-Item -LiteralPath $assetPath).Length
        if ([string]$asset.file -cnotmatch "^$assetName[-_][a-f0-9]{32}(_[A-Za-z0-9]{6,32})?\.png$" -or
            [int64]$asset.width -ne $expectedWidth -or [int64]$asset.height -ne $expectedHeight -or
            $dimensions.Width -ne $expectedWidth -or $dimensions.Height -ne $expectedHeight -or
            [int64]$asset.bytes -ne $length -or $length -lt 1 -or $length -gt (8 * 1024 * 1024) -or
            [string]$asset.normalizer_version -cnotmatch '^[a-z0-9._-]{8,80}$') {
            throw "El contrato normalizado de $assetName es invalido."
        }
    }
    if ((Get-Sha256Lower $assetPath) -ne [string]$asset.sha256) { throw "El hash de $assetName no coincide." }
}

$notificationIcon = $brand.assets.notification_icon
if ($notificationIcon) {
    $notificationIconPath = Join-Path (Split-Path -Parent $brandPath) ([string]$notificationIcon.file)
    if (-not (Test-Path -LiteralPath $notificationIconPath -PathType Leaf) -or
        [IO.Path]::GetExtension($notificationIconPath) -cne '.xml' -or
        (Split-Path -Parent (Resolve-Path -LiteralPath $notificationIconPath).Path) -cne (Resolve-Path -LiteralPath (Split-Path -Parent $brandPath)).Path) {
        throw 'El recurso notification_icon debe ser un XML versionado dentro de la marca.'
    }
    if ((Get-Sha256Lower $notificationIconPath) -ne [string]$notificationIcon.sha256) {
        throw 'El hash de notification_icon no coincide.'
    }
}

$applicationIds = @{}
Get-ChildItem -LiteralPath (Join-Path $mobileRoot 'config') -Filter '*.properties' -File | ForEach-Object {
    $candidate = Read-PropertiesFile -Path $_.FullName
    $candidateId = [string]$candidate['application.id']
    if (-not $candidateId) { return }
    if ($applicationIds.ContainsKey($candidateId)) { throw "application.id duplicado en $($applicationIds[$candidateId]) y $($_.Name)." }
    $applicationIds[$candidateId] = $_.Name
}

$trackedSensitive = & git -C $repositoryRoot ls-files 2>$null | Where-Object {
    $_ -match '(?i)(google-services\.json|\.(jks|keystore|p12|pfx|pem|key)$|(^|/)(app|upload)-signing\.properties$|service-account.*\.json$|firebase-service-account.*\.json$|(^|/)\.secrets/)'
}
if ($trackedSensitive) { throw 'Git contiene un archivo sensible prohibido.' }

if ($RequireFirebase) {
    $firebasePath = Join-Path $mobileRoot 'app\google-services.json'
    if (-not (Test-Path -LiteralPath $firebasePath -PathType Leaf)) { throw 'Falta app/google-services.json local.' }
    $firebase = Get-Content -LiteralPath $firebasePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $packages = @($firebase.client | ForEach-Object { $_.client_info.android_client_info.package_name })
    if ($firebase.project_info.project_id -ne $config['firebase.project_id'] -or $config['application.id'] -notin $packages) {
        throw 'google-services.json no coincide con el proyecto y paquete configurados.'
    }
}

if ($SigningPropertiesPath) {
    $resolvedSigningPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SigningPropertiesPath)
    if (-not (Test-Path -LiteralPath $resolvedSigningPath -PathType Leaf)) { throw 'No existe el archivo privado de firma.' }
    $signing = Read-PropertiesFile -Path $resolvedSigningPath
    foreach ($key in @('storeFile', 'storePassword', 'keyAlias', 'keyPassword')) {
        if (-not $signing.Contains($key) -or -not [string]$signing[$key]) { throw "Falta '$key' en la configuracion privada de firma." }
    }
    if ($resolvedSigningPath.StartsWith($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $resolvedSigningPath.Substring($repositoryRoot.Length).TrimStart('\', '/').Replace('\', '/')
        & git -C $repositoryRoot ls-files --error-unmatch -- $relative *> $null
        if ($LASTEXITCODE -eq 0) { throw 'La configuracion privada de firma esta rastreada por Git.' }
    }
}

$result = [pscustomobject]@{
    ConfigKey = $ConfigKey
    ConfigPath = $configPath
    BrandPath = $brandPath
    Brand = $brand
    IconPath = Join-Path (Split-Path -Parent $brandPath) ([string]$brand.assets.icon.file)
    SplashPath = Join-Path (Split-Path -Parent $brandPath) ([string]$brand.assets.splash.file)
    NotificationIconPath = if ($notificationIcon) {
        Join-Path (Split-Path -Parent $brandPath) ([string]$notificationIcon.file)
    } else { '' }
    StoreKey = $config['store.key']
    AppKey = $config['app.key']
    DisplayName = $config['app.display_name']
    ApplicationId = $config['application.id']
    StoreUrl = $config['store.url']
    FirebaseProjectId = $config['firebase.project_id']
    FirebaseProvisioning = $config['firebase.provisioning']
    Distribution = $config['distribution']
    Publishable = $config['build.publishable'] -eq 'true'
    VersionCode = $versionCode
    VersionName = $config['version.name']
    BrandKey = $config['brand.key']
    EngineVersion = $engine['engine.version']
}
if ($PassThru) { return $result }
Write-Host "Configuracion '$ConfigKey' valida y sin secretos rastreados."
