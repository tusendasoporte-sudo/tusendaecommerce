[CmdletBinding()]
param(
  [string]$SecretFile = '',
  [string]$PocketBaseUrl = 'http://127.0.0.1:8091',
  [switch]$VerifyRuntimeHealth,
  [string]$MasterIdentity = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-DefaultSecretFile {
  $base = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($base)) { $base = $env:LOCALAPPDATA }
  if ([string]::IsNullOrWhiteSpace($base)) { throw 'No se pudo resolver LOCALAPPDATA.' }
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
    if ($line -notmatch '^([A-Z0-9_]+)=([^\s]+)$') { throw 'Formato invalido en archivo de secretos locales.' }
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

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(1000, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-HttpStatus([string]$Uri, [string]$Method, [string]$Body = '') {
  try {
    $params = @{
      Uri = $Uri
      Method = $Method
      UseBasicParsing = $true
      TimeoutSec = 5
    }
    if ($Body -ne '') {
      $params['Body'] = $Body
      $params['ContentType'] = 'application/json'
    }
    $response = Invoke-WebRequest @params
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    return 0
  }
}

function Invoke-JsonRequest([string]$Uri, [string]$Method, [object]$Body = $null, [hashtable]$Headers = $null) {
  $statusCode = 0
  $content = ''

  try {
    $params = @{
      Uri = $Uri
      Method = $Method
      UseBasicParsing = $true
      TimeoutSec = 10
      ErrorAction = 'Stop'
    }
    if ($Headers) { $params['Headers'] = $Headers }
    if ($null -ne $Body) {
      $params['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
      $params['ContentType'] = 'application/json'
    }

    $response = Invoke-WebRequest @params
    $statusCode = [int]$response.StatusCode
    $content = [string]$response.Content
  } catch {
    if ($_.Exception.Response) {
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
        }
      } catch {}
    }
  }

  $json = $null
  if (-not [string]::IsNullOrWhiteSpace($content)) {
    try { $json = $content | ConvertFrom-Json } catch {}
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Json = $json
  }
}

function Convert-SecureStringToPlainText([securestring]$SecureValue) {
  $bstr = [IntPtr]::Zero
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Get-JsonBool([object]$ObjectValue, [string]$Name) {
  if ($null -eq $ObjectValue) { return $false }
  $property = $ObjectValue.PSObject.Properties[$Name]
  if ($null -eq $property) { return $false }
  return [bool]$property.Value
}

function Has-JsonProperty([object]$ObjectValue, [string]$Name) {
  if ($null -eq $ObjectValue) { return $false }
  return $null -ne $ObjectValue.PSObject.Properties[$Name]
}

function Test-FullIpConfigured([object]$Health, [string]$BaseUrl, [string]$Token) {
  if (Has-JsonProperty $Health 'full_ip_required') {
    return (Get-JsonBool $Health 'full_ip_required')
  }

  $filter = [System.Uri]::EscapeDataString('enabled = true && mode != "disabled" && ip_visibility = "full"')
  $uri = "$BaseUrl/api/collections/store_security_settings/records?perPage=1&page=1&filter=$filter&fields=id"
  $response = Invoke-JsonRequest $uri 'GET' $null @{ Authorization = "Bearer $Token" }
  if ($response.StatusCode -ne 200 -or $null -eq $response.Json) {
    throw 'No se pudo verificar si hay tiendas activas con IP completa.'
  }
  if (Has-JsonProperty $response.Json 'totalItems') {
    return ([int]$response.Json.totalItems) -gt 0
  }
  if (Has-JsonProperty $response.Json 'items') {
    return @($response.Json.items).Count -gt 0
  }
  return $false
}

function Test-RuntimeHealth([string]$BaseUrl, [string]$Identity) {
  $identityForCall = $Identity
  $passwordSecure = $null
  $passwordPlain = $null
  $token = $null
  $headers = $null
  $authBody = $null

  try {
    if ([string]::IsNullOrWhiteSpace($identityForCall)) {
      $identityForCall = Read-Host 'Master identity'
    }
    if ([string]::IsNullOrWhiteSpace($identityForCall)) {
      throw 'MasterIdentity requerido para verificar health runtime.'
    }

    $passwordSecure = Read-Host 'Master password' -AsSecureString
    $passwordPlain = Convert-SecureStringToPlainText $passwordSecure
    $authBody = @{
      identity = $identityForCall
      password = $passwordPlain
    }

    $authResponse = Invoke-JsonRequest "$BaseUrl/api/collections/users/auth-with-password" 'POST' $authBody
    if ($authResponse.StatusCode -ne 200 -or $null -eq $authResponse.Json -or -not (Has-JsonProperty $authResponse.Json 'token')) {
      throw 'Autenticacion Master fallida.'
    }

    $token = [string]$authResponse.Json.token
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Autenticacion Master sin token.' }
    $headers = @{ Authorization = "Bearer $token" }

    $healthResponse = Invoke-JsonRequest "$BaseUrl/api/pz/security/health" 'GET' $null $headers
    if ($healthResponse.StatusCode -ne 200 -or $null -eq $healthResponse.Json) {
      throw 'Health runtime no respondio OK.'
    }

    $health = $healthResponse.Json
    $requiredFields = @(
      'hmac_identity_ready',
      'hmac_monitoring_ready',
      'security_settings_ready',
      'customers_ready',
      'security_events_ready',
      'visitor_sessions_ready',
      'visitor_pageviews_ready',
      'orders_identity_fields_ready'
    )
    $missing = @()
    foreach ($field in $requiredFields) {
      if (-not (Get-JsonBool $health $field)) { $missing += $field }
    }

    $fullIpRequired = Test-FullIpConfigured $health $BaseUrl $token
    if ($fullIpRequired) {
      foreach ($field in @('aes_identity_ready', 'aes_monitoring_ready', 'full_ip_ready')) {
        if (-not (Get-JsonBool $health $field)) { $missing += $field }
      }
    }

    if ($missing.Count -gt 0) {
      throw ('Health runtime incompleto: ' + ($missing -join ', '))
    }

    return [pscustomobject]@{
      Health = $health
      FullIpRequired = $fullIpRequired
    }
  } finally {
    $passwordPlain = $null
    $authBody = $null
    $headers = $null
    $token = $null
    $identityForCall = $null
    if ($passwordSecure) { $passwordSecure.Dispose() }
  }
}

function Test-TrackedFilesDoNotContainSecrets([string]$RepoRoot, [string]$Hmac, [string]$Aes) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) { throw 'Git no esta disponible para revisar archivos tracked.' }
  $files = & git -C $RepoRoot ls-files
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar git ls-files.' }
  foreach ($file in $files) {
    $path = Join-Path $RepoRoot $file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    try {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $text = [System.Text.Encoding]::UTF8.GetString($bytes)
      if ($text.Contains($Hmac) -or $text.Contains($Aes)) {
        return $false
      }
    } catch {
      continue
    }
  }
  return $true
}

