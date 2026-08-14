[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SecretDirectory,

    [string]$KeytoolPath = 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$resolvedSecretDirectory = [System.IO.Path]::GetFullPath($SecretDirectory)
$root = [System.IO.Path]::GetPathRoot($resolvedSecretDirectory)
if ([string]::IsNullOrWhiteSpace($resolvedSecretDirectory) -or
    $resolvedSecretDirectory.TrimEnd('\') -eq $root.TrimEnd('\')) {
    throw 'SecretDirectory no puede ser una raiz de volumen.'
}
if (-not (Test-Path -LiteralPath $KeytoolPath -PathType Leaf)) {
    throw "No se encontro keytool en la ruta indicada."
}

$keystorePath = Join-Path $resolvedSecretDirectory 'powerzona-storefront-staging.jks'
$propertiesPath = Join-Path $resolvedSecretDirectory 'mobile-storefront-staging.properties'
$alias = 'powerzona-storefront-staging'
if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
    throw 'La identidad de staging ya existe. El script no sobrescribe claves ni propiedades.'
}

New-Item -ItemType Directory -Force -Path $resolvedSecretDirectory | Out-Null

$randomBytes = New-Object byte[] 32
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $randomGenerator.GetBytes($randomBytes)
}
finally {
    $randomGenerator.Dispose()
}
$password = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$passwordEnvironmentName = 'PZ_C06A_KEYSTORE_PASSWORD_EPHEMERAL'

try {
    [Environment]::SetEnvironmentVariable($passwordEnvironmentName, $password, 'Process')
    & $KeytoolPath -genkeypair `
        -alias $alias `
        -keyalg RSA `
        -keysize 3072 `
        -sigalg SHA256withRSA `
        -validity 3650 `
        -storetype PKCS12 `
        -keystore $keystorePath `
        -storepass:env $passwordEnvironmentName `
        -keypass:env $passwordEnvironmentName `
        -dname 'CN=PowerZona Storefront Staging, OU=Tu Senda 84 Staging, O=Tu Senda 84, C=US' `
        -noprompt
    if ($LASTEXITCODE -ne 0) {
        throw 'keytool no pudo generar la identidad de staging.'
    }

    $properties = @(
        'storeFile=powerzona-storefront-staging.jks'
        "storePassword=$password"
        "keyAlias=$alias"
        "keyPassword=$password"
        ''
    ) -join "`n"
    [System.IO.File]::WriteAllText(
        $propertiesPath,
        $properties,
        [System.Text.UTF8Encoding]::new($false)
    )

    $details = & $KeytoolPath -list -v `
        -keystore $keystorePath `
        -alias $alias `
        -storepass:env $passwordEnvironmentName
    if ($LASTEXITCODE -ne 0) {
        throw 'keytool no pudo verificar la identidad generada.'
    }
    $fingerprintLine = $details | Where-Object { $_ -match '^\s*SHA256:\s*([0-9A-F:]{95})\s*$' } | Select-Object -First 1
    if (-not $fingerprintLine) {
        throw 'No se encontro la huella SHA-256 en la salida de keytool.'
    }
    $fingerprint = ([regex]::Match($fingerprintLine, '([0-9A-F]{2}:){31}[0-9A-F]{2}')).Value
    if ([string]::IsNullOrWhiteSpace($fingerprint)) {
        throw 'La huella SHA-256 generada no tiene el formato esperado.'
    }

    [pscustomobject]@{
        KeystorePath = $keystorePath
        PropertiesPath = $propertiesPath
        Alias = $alias
        CertificateSha256 = $fingerprint
    }
}
finally {
    [Environment]::SetEnvironmentVariable($passwordEnvironmentName, $null, 'Process')
    if ($password) {
        $password = $null
    }
    [Array]::Clear($randomBytes, 0, $randomBytes.Length)
}
