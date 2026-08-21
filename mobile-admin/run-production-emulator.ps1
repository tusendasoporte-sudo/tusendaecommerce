[CmdletBinding()]
param(
    [string]$DeviceId = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$productionAdminUrl = 'https://tusenda84.com/admin'
$projectRoot = $PSScriptRoot
$gradle = Join-Path $projectRoot 'gradlew.bat'
$localProperties = Join-Path $projectRoot 'local.properties'

function Resolve-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
        return $env:JAVA_HOME
    }

    $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($javaCommand) {
        return Split-Path -Parent (Split-Path -Parent $javaCommand.Source)
    }

    $androidStudioJava = 'C:\Program Files\Android\Android Studio\jbr'
    if (Test-Path -LiteralPath (Join-Path $androidStudioJava 'bin\java.exe')) {
        return $androidStudioJava
    }

    throw 'No se encontro Java. Configura JAVA_HOME o instala Android Studio con su JBR.'
}

function Resolve-AndroidSdk {
    foreach ($candidate in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    if (Test-Path -LiteralPath $localProperties) {
        $sdkLine = Get-Content -LiteralPath $localProperties |
            Where-Object { $_ -like 'sdk.dir=*' } |
            Select-Object -First 1
        if ($sdkLine) {
            $sdkPath = $sdkLine.Substring('sdk.dir='.Length).Replace('\:', ':').Replace('\\', '\')
            if (Test-Path -LiteralPath $sdkPath) {
                return $sdkPath
            }
        }
    }

    throw 'No se encontro Android SDK. Configura ANDROID_HOME o mobile-admin/local.properties.'
}

$env:JAVA_HOME = Resolve-JavaHome
$androidSdk = Resolve-AndroidSdk
$adb = Join-Path $androidSdk 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) {
    throw "No se encontro adb en $adb."
}

$connectedEmulators = @(
    & $adb devices -l |
        Where-Object { $_ -match '^(emulator-[0-9]+)\s+device\b' } |
        ForEach-Object { $Matches[1] }
)

if ($DeviceId) {
    if ($DeviceId -notmatch '^emulator-[0-9]+$' -or $DeviceId -notin $connectedEmulators) {
        throw "El emulador $DeviceId no esta conectado y listo."
    }
    $selectedDevice = $DeviceId
} elseif ($connectedEmulators.Count -eq 1) {
    $selectedDevice = $connectedEmulators[0]
} elseif ($connectedEmulators.Count -eq 0) {
    throw 'No hay ningun emulador Android conectado y listo.'
} else {
    throw "Hay varios emuladores conectados: $($connectedEmulators -join ', '). Usa -DeviceId."
}

Write-Host "Compilando Mobile Admin debug contra $productionAdminUrl..."
Push-Location $projectRoot
try {
    & $gradle testDebugUnitTest assembleDebug "-PPZ_ADMIN_URL=$productionAdminUrl"
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle termino con codigo $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$apk = Join-Path $projectRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apk)) {
    throw "Gradle no genero el APK esperado en $apk."
}

Write-Host "Instalando en $selectedDevice..."
& $adb -s $selectedDevice install -r $apk
if ($LASTEXITCODE -ne 0) {
    throw "adb no pudo instalar la APK (codigo $LASTEXITCODE)."
}

& $adb -s $selectedDevice shell am start -W `
    -n 'com.tusenda84.admin/com.tusenda84.admin.MainActivity'
if ($LASTEXITCODE -ne 0) {
    throw "adb no pudo abrir Mobile Admin (codigo $LASTEXITCODE)."
}

Write-Host 'Mobile Admin esta abierta contra production.'
Write-Warning 'Despues de iniciar sesion, las acciones afectan datos reales de production.'