$PocketBaseUrl = $PocketBaseUrl.TrimEnd('/')
$scriptDir = Split-Path -Parent $PSCommandPath
$backendDir = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $backendDir
$secretPath = Resolve-SecretPath $SecretFile
$checks = New-Object System.Collections.Generic.List[string]
$failed = $false
$secrets = $null
$runtimeStatus = 'PENDIENTE'
$runtimeHealthOk = $false
$runtimeResult = $null

try {
  $secrets = Read-SecuritySecretFile $secretPath
  $checks.Add('Archivo de secretos local: OK')
} catch {
  $checks.Add('Archivo de secretos local: ERROR')
  $failed = $true
}

if (Test-Path -LiteralPath (Join-Path $backendDir 'pocketbase.exe') -PathType Leaf) {
  $checks.Add('PocketBase: OK')
} else {
  $checks.Add('PocketBase: ERROR')
  $failed = $true
}

$requiredHooks = @(
  'pb_hooks\pz_security_identity.pb.js',
  'pb_hooks\pz_security_identity_lib.js',
  'pb_hooks\pz_security_monitoring.pb.js',
  'pb_hooks\pz_security_monitoring_lib.js',
  'pb_hooks\pz_security_health.pb.js',
  'pb_hooks\pz_security_health_lib.js'
)
$hooksOk = $true
foreach ($relative in $requiredHooks) {
  if (-not (Test-Path -LiteralPath (Join-Path $backendDir $relative) -PathType Leaf)) { $hooksOk = $false }
}
if ($hooksOk) { $checks.Add('Hooks: OK') } else { $checks.Add('Hooks: ERROR'); $failed = $true }

