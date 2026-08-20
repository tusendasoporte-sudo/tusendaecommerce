[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^https://')][string]$PocketBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^https://')][string]$ApiBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]{6,30}$')][string]$GoogleCloudOrganizationId,
    [string]$GoogleCloudBillingAccount,
    [string]$EngineRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
    [string]$AndroidSdk = 'E:\Android\Sdk',
    [string]$GoogleCloudSdk = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk",
    [ValidatePattern('^[A-Za-z0-9 ÁÉÍÓÚáéíóúÑñ._-]{3,80}$')][string]$ShortcutName = 'Tu Senda 84 - Ejecutar runner',
    [switch]$AllowFirebase,
    [switch]$AllowSigning,
    [switch]$RegisterNow
)

$ErrorActionPreference = 'Stop'

function Resolve-ExistingDirectory {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Label)
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { throw "No existe ${Label}: $resolved" }
    return [IO.Path]::GetFullPath($resolved).TrimEnd('\', '/')
}

function Quote-ShortcutArgument {
    param([Parameter(Mandatory = $true)][string]$Value)
    if ($Value.Contains('"')) { throw 'Los parámetros del acceso directo no pueden contener comillas.' }
    return '"' + $Value + '"'
}

$resolvedEngineRoot = Resolve-ExistingDirectory -Path $EngineRoot -Label 'EngineRoot'
$resolvedSecretsRoot = Resolve-ExistingDirectory -Path $SecretsRoot -Label 'SecretsRoot'
$invokeRunner = Join-Path $resolvedEngineRoot 'mobile-storefront\runner\invoke-local-runner.ps1'
if (-not (Test-Path -LiteralPath $invokeRunner -PathType Leaf)) { throw "Falta el invocador del runner en $invokeRunner." }
foreach ($credential in @('runner-secret.dpapi', 'keystore-password.dpapi', 'key-password.dpapi')) {
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedSecretsRoot $credential) -PathType Leaf)) {
        throw "Falta la credencial DPAPI $credential en la custodia privada."
    }
}

Push-Location -LiteralPath $resolvedEngineRoot
try {
    $revision = ([string](& git rev-parse HEAD 2>$null)).Trim().ToLowerInvariant()
    $changes = @(& git status --porcelain --untracked-files=normal 2>$null)
    if ($LASTEXITCODE -ne 0 -or $revision -cnotmatch '^[a-f0-9]{40}$') {
        throw 'EngineRoot no es un checkout Git válido.'
    }
    if ($changes.Count -ne 0) { throw 'EngineRoot debe estar limpio antes de crear el acceso directo.' }
} finally { Pop-Location }

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powershell -PathType Leaf)) { throw 'No se encontró Windows PowerShell.' }
$argumentParts = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Quote-ShortcutArgument $invokeRunner),
    '-PocketBaseUrl', (Quote-ShortcutArgument $PocketBaseUrl.TrimEnd('/')),
    '-ApiBaseUrl', (Quote-ShortcutArgument $ApiBaseUrl.TrimEnd('/')),
    '-RunnerId', (Quote-ShortcutArgument $RunnerId),
    '-SecretsRoot', (Quote-ShortcutArgument $resolvedSecretsRoot),
    '-GoogleCloudOrganizationId', (Quote-ShortcutArgument $GoogleCloudOrganizationId),
    '-JavaHome', (Quote-ShortcutArgument $JavaHome),
    '-AndroidSdk', (Quote-ShortcutArgument $AndroidSdk),
    '-GoogleCloudSdk', (Quote-ShortcutArgument $GoogleCloudSdk),
    '-BuildOnly',
    '-Once'
)
if ($GoogleCloudBillingAccount) {
    $argumentParts += @('-GoogleCloudBillingAccount', (Quote-ShortcutArgument $GoogleCloudBillingAccount))
}
if ($AllowFirebase) { $argumentParts += '-AuthorizeFirebase' }
if ($AllowSigning) { $argumentParts += '-AuthorizeSigning' }

$desktop = [Environment]::GetFolderPath('DesktopDirectory')
if (-not $desktop) { throw 'No se pudo resolver el escritorio del usuario actual.' }
$shortcutPath = Join-Path $desktop "$ShortcutName.lnk"

if ($PSCmdlet.ShouldProcess($shortcutPath, 'Registrar runner manual y crear acceso directo de ejecución única')) {
    if ($RegisterNow) {
        & $invokeRunner `
            -PocketBaseUrl $PocketBaseUrl `
            -ApiBaseUrl $ApiBaseUrl `
            -RunnerId $RunnerId `
            -SecretsRoot $resolvedSecretsRoot `
            -GoogleCloudOrganizationId $GoogleCloudOrganizationId `
            -GoogleCloudBillingAccount $GoogleCloudBillingAccount `
            -JavaHome $JavaHome `
            -AndroidSdk $AndroidSdk `
            -GoogleCloudSdk $GoogleCloudSdk `
            -AuthorizeFirebase:$AllowFirebase `
            -AuthorizeSigning:$AllowSigning `
            -HeartbeatOnly `
            -Once
    }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = $argumentParts -join ' '
    $shortcut.WorkingDirectory = $resolvedEngineRoot
    $shortcut.WindowStyle = 1
    $shortcut.Description = "Ejecuta un solo trabajo Android autorizado para $RunnerId"
    $shortcut.IconLocation = "$powershell,0"
    $shortcut.Save()
}

[pscustomobject]@{
    Installed = -not [bool]$WhatIfPreference
    ShortcutPath = $shortcutPath
    RunnerId = $RunnerId
    EngineRoot = $resolvedEngineRoot
    EngineRevision = $revision
    FirebaseAllowed = [bool]$AllowFirebase
    SigningAllowed = [bool]$AllowSigning
    RegisteredNow = [bool]$RegisterNow -and -not [bool]$WhatIfPreference
    ExecutesOneJob = $true
    PersistentProcess = $false
    SecretsInShortcutArguments = $false
}
