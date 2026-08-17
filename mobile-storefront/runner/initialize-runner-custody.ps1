[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [switch]$CopyRunnerSecretToClipboard
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $mobileRoot
$resolvedRepositoryRoot = [IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\', '/')
$resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot).TrimEnd('\', '/')
$repositoryPrefix = $resolvedRepositoryRoot + [IO.Path]::DirectorySeparatorChar
if ($resolvedSecretsRoot.Equals($resolvedRepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedSecretsRoot.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'SecretsRoot debe estar fuera del repositorio.'
}

$protectedFiles = [ordered]@{
    RunnerSecret = Join-Path $resolvedSecretsRoot 'runner-secret.dpapi'
    KeystorePassword = Join-Path $resolvedSecretsRoot 'keystore-password.dpapi'
    KeyPassword = Join-Path $resolvedSecretsRoot 'key-password.dpapi'
}
foreach ($path in $protectedFiles.Values) {
    if (Test-Path -LiteralPath $path) { throw 'La custodia ya fue inicializada; se prohibe sobrescribir credenciales.' }
}

function New-RandomSecret {
    param([ValidateRange(24, 128)][int]$ByteCount)
    $bytes = New-Object byte[] $ByteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Protect-Secret {
    param([Parameter(Mandatory = $true)][string]$Value, [Parameter(Mandatory = $true)][string]$Path)
    $secure = ConvertTo-SecureString $Value -AsPlainText -Force
    ConvertFrom-SecureString $secure | Set-Content -LiteralPath $Path -Encoding ASCII -NoNewline
}

New-Item -ItemType Directory -Path $resolvedSecretsRoot -Force | Out-Null
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $resolvedSecretsRoot '/inheritance:r' '/grant:r' "${principal}:(OI)(CI)F" `
    'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' *> $null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo restringir la carpeta privada del runner.' }

$runnerSecret = New-RandomSecret -ByteCount 48
$keystorePassword = New-RandomSecret -ByteCount 36
$keyPassword = New-RandomSecret -ByteCount 36
try {
    Protect-Secret -Value $runnerSecret -Path $protectedFiles.RunnerSecret
    Protect-Secret -Value $keystorePassword -Path $protectedFiles.KeystorePassword
    Protect-Secret -Value $keyPassword -Path $protectedFiles.KeyPassword
    New-Item -ItemType Directory -Path (Join-Path $resolvedSecretsRoot 'gcloud') -Force | Out-Null
    if ($CopyRunnerSecretToClipboard) {
        Set-Clipboard -Value $runnerSecret
        Write-Warning 'El secreto del runner esta temporalmente en el portapapeles. Borralo despues de configurarlo en el backend.'
    }
    [pscustomobject]@{
        Initialized = $true
        SecretsRoot = $resolvedSecretsRoot
        Protection = 'Windows DPAPI CurrentUser'
        RunnerSecretCopied = [bool]$CopyRunnerSecretToClipboard
    }
} finally {
    $runnerSecret = $null
    $keystorePassword = $null
    $keyPassword = $null
}
