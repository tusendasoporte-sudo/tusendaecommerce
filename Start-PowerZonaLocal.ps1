[CmdletBinding()]
param(
  [string]$SecretFile = '',
  [switch]$RestartFrontend,
  [switch]$OpenBrowser,
  [int]$PocketBaseTimeoutSeconds = 45,
  [int]$AstroTimeoutSeconds = 75
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$PocketBaseUrl = 'http://127.0.0.1:8091'
$PocketBaseHttp = '127.0.0.1:8091'
$AstroUrl = 'http://localhost:4321'
$AstroPort = 4321

function Get-DefaultSecretFile {
  $base = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($base)) { $base = $env:LOCALAPPDATA }
  if ([string]::IsNullOrWhiteSpace($base)) {
    throw 'No se pudo resolver LOCALAPPDATA para cargar secretos locales.'
  }
  return (Join-Path (Join-Path $base 'PowerZona') 'security.local.env')
}

function Resolve-SecretPath([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { $PathValue = Get-DefaultSecretFile }
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Normalize-PathForCompare([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return '' }
  try {
    return ([System.IO.Path]::GetFullPath($PathValue)).TrimEnd([char[]]@('\', '/')).ToLowerInvariant()
  } catch {
    return ''
  }
}

function Normalize-CommandText([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  return $Value.Replace('/', '\').ToLowerInvariant()
}

function Quote-ProcessArgument([string]$Value) {
  if ($null -eq $Value) { return '""' }
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Get-ProcessInfoByPid([int]$PidValue) {
  $name = ''
  $path = ''
  $commandLine = ''

  try {
    $process = Get-Process -Id $PidValue -ErrorAction SilentlyContinue
    if ($process) {
      $name = [string]$process.ProcessName
      try { $path = [string]$process.Path } catch {}
    }
  } catch {}

  try {
    $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PidValue" -ErrorAction SilentlyContinue
    if ($cim) {
      if ([string]::IsNullOrWhiteSpace($name)) { $name = [string]$cim.Name }
      if ([string]::IsNullOrWhiteSpace($path)) { $path = [string]$cim.ExecutablePath }
      $commandLine = [string]$cim.CommandLine
    }
  } catch {}

  return [pscustomobject]@{
    Pid = $PidValue
    Name = $name
    Path = $path
    CommandLine = $commandLine
  }
}

function Get-PortListeners([int]$Port) {
  $pids = @()

  try {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    foreach ($connection in $connections) {
      $pidValue = [int]$connection.OwningProcess
      if ($pidValue -gt 0 -and -not $pids.Contains($pidValue)) { $pids += $pidValue }
    }
  } catch {
    try {
      $lines = & netstat -ano -p tcp 2>$null
      foreach ($line in $lines) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
          $linePort = [int]$Matches[1]
          $pidValue = [int]$Matches[2]
          if ($linePort -eq $Port -and $pidValue -gt 0 -and -not $pids.Contains($pidValue)) { $pids += $pidValue }
        }
      }
    } catch {}
  }

  $listeners = @()
  foreach ($pidValue in @($pids | Sort-Object -Unique)) {
    $listeners += Get-ProcessInfoByPid $pidValue
  }
  return $listeners
}

function Format-ListenerLine([object]$Listener) {
  $name = [string]$Listener.Name
  $path = [string]$Listener.Path
  if ([string]::IsNullOrWhiteSpace($name)) { $name = 'desconocido' }
  if ([string]::IsNullOrWhiteSpace($path)) { $path = 'ruta no disponible' }
  return "PID $($Listener.Pid), proceso $name, ruta $path"
}

function Wait-PortFree([int]$Port, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $listeners = @(Get-PortListeners $Port)
    if ($listeners.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Test-FrontendProcessForRepo([object]$Listener, [string]$FrontendDir) {
  $frontendNeedle = Normalize-CommandText ([System.IO.Path]::GetFullPath($FrontendDir))
  $commandText = Normalize-CommandText ([string]$Listener.CommandLine)
  if ([string]::IsNullOrWhiteSpace($commandText)) { return $false }
  if (-not $commandText.Contains($frontendNeedle)) { return $false }
  return ($commandText.Contains('astro') -or $commandText.Contains('npm') -or $commandText.Contains(':4321') -or $commandText.Contains('--port 4321'))
}

function Assert-AstroPortAvailable([int]$Port, [string]$FrontendDir, [bool]$AllowRestart) {
  $listeners = @(Get-PortListeners $Port)
  if ($listeners.Count -eq 0) {
    Write-Host "Preflight puerto ${Port}: libre"
    return
  }

  $listenerDetails = ($listeners | ForEach-Object { Format-ListenerLine $_ }) -join '; '
  Write-Host "Preflight puerto ${Port}: ocupado por $listenerDetails"
  if (-not $AllowRestart) {
    throw "El puerto $Port esta ocupado. No se detuvo ningun proceso Node. Cierre el proceso o ejecute con -RestartFrontend si es el Astro de este repositorio."
  }

  foreach ($listener in $listeners) {
    if (-not (Test-FrontendProcessForRepo $listener $FrontendDir)) {
      throw "El puerto $Port esta ocupado por un proceso que no se pudo verificar como Astro de este repositorio. No se detuvo ningun proceso."
    }
  }

  foreach ($listener in $listeners) {
    Write-Host "Deteniendo Astro PowerZona anterior (PID $($listener.Pid))."
    Stop-Process -Id $listener.Pid -ErrorAction Stop
  }

  if (-not (Wait-PortFree $Port 15)) {
    throw "El puerto $Port sigue ocupado despues de detener Astro PowerZona anterior."
  }

  Write-Host "Preflight puerto ${Port}: libre despues de reinicio"
}

function Get-HttpStatus([string]$Uri) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -Method GET -UseBasicParsing -TimeoutSec 3
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    return 0
  }
}

function Wait-HttpReady([string]$Uri, [int]$TimeoutSeconds, [string]$Name) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $status = Get-HttpStatus $Uri
    if ($status -ge 200 -and $status -lt 400) { return $status }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  throw "$Name no respondio en $Uri dentro de $TimeoutSeconds segundos."
}

$repoRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$backendDir = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'backend-powerzona'))
$frontendDir = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'frontend-powerzona'))
$setupScript = [System.IO.Path]::GetFullPath((Join-Path $backendDir 'scripts\Setup-SecurityLocal.ps1'))
$backendLauncher = [System.IO.Path]::GetFullPath((Join-Path $backendDir 'scripts\Start-PocketBaseLocal.ps1'))
$secretPath = Resolve-SecretPath $SecretFile

