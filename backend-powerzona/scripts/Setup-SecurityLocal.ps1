[CmdletBinding()]
param(
  [string]$SecretFile = '',
  [switch]$Regenerate,
  [switch]$Force
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-DefaultSecretFile {
  $base = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($base)) {
    $base = $env:LOCALAPPDATA
  }
  if ([string]::IsNullOrWhiteSpace($base)) {
    throw 'No se pudo resolver LOCALAPPDATA para guardar secretos locales.'
  }
  return (Join-Path (Join-Path $base 'PowerZona') 'security.local.env')
}

function Resolve-SecretPath([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    $PathValue = Get-DefaultSecretFile
  }
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Convert-BytesToHex([byte[]]$Bytes) {
  $builder = New-Object System.Text.StringBuilder
  foreach ($byte in $Bytes) {
    [void]$builder.Append($byte.ToString('x2'))
  }
  return $builder.ToString()
}

function New-RandomHex([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
    return Convert-BytesToHex $bytes
  } finally {
    $rng.Dispose()
  }
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
  if ($lines.Count -ne 2) {
    throw 'Formato invalido: el archivo debe contener exactamente dos lineas.'
  }

  $values = @{}
  foreach ($line in $lines) {
    if ($line -notmatch '^([A-Z0-9_]+)=([^\s]+)$') {
      throw 'Formato invalido: se detecto una linea no permitida.'
    }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($values.ContainsKey($key)) {
      throw 'Formato invalido: se detecto una clave duplicada.'
    }
    $values[$key] = $value
  }

  if ($values.Keys.Count -ne 2 -or -not $values.ContainsKey('PZ_SECURITY_HMAC_SECRET') -or -not $values.ContainsKey('PZ_SECURITY_AES_KEY')) {
    throw 'Formato invalido: solo se permiten las claves esperadas.'
  }
  if ($values['PZ_SECURITY_HMAC_SECRET'] -notmatch '^[a-f0-9]{64}$' -or -not (Test-BackendHmacContract $values['PZ_SECURITY_HMAC_SECRET'])) {
    throw 'Formato invalido: HMAC local no cumple el contrato esperado.'
  }
  if ($values['PZ_SECURITY_AES_KEY'] -notmatch '^[a-f0-9]{32}$' -or -not (Test-BackendAesContract $values['PZ_SECURITY_AES_KEY'])) {
    throw 'Formato invalido: AES local no cumple el contrato esperado.'
  }

  return @{
    Hmac = $values['PZ_SECURITY_HMAC_SECRET']
    Aes = $values['PZ_SECURITY_AES_KEY']
  }
}

function Protect-SecretAcl([string]$PathValue) {
  if ($env:OS -ne 'Windows_NT') { return }
  try {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = Get-Acl -LiteralPath $PathValue
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) {
      [void]$acl.RemoveAccessRule($rule)
    }
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $identity,
      'FullControl',
      'Allow'
    )
    $acl.AddAccessRule($accessRule)
    Set-Acl -LiteralPath $PathValue -AclObject $acl
  } catch {
    Write-Warning 'No se pudo restringir completamente el ACL del archivo de secretos locales.'
  }
}

function Write-SecuritySecretFile([string]$PathValue) {
  $directory = Split-Path -Parent $PathValue
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $hmac = New-RandomHex 32
  $aes = New-RandomHex 16
  $content = "PZ_SECURITY_HMAC_SECRET=$hmac`nPZ_SECURITY_AES_KEY=$aes`n"
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($PathValue, $content, $encoding)
  Protect-SecretAcl $PathValue
}

$resolvedSecretFile = Resolve-SecretPath $SecretFile

if ((Test-Path -LiteralPath $resolvedSecretFile -PathType Leaf) -and -not $Regenerate) {
  [void](Read-SecuritySecretFile $resolvedSecretFile)
  Write-Host 'Secretos locales: OK. Se conservaron los valores existentes.'
  exit 0
}

if ((Test-Path -LiteralPath $resolvedSecretFile -PathType Leaf) -and $Regenerate -and -not $Force) {
  Write-Host 'ADVERTENCIA: regenerar estos secretos rompe correlacion HMAC y descifrado AES de datos existentes.'
  $confirmation = Read-Host 'Escriba REGENERAR para continuar'
  if ($confirmation -ne 'REGENERAR') {
    throw 'Regeneracion cancelada.'
  }
}

Write-SecuritySecretFile $resolvedSecretFile
[void](Read-SecuritySecretFile $resolvedSecretFile)
Write-Host 'Secretos locales: OK. Archivo creado fuera del repositorio.'
