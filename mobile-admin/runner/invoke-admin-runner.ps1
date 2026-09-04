[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
    [string]$AndroidSdk = 'E:\Android\Sdk',
    [switch]$ServiceMode,
    [switch]$HeartbeatOnly,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$queuePath = Join-Path $PSScriptRoot 'run-admin-app-job-queue.ps1'
$resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot)
$settingsPath = Join-Path $resolvedSecretsRoot 'admin-runner-settings.json'
$secretPath = Join-Path $resolvedSecretsRoot 'runner-secret.dpapi'

function Unprotect-Secret {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Falta la credencial protegida $Path." }
    $secure = ConvertTo-SecureString (Get-Content -LiteralPath $Path -Raw -Encoding ASCII)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

foreach ($requiredPath in @(
    $queuePath,
    $settingsPath,
    (Join-Path $JavaHome 'bin\java.exe'),
    (Join-Path $JavaHome 'bin\keytool.exe'),
    $AndroidSdk
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Falta el requisito local $requiredPath." }
}

$settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([int]$settings.schema_version -ne 1) { throw 'La configuración privada del Runner Admin no es compatible.' }
$signingPropertiesPath = [string]$settings.signing_properties_path
if (-not (Test-Path -LiteralPath $signingPropertiesPath -PathType Leaf)) {
    throw 'No existe el archivo de firma configurado para Mobile Admin.'
}

$previous = @{}
$environmentNames = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'PZ_ADMIN_APP_RUNNER_SECRET', 'PATH')
foreach ($name in $environmentNames) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$runnerSecret = Unprotect-Secret -Path $secretPath
if ($runnerSecret.Length -lt 32) { throw 'La credencial protegida del Runner Admin no es válida.' }
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidSdk
    $env:ANDROID_SDK_ROOT = $AndroidSdk
    $env:PATH = "$(Join-Path $JavaHome 'bin');$($previous.PATH)"
    $env:PZ_ADMIN_APP_RUNNER_SECRET = $runnerSecret

    $queueArguments = @{
        ApiBaseUrl = $ApiBaseUrl
        RunnerId = $RunnerId
        SigningPropertiesPath = $signingPropertiesPath
        ServiceMode = [bool]$ServiceMode
        HeartbeatOnly = [bool]$HeartbeatOnly
        Once = [bool]$Once
    }
    & $queuePath @queueArguments
} finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    $runnerSecret = $null
}