$requiredMigrations = @(
  'pb_migrations\1783385200_created_store_security_settings.js',
  'pb_migrations\1783385300_created_store_customers.js',
  'pb_migrations\1783385400_updated_orders_customer_relation.js',
  'pb_migrations\1783385500_created_store_security_events.js',
  'pb_migrations\1783385600_created_store_visitor_security_navigation.js'
)
$migrationsOk = $true
foreach ($relative in $requiredMigrations) {
  if (-not (Test-Path -LiteralPath (Join-Path $backendDir $relative) -PathType Leaf)) { $migrationsOk = $false }
}
if ($migrationsOk) { $checks.Add('Migraciones M-017: OK') } else { $checks.Add('Migraciones M-017: ERROR'); $failed = $true }

try {
  $uri = [Uri]$PocketBaseUrl
  $port = if ($uri.Port -gt 0) { $uri.Port } elseif ($uri.Scheme -eq 'https') { 443 } else { 80 }
  if (Test-TcpPort $uri.Host $port) { $checks.Add('Puerto PocketBase: OK') } else { $checks.Add('Puerto PocketBase: ERROR'); $failed = $true }

  $trackStatus = Get-HttpStatus "$PocketBaseUrl/api/pz/security/track-navigation" 'POST' '{}'
  $registerStatus = Get-HttpStatus "$PocketBaseUrl/api/pz/security/register-order" 'POST' '{}'
  $healthPublicStatus = Get-HttpStatus "$PocketBaseUrl/api/pz/security/health" 'GET'

  if ($trackStatus -ne 404 -and $registerStatus -ne 404) {
    $checks.Add('Endpoints publicos silenciosos: OK')
  } else {
    $checks.Add('Endpoints publicos silenciosos: ERROR')
    $failed = $true
  }
  if ($healthPublicStatus -eq 403) {
    $checks.Add('Health privado: protegido')
  } else {
    $checks.Add('Health privado: ERROR')
    $failed = $true
  }
} catch {
  $checks.Add('Endpoints PocketBase: ERROR')
  $failed = $true
}

if ($VerifyRuntimeHealth) {
  try {
    $runtimeResult = Test-RuntimeHealth $PocketBaseUrl $MasterIdentity
    $runtimeStatus = 'OK'
    $runtimeHealthOk = $true
  } catch {
    $runtimeStatus = 'ERROR'
    $checks.Add("Health runtime autenticado: ERROR ($($_.Exception.Message))")
    $failed = $true
  }
}

$checks.Add("Proceso PocketBase con secretos: $runtimeStatus")
if ($runtimeHealthOk -and $runtimeResult) {
  $checks.Add(("HMAC identity runtime: {0}" -f (Get-JsonBool $runtimeResult.Health 'hmac_identity_ready')))
  $checks.Add(("HMAC monitoring runtime: {0}" -f (Get-JsonBool $runtimeResult.Health 'hmac_monitoring_ready')))
  $checks.Add(("AES identity runtime: {0}" -f (Get-JsonBool $runtimeResult.Health 'aes_identity_ready')))
  $checks.Add(("AES monitoring runtime: {0}" -f (Get-JsonBool $runtimeResult.Health 'aes_monitoring_ready')))
  $checks.Add(("Schema runtime: {0}" -f (
    (Get-JsonBool $runtimeResult.Health 'security_settings_ready') -and
    (Get-JsonBool $runtimeResult.Health 'customers_ready') -and
    (Get-JsonBool $runtimeResult.Health 'security_events_ready') -and
    (Get-JsonBool $runtimeResult.Health 'visitor_sessions_ready') -and
    (Get-JsonBool $runtimeResult.Health 'visitor_pageviews_ready') -and
    (Get-JsonBool $runtimeResult.Health 'orders_identity_fields_ready')
  )))
  $checks.Add(("IP completa activa: {0}" -f ([bool]$runtimeResult.FullIpRequired)))
}

if (-not $failed -and $secrets) {
  if (Test-TrackedFilesDoNotContainSecrets $repoRoot $secrets.Hmac $secrets.Aes) {
    $checks.Add('Repositorio sin secretos: OK')
  } else {
    $checks.Add('Repositorio sin secretos: ERROR')
    $failed = $true
  }
}

$checks | ForEach-Object { Write-Host $_ }
if (-not $VerifyRuntimeHealth -and $secrets) {
  $a = [string][char]0x00e1
  $i = [string][char]0x00ed
  $o = [string][char]0x00f3
  Write-Warning "El archivo de secretos es v${a}lido, pero todav${i}a no se verific${o} que el proceso PocketBase en ejecuci${o}n lo haya heredado."
}
if ($failed) { exit 1 }
if ($VerifyRuntimeHealth -and $runtimeHealthOk) { Write-Host 'Backend de Seguridad listo' }
exit 0
