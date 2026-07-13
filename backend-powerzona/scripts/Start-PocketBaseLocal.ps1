[CmdletBinding()]
param(
  [string]$SecretFile = '',
  [string]$Http = '127.0.0.1:8091',
  [string]$DataDir = '',
  [switch]$RestartExisting
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

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

function Test-BackendHmacContract([string]$Value) {
  return -not [string]::IsNullOrWhiteSpace($Value) -and ([System.Text.Encoding]::UTF8.GetByteCount($Value) -ge 32)
}

function Test-BackendAesContract([string]$Value) {
  if ([string]::IsNullOrEmpty($Value) -or $Value.Length -ne 32) { return $false }
  foreach ($char in $Value.ToCharArray()) {
    $code = [int][char]$char
    if ($code -lt 33 -or $code -gt 126) { return $false }
  }
  return $true
}

function Read-SecuritySecretFile([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    throw 'El archivo de secretos locales no existe.'
  }

  $text = [System.IO.File]::ReadAllText($PathValue, [System.Text.Encoding]::UTF8)
  $lines = $text -split "\r?\n"
  while ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -eq '') {
    if ($lines.Count -eq 1) {
      $lines = @()
    } else {
      $lines = $lines[0..($lines.Count - 2)]
    }
  }
  if ($lines.Count -ne 2) { throw 'Formato invalido en archivo de secretos locales.' }

  $values = @{}
  foreach ($line in $lines) {
    if ($line -notmatch '^([A-Z0-9_]+)=([^\s]+)$') {
      throw 'Formato invalido en archivo de secretos locales.'
    }
    $key = $Matches[1]
    if ($values.ContainsKey($key)) { throw 'Clave duplicada en archivo de secretos locales.' }
    $values[$key] = $Matches[2]
  }

  if ($values.Keys.Count -ne 2 -or -not $values.ContainsKey('PZ_SECURITY_HMAC_SECRET') -or -not $values.ContainsKey('PZ_SECURITY_AES_KEY')) {
    throw 'El archivo de secretos locales contiene claves no permitidas.'
  }
  if ($values['PZ_SECURITY_HMAC_SECRET'] -notmatch '^[a-f0-9]{64}$' -or -not (Test-BackendHmacContract $values['PZ_SECURITY_HMAC_SECRET'])) {
    throw 'HMAC local invalida.'
  }
  if ($values['PZ_SECURITY_AES_KEY'] -notmatch '^[a-f0-9]{32}$' -or -not (Test-BackendAesContract $values['PZ_SECURITY_AES_KEY'])) {
    throw 'AES local invalida.'
  }

  return @{
    Hmac = $values['PZ_SECURITY_HMAC_SECRET']
    Aes = $values['PZ_SECURITY_AES_KEY']
  }
}

function Resolve-HttpEndpoint([string]$Value) {
  if ($Value -notmatch '^(127\.0\.0\.1|localhost|0\.0\.0\.0):([0-9]{1,5})$') {
    throw 'Parametro -Http invalido. Use host local y puerto, por ejemplo 127.0.0.1:8091.'
  }
  $port = [int]$Matches[2]
  if ($port -lt 1 -or $port -gt 65535) {
    throw 'Puerto invalido para PocketBase local.'
  }
  return [pscustomobject]@{
    Host = $Matches[1]
    Port = $port
  }
}

