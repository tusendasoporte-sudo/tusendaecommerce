[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigKey,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [Parameter(Mandatory = $true)][ValidateSet('app', 'upload')][string]$KeyPurpose,
    [Parameter(Mandatory = $true)][string]$ConfirmedPreviewPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ConfirmedPreviewHash
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $mobileRoot
$resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot)
if ($resolvedSecretsRoot.StartsWith($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'SecretsRoot debe estar fuera del repositorio.'
}
$preview = Get-Content -LiteralPath $ConfirmedPreviewPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($preview.preview_hash -ne $ConfirmedPreviewHash -or $preview.payload.config_key -ne $ConfigKey) {
    throw 'La confirmacion no coincide con la vista previa.'
}
$payload = $preview.payload
if (@('provision', 'update') -notcontains [string]$payload.operation) {
    throw 'La operacion confirmada no admite generar firmas.'
}
if ($KeyPurpose -eq 'app') {
    if ($payload.operation -ne 'provision' -or -not [bool]$payload.signing.create_app_signing_key) {
        throw 'Solo el aprovisionamiento inicial confirmado puede generar la firma principal.'
    }
} else {
    if (-not [bool]$payload.build.aab) { throw 'Esta tienda no utiliza clave de subida.' }
    if (-not [bool]$payload.signing.create_play_upload_key) {
        throw 'La vista previa confirmada no autoriza generar la firma de subida.'
    }
}

$storePassword = [string]$env:PZ_STORE_APP_KEYSTORE_PASSWORD
$keyPassword = [string]$env:PZ_STORE_APP_KEY_PASSWORD
if ($storePassword.Length -lt 16 -or $keyPassword.Length -lt 16) { throw 'Faltan contrasenas robustas en el almacen seguro del runner.' }
$safeKey = $ConfigKey -replace '[^a-z0-9-]', '-'
$targetDirectory = Join-Path $resolvedSecretsRoot $safeKey
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
$keystorePath = Join-Path $targetDirectory "$KeyPurpose-signing.p12"
$propertiesPath = Join-Path $targetDirectory "$KeyPurpose-signing.properties"
if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
    throw 'La firma ya existe; se prohibe rotarla o sobrescribirla automaticamente.'
}

$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { $keytool = 'keytool.exe' }
$alias = "tusenda84-$safeKey-$KeyPurpose"
$distinguishedName = "CN=Tu Senda 84, OU=Android, O=Tu Senda 84, L=Havana, C=CU"
$env:PZ_KEYTOOL_STORE_PASSWORD = $storePassword
$env:PZ_KEYTOOL_KEY_PASSWORD = $keyPassword
try {
    & $keytool -genkeypair -noprompt -storetype PKCS12 -keystore $keystorePath -alias $alias `
        -keyalg RSA -keysize 4096 -validity 9125 -dname $distinguishedName `
        -storepass:env PZ_KEYTOOL_STORE_PASSWORD -keypass:env PZ_KEYTOOL_KEY_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'keytool no pudo crear la firma.' }
    @(
        "storeFile=$keystorePath"
        "storePassword=$storePassword"
        "keyAlias=$alias"
        "keyPassword=$keyPassword"
    ) | Set-Content -LiteralPath $propertiesPath -Encoding ASCII
    $certificate = & $keytool -list -v -keystore $keystorePath -alias $alias `
        -storepass:env PZ_KEYTOOL_STORE_PASSWORD 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el certificado generado.' }
    $fingerprintLine = $certificate | Where-Object { $_ -match 'SHA256:\s*((?:[A-F0-9]{2}:){31}[A-F0-9]{2})' } | Select-Object -First 1
    if (-not $fingerprintLine -or $fingerprintLine -notmatch 'SHA256:\s*((?:[A-F0-9]{2}:){31}[A-F0-9]{2})') {
        throw 'No se pudo extraer la huella SHA-256 de la firma.'
    }
    [pscustomobject]@{ PropertiesPath = $propertiesPath; CertificateSha256 = $Matches[1]; Purpose = $KeyPurpose }
} finally {
    Remove-Item Env:PZ_KEYTOOL_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PZ_KEYTOOL_KEY_PASSWORD -ErrorAction SilentlyContinue
    $storePassword = $null
    $keyPassword = $null
}
