[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot 'validate-store-config.ps1'
$powerZona = & $validator -ConfigKey powerzona -PassThru
$demo = & $validator -ConfigKey demo -PassThru

if ($powerZona.ApplicationId -eq $demo.ApplicationId) { throw 'La demo reutiliza application.id de PowerZona.' }
if ($powerZona.AppKey -eq $demo.AppKey) { throw 'La demo reutiliza app.key de PowerZona.' }
if ($powerZona.FirebaseProjectId -eq $demo.FirebaseProjectId) { throw 'La demo reutiliza el proyecto Firebase de PowerZona.' }
if ($powerZona.Distribution -ne 'play_and_direct') { throw 'PowerZona perdio su politica APK + AAB.' }
if ($demo.Distribution -ne 'direct' -or $demo.Publishable) { throw 'La demo debe ser directa y no publicable.' }
if ($powerZona.EngineVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$' -or $demo.EngineVersion -ne $powerZona.EngineVersion) {
    throw 'PowerZona y demo deben usar la misma version aprobada del motor.'
}
if (-not $powerZona.NotificationIconPath -or -not (Test-Path -LiteralPath $powerZona.NotificationIconPath -PathType Leaf)) {
    throw 'PowerZona debe declarar su icono pequeno de notificacion PZ.'
}
if ($demo.NotificationIconPath) { throw 'La demo debe conservar el icono tecnico generico del motor.' }

Write-Host 'Pruebas de configuracion C10 superadas: PowerZona y demo estan aisladas.'