foreach ($requiredPath in @($backendDir, $frontendDir)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Container)) {
    throw "Ruta requerida no encontrada: $requiredPath"
  }
}
foreach ($requiredFile in @($setupScript, $backendLauncher)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Archivo requerido no encontrado: $requiredFile"
  }
}

Write-Host 'PowerZona local: preparando secretos externos.'
& $setupScript -SecretFile $secretPath
$setupExitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
$setupExitCode = if ($setupExitCodeVariable) { [int]$setupExitCodeVariable.Value } else { 0 }
if ($setupExitCode -ne 0) { exit $setupExitCode }

Assert-AstroPortAvailable $AstroPort $frontendDir ([bool]$RestartFrontend)

Write-Host "Iniciando PocketBase PowerZona en $PocketBaseUrl"
$pbArgs = @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (Quote-ProcessArgument $backendLauncher),
  '-Http',
  $PocketBaseHttp,
  '-RestartExisting'
)
if (-not [string]::IsNullOrWhiteSpace($SecretFile)) {
  $pbArgs += @('-SecretFile', (Quote-ProcessArgument $secretPath))
}
[void](Start-Process -FilePath 'powershell.exe' -ArgumentList ($pbArgs -join ' ') -WorkingDirectory $backendDir -PassThru)

[void](Wait-HttpReady "$PocketBaseUrl/api/health" $PocketBaseTimeoutSeconds 'PocketBase')
Write-Host "PocketBase listo en $PocketBaseUrl"
Write-Host 'Backend de Seguridad listo.'

Write-Host "Iniciando Astro en $AstroUrl"
$frontendCommand = "`$env:PUBLIC_POCKETBASE_URL = '$PocketBaseUrl'; npm.cmd run dev -- --host localhost --port $AstroPort"
$frontendArgs = @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  (Quote-ProcessArgument $frontendCommand)
)
[void](Start-Process -FilePath 'powershell.exe' -ArgumentList ($frontendArgs -join ' ') -WorkingDirectory $frontendDir -PassThru)

[void](Wait-HttpReady $AstroUrl $AstroTimeoutSeconds 'Astro')
Write-Host "Frontend listo en $AstroUrl"
Write-Host "Astro usa PUBLIC_POCKETBASE_URL=$PocketBaseUrl"

if ($OpenBrowser) {
  Start-Process $AstroUrl
}

Write-Host 'Launcher principal finalizado. Las consolas hijas quedan abiertas.'