function Normalize-PathForCompare([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return '' }
  try {
    return ([System.IO.Path]::GetFullPath($PathValue)).TrimEnd([char[]]@('\', '/')).ToLowerInvariant()
  } catch {
    return ''
  }
}

function Get-ProcessInfoByPid([int]$PidValue) {
  $name = ''
  $path = ''

  try {
    $process = Get-Process -Id $PidValue -ErrorAction SilentlyContinue
    if ($process) {
      $name = [string]$process.ProcessName
      try { $path = [string]$process.Path } catch {}
    }
  } catch {}

  if ([string]::IsNullOrWhiteSpace($path)) {
    try {
      $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PidValue" -ErrorAction SilentlyContinue
      if ($cim) {
        if ([string]::IsNullOrWhiteSpace($name)) { $name = [string]$cim.Name }
        $path = [string]$cim.ExecutablePath
      }
    } catch {}
  }

  return [pscustomobject]@{
    Pid = $PidValue
    Name = $name
    Path = $path
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

function Get-PortBusyMessage([int]$Port) {
  $a = [string][char]0x00e1
  $e = [string][char]0x00e9
  return "El puerto $Port est${a} ocupado por un proceso PocketBase anterior. Det${e}n ese proceso o ejecuta el launcher con -RestartExisting. No se iniciar${a} otro servidor sin los secretos de Seguridad."
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

function Assert-PocketBasePortPreflight([object]$Endpoint, [string]$ExpectedPocketBaseExe, [bool]$AllowRestart) {
  $listeners = @(Get-PortListeners $Endpoint.Port)
  if ($listeners.Count -eq 0) {
    Write-Host "Preflight puerto $($Endpoint.Port): libre"
    return
  }

  $listenerDetails = ($listeners | ForEach-Object { Format-ListenerLine $_ }) -join '; '
  Write-Host "Preflight puerto $($Endpoint.Port): ocupado por $listenerDetails"
  $expectedPath = Normalize-PathForCompare $ExpectedPocketBaseExe

  if (-not $AllowRestart) {
    $allListenersAreCurrentPocketBase = $true
    foreach ($listener in $listeners) {
      $actualPath = Normalize-PathForCompare ([string]$listener.Path)
      if ([string]::IsNullOrWhiteSpace($actualPath) -or $actualPath -ne $expectedPath) {
        $allListenersAreCurrentPocketBase = $false
      }
    }
    if ($allListenersAreCurrentPocketBase) {
      throw (Get-PortBusyMessage $Endpoint.Port)
    }
    throw "El puerto $($Endpoint.Port) esta ocupado por un proceso que no corresponde al PocketBase de este proyecto. No se iniciara otro servidor sin verificar el proceso."
  }

  foreach ($listener in $listeners) {
    $actualPath = Normalize-PathForCompare ([string]$listener.Path)
    if ([string]::IsNullOrWhiteSpace($actualPath)) {
      throw "El puerto $($Endpoint.Port) esta ocupado por un proceso cuya ruta no se pudo verificar con seguridad (PID $($listener.Pid)). No se detendra automaticamente."
    }
    if ($actualPath -ne $expectedPath) {
      throw "El puerto $($Endpoint.Port) esta ocupado por un proceso externo (PID $($listener.Pid), ruta $($listener.Path)). No se detendra automaticamente."
    }
  }

  foreach ($listener in $listeners) {
    Write-Host "Deteniendo PocketBase local anterior (PID $($listener.Pid))."
    Stop-Process -Id $listener.Pid -ErrorAction Stop
  }

  if (-not (Wait-PortFree $Endpoint.Port 15)) {
    throw "El puerto $($Endpoint.Port) sigue ocupado despues de detener el PocketBase local anterior."
  }

  Write-Host "Preflight puerto $($Endpoint.Port): libre despues de reinicio"
}

function Get-ProjectPocketBaseProcesses([string]$ExpectedPocketBaseExe) {
  $expectedPath = Normalize-PathForCompare $ExpectedPocketBaseExe
  $matchedProcesses = @()

  try {
    $processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
    foreach ($process in $processes) {
      $actualPath = Normalize-PathForCompare ([string]$process.ExecutablePath)
      if (-not [string]::IsNullOrWhiteSpace($actualPath) -and $actualPath -eq $expectedPath) {
        $matchedProcesses += [pscustomobject]@{
          Pid = [int]$process.ProcessId
          Name = [string]$process.Name
          Path = [string]$process.ExecutablePath
        }
      }
    }
  } catch {
    $processes = @(Get-Process -ErrorAction SilentlyContinue)
    foreach ($process in $processes) {
      $actualPath = ''
      try { $actualPath = Normalize-PathForCompare ([string]$process.Path) } catch {}
      if (-not [string]::IsNullOrWhiteSpace($actualPath) -and $actualPath -eq $expectedPath) {
        $matchedProcesses += [pscustomobject]@{
          Pid = [int]$process.Id
          Name = [string]$process.ProcessName
          Path = [string]$process.Path
        }
      }
    }
  }

  return @($matchedProcesses | Sort-Object -Property Pid -Unique)
}

function Wait-ProjectPocketBaseStopped([string]$ExpectedPocketBaseExe, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $running = @(Get-ProjectPocketBaseProcesses $ExpectedPocketBaseExe)
    if ($running.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Assert-ProjectPocketBaseRuntime([string]$ExpectedPocketBaseExe, [bool]$AllowRestart) {
  $running = @(Get-ProjectPocketBaseProcesses $ExpectedPocketBaseExe)
  if ($running.Count -eq 0) {
    Write-Host 'Preflight PocketBase PowerZona: sin procesos previos'
    return
  }

  $details = ($running | ForEach-Object { Format-ListenerLine $_ }) -join '; '
  if (-not $AllowRestart) {
    throw "PocketBase de este repositorio ya esta ejecutandose ($details). Ejecute con -RestartExisting para detener solo ese ejecutable antes de iniciar."
  }

  foreach ($process in $running) {
    Write-Host "Deteniendo PocketBase PowerZona anterior (PID $($process.Pid))."
    try {
      Stop-Process -Id $process.Pid -ErrorAction Stop
    } catch {
      if (Get-Process -Id $process.Pid -ErrorAction SilentlyContinue) {
        throw "No se pudo detener el PocketBase PowerZona anterior (PID $($process.Pid))."
      }
    }
  }

  if (-not (Wait-ProjectPocketBaseStopped $ExpectedPocketBaseExe 20)) {
    throw 'No se confirmo el cierre del PocketBase PowerZona anterior. No se abrira la misma base en paralelo.'
  }

  Write-Host 'PocketBase PowerZona anterior detectado y detenido.'
}

function Assert-RequiredFiles([string]$BaseDir, [string[]]$RelativePaths, [string]$Label) {
  foreach ($relative in $RelativePaths) {
    if (-not (Test-Path -LiteralPath (Join-Path $BaseDir $relative) -PathType Leaf)) {
      throw "$Label incompleto: falta $relative."
    }
  }
}

$httpEndpoint = Resolve-HttpEndpoint $Http
$scriptDir = Split-Path -Parent $PSCommandPath
$backendDir = Split-Path -Parent $scriptDir
$setupScript = Join-Path $scriptDir 'Setup-SecurityLocal.ps1'
$secretPath = Resolve-SecretPath $SecretFile
$pocketbaseExe = [System.IO.Path]::GetFullPath((Join-Path $backendDir 'pocketbase.exe'))
if ([string]::IsNullOrWhiteSpace($DataDir)) {
  $dataDir = [System.IO.Path]::GetFullPath((Join-Path $backendDir 'pb_data'))
} else {
  $dataDir = [System.IO.Path]::GetFullPath($DataDir)
}
$hooksDir = [System.IO.Path]::GetFullPath((Join-Path $backendDir 'pb_hooks'))
$migrationsDir = [System.IO.Path]::GetFullPath((Join-Path $backendDir 'pb_migrations'))

if (-not (Test-Path -LiteralPath $pocketbaseExe -PathType Leaf)) {
  throw 'No se encontro pocketbase.exe dentro de backend-powerzona.'
}
if (-not (Test-Path -LiteralPath $hooksDir -PathType Container)) {
  throw 'No se encontro pb_hooks.'
}
if (-not (Test-Path -LiteralPath $migrationsDir -PathType Container)) {
  throw 'No se encontro pb_migrations.'
}
if (-not (Test-Path -LiteralPath $setupScript -PathType Leaf)) {
  throw 'No se encontro Setup-SecurityLocal.ps1.'
}

Assert-ProjectPocketBaseRuntime $pocketbaseExe ([bool]$RestartExisting)
Assert-PocketBasePortPreflight $httpEndpoint $pocketbaseExe ([bool]$RestartExisting)

if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
  & $setupScript -SecretFile $secretPath
  $setupExitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
  $setupExitCode = if ($setupExitCodeVariable) { [int]$setupExitCodeVariable.Value } else { 0 }
  if ($setupExitCode -ne 0) { exit $setupExitCode }
}

$secrets = Read-SecuritySecretFile $secretPath
$requiredHooks = @(
  'pb_hooks\pz_security_identity.pb.js',
  'pb_hooks\pz_security_identity_lib.js',
  'pb_hooks\pz_security_monitoring.pb.js',
  'pb_hooks\pz_security_monitoring_lib.js',
  'pb_hooks\pz_security_health.pb.js',
  'pb_hooks\pz_security_health_lib.js'
)
$requiredMigrations = @(
  'pb_migrations\1783385200_created_store_security_settings.js',
  'pb_migrations\1783385300_created_store_customers.js',
  'pb_migrations\1783385400_updated_orders_customer_relation.js',
  'pb_migrations\1783385500_created_store_security_events.js',
  'pb_migrations\1783385600_created_store_visitor_security_navigation.js'
)

Assert-RequiredFiles $backendDir $requiredHooks 'Hooks'
Assert-RequiredFiles $backendDir $requiredMigrations 'Migraciones M-017'

Write-Host 'Secretos locales: OK'
Write-Host 'HMAC runtime: lista'
Write-Host 'AES runtime: lista'
Write-Host 'Hooks: OK'
Write-Host 'Migraciones: OK'
Write-Host "Datos: $dataDir"

$previousHmac = $env:PZ_SECURITY_HMAC_SECRET
$previousAes = $env:PZ_SECURITY_AES_KEY
$exitCode = 0

try {
  $env:PZ_SECURITY_HMAC_SECRET = $secrets.Hmac
  $env:PZ_SECURITY_AES_KEY = $secrets.Aes

  Push-Location $backendDir
  try {
    Write-Host "Iniciando PocketBase local en http://$Http"
    & $pocketbaseExe serve "--dir=$dataDir" "--hooksDir=$hooksDir" "--migrationsDir=$migrationsDir" "--http=$Http"
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $previousHmac) { Remove-Item Env:\PZ_SECURITY_HMAC_SECRET -ErrorAction SilentlyContinue } else { $env:PZ_SECURITY_HMAC_SECRET = $previousHmac }
  if ($null -eq $previousAes) { Remove-Item Env:\PZ_SECURITY_AES_KEY -ErrorAction SilentlyContinue } else { $env:PZ_SECURITY_AES_KEY = $previousAes }
}

exit $exitCode
