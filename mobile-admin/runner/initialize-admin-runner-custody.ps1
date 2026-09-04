[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [Parameter(Mandatory = $true)][string]$SigningPropertiesPath,
    [switch]$CopyRunnerSecretToClipboard
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $mobileRoot
$resolvedRepositoryRoot = [IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\', '/')
$resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot).TrimEnd('\', '/')
$resolvedSigningPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SigningPropertiesPath)
$repositoryPrefix = $resolvedRepositoryRoot + [IO.Path]::DirectorySeparatorChar

if ($resolvedSecretsRoot.Equals($resolvedRepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedSecretsRoot.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'SecretsRoot debe estar fuera del repositorio.'
}
if (-not (Test-Path -LiteralPath $resolvedSigningPath -PathType Leaf)) {
    throw 'No existe el archivo externo de firma de Mobile Admin.'
}
if ($resolvedSigningPath.Equals($resolvedRepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedSigningPath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La firma de Mobile Admin debe permanecer fuera del repositorio.'
}

$secretPath = Join-Path $resolvedSecretsRoot 'runner-secret.dpapi'
$settingsPath = Join-Path $resolvedSecretsRoot 'admin-runner-settings.json'
foreach ($path in @($secretPath, $settingsPath)) {
    if (Test-Path -LiteralPath $path) {
        throw 'La custodia del Runner Admin ya fue inicializada; se prohíbe sobrescribirla.'
    }
}

function New-RandomSecret {
    param([ValidateRange(24, 128)][int]$ByteCount)
    $bytes = New-Object byte[] $ByteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

New-Item -ItemType Directory -Path $resolvedSecretsRoot -Force | Out-Null
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$aclArguments = @(
    $resolvedSecretsRoot,
    '/inheritance:r',
    '/grant:r',
    ($principal + ':(OI)(CI)F'),
    'SYSTEM:(OI)(CI)F',
    'BUILTIN\Administrators:(OI)(CI)F'
)
& icacls.exe @aclArguments *> $null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir la carpeta privada del Runner Admin.' }

$runnerSecret = New-RandomSecret -ByteCount 48
try {
    $secure = ConvertTo-SecureString $runnerSecret -AsPlainText -Force
    ConvertFrom-SecureString $secure | Set-Content -LiteralPath $secretPath -Encoding ASCII -NoNewline
    [ordered]@{
        schema_version = 1
        signing_properties_path = $resolvedSigningPath
    } | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding UTF8

    if ($CopyRunnerSecretToClipboard) {
        Set-Clipboard -Value $runnerSecret
        Write-Warning 'El secreto del Runner Admin está temporalmente en el portapapeles. Configúralo como PZ_ADMIN_APP_RUNNER_SECRET y después borra el portapapeles.'
    }

    [pscustomobject]@{
        Initialized = $true
        SecretsRoot = $resolvedSecretsRoot
        SigningPropertiesPath = $resolvedSigningPath
        Protection = 'Windows DPAPI CurrentUser'
        RunnerSecretCopied = [bool]$CopyRunnerSecretToClipboard
    }
} finally {
    $runnerSecret = $null
}
