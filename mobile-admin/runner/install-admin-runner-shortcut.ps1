[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [string]$EngineRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
    [string]$AndroidSdk = 'E:\Android\Sdk',
    [ValidatePattern('^[A-Za-z0-9 ÁÉÍÓÚáéíóúÑñ._-]{3,80}$')][string]$ShortcutName = 'Tu Senda 84 - Construir App Admin',
    [switch]$RegisterNow
)

$ErrorActionPreference = 'Stop'

function Resolve-ExistingDirectory {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Label)
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { throw "No existe $Label : $resolved" }
    return [IO.Path]::GetFullPath($resolved).TrimEnd('\', '/')
}

function Quote-ShortcutArgument {
    param([Parameter(Mandatory = $true)][string]$Value)
    if ($Value.Contains('"')) { throw 'Los parámetros del acceso directo no pueden contener comillas.' }
    return '"' + $Value + '"'
}

$resolvedEngineRoot = Resolve-ExistingDirectory -Path $EngineRoot -Label 'EngineRoot'
$resolvedSecretsRoot = Resolve-ExistingDirectory -Path $SecretsRoot -Label 'SecretsRoot'
$invokeRunner = Join-Path $resolvedEngineRoot 'mobile-admin\runner\invoke-admin-runner.ps1'
if (-not (Test-Path -LiteralPath $invokeRunner -PathType Leaf)) { throw "Falta el invocador del Runner Admin en $invokeRunner." }
foreach ($credential in @('runner-secret.dpapi', 'admin-runner-settings.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedSecretsRoot $credential) -PathType Leaf)) {
        throw "Falta $credential en la custodia privada del Runner Admin."
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
} finally {
    Pop-Location
}

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powershell -PathType Leaf)) { throw 'No se encontró Windows PowerShell.' }
$argumentParts = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Quote-ShortcutArgument $invokeRunner),
    '-ApiBaseUrl', (Quote-ShortcutArgument $ApiBaseUrl.TrimEnd('/')),
    '-RunnerId', (Quote-ShortcutArgument $RunnerId),
    '-SecretsRoot', (Quote-ShortcutArgument $resolvedSecretsRoot),
    '-JavaHome', (Quote-ShortcutArgument $JavaHome),
    '-AndroidSdk', (Quote-ShortcutArgument $AndroidSdk),
    '-Once'
)

$desktop = [Environment]::GetFolderPath('DesktopDirectory')
if (-not $desktop) { throw 'No se pudo resolver el escritorio del usuario actual.' }
$shortcutPath = Join-Path $desktop ($ShortcutName + '.lnk')

if ($PSCmdlet.ShouldProcess($shortcutPath, 'Registrar el Runner Admin y crear un acceso directo de ejecución única')) {
    if ($RegisterNow) {
        $registrationArguments = @{
            ApiBaseUrl = $ApiBaseUrl
            RunnerId = $RunnerId
            SecretsRoot = $resolvedSecretsRoot
            JavaHome = $JavaHome
            AndroidSdk = $AndroidSdk
            HeartbeatOnly = $true
            Once = $true
        }
        & $invokeRunner @registrationArguments
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = $argumentParts -join ' '
    $shortcut.WorkingDirectory = $resolvedEngineRoot
    $shortcut.WindowStyle = 1
    $shortcut.Description = "Ejecuta un solo build Admin previamente autorizado para $RunnerId"
    $shortcut.IconLocation = "$powershell,0"
    $shortcut.Save()
}

[pscustomobject]@{
    Installed = -not [bool]$WhatIfPreference
    ShortcutPath = $shortcutPath
    RunnerId = $RunnerId
    EngineRoot = $resolvedEngineRoot
    EngineRevision = $revision
    RegisteredNow = [bool]$RegisterNow -and -not [bool]$WhatIfPreference
    ExecutesOneJob = $true
    PersistentProcess = $false
    SecretsInShortcutArguments = $false
}
