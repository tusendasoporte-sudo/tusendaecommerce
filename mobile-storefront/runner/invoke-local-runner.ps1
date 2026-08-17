[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^https://')][string]$PocketBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^https://')][string]$ApiBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]{6,30}$')][string]$GoogleCloudOrganizationId,
    [string]$GoogleCloudBillingAccount,
    [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
    [string]$AndroidSdk = 'E:\Android\Sdk',
    [string]$GoogleCloudSdk = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk",
    [switch]$AuthorizeFirebase,
    [switch]$AuthorizeSigning,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$queue = Join-Path $PSScriptRoot 'run-job-queue.ps1'
$resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot)

function Unprotect-Secret {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Falta la credencial protegida $Path." }
    $secure = ConvertTo-SecureString (Get-Content -LiteralPath $Path -Raw -Encoding ASCII)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

foreach ($requiredPath in @(
    (Join-Path $JavaHome 'bin\java.exe'),
    (Join-Path $JavaHome 'bin\keytool.exe'),
    $AndroidSdk,
    (Join-Path $GoogleCloudSdk 'bin\gcloud.cmd')
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Falta el requisito local $requiredPath." }
}

$previous = @{}
$names = @(
    'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'CLOUDSDK_CONFIG',
    'PZ_STORE_APP_RUNNER_SECRET', 'PZ_STORE_APP_KEYSTORE_PASSWORD', 'PZ_STORE_APP_KEY_PASSWORD',
    'PZ_STORE_APP_RUNNER_ALLOW_FIREBASE', 'PZ_STORE_APP_RUNNER_ALLOW_SIGNING',
    'PZ_GOOGLE_CLOUD_ORGANIZATION_ID', 'PZ_GOOGLE_CLOUD_BILLING_ACCOUNT', 'PZ_STOREFRONT_API_BASE_URL', 'PATH'
)
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

$runnerSecret = Unprotect-Secret -Path (Join-Path $resolvedSecretsRoot 'runner-secret.dpapi')
$keystorePassword = Unprotect-Secret -Path (Join-Path $resolvedSecretsRoot 'keystore-password.dpapi')
$keyPassword = Unprotect-Secret -Path (Join-Path $resolvedSecretsRoot 'key-password.dpapi')
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidSdk
    $env:ANDROID_SDK_ROOT = $AndroidSdk
    $env:CLOUDSDK_CONFIG = Join-Path $resolvedSecretsRoot 'gcloud'
    $env:PATH = "$(Join-Path $GoogleCloudSdk 'bin');$(Join-Path $JavaHome 'bin');$($previous.PATH)"
    $env:PZ_STORE_APP_RUNNER_SECRET = $runnerSecret
    $env:PZ_STORE_APP_KEYSTORE_PASSWORD = $keystorePassword
    $env:PZ_STORE_APP_KEY_PASSWORD = $keyPassword
    $env:PZ_STORE_APP_RUNNER_ALLOW_FIREBASE = if ($AuthorizeFirebase) { 'true' } else { 'false' }
    $env:PZ_STORE_APP_RUNNER_ALLOW_SIGNING = if ($AuthorizeSigning) { 'true' } else { 'false' }
    $env:PZ_GOOGLE_CLOUD_ORGANIZATION_ID = $GoogleCloudOrganizationId
    $env:PZ_GOOGLE_CLOUD_BILLING_ACCOUNT = $GoogleCloudBillingAccount
    $env:PZ_STOREFRONT_API_BASE_URL = $ApiBaseUrl
    & $queue -PocketBaseUrl $PocketBaseUrl -RunnerId $RunnerId -SecretsRoot $resolvedSecretsRoot -Once:$Once
} finally {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    $runnerSecret = $null
    $keystorePassword = $null
    $keyPassword = $null
}
