[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfirmedPreviewPath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ConfirmedPreviewHash,
    [Parameter(Mandatory = $true)][string]$GoogleServicesOutputPath
)

$ErrorActionPreference = 'Stop'
$preview = Get-Content -LiteralPath $ConfirmedPreviewPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($preview.preview_hash -ne $ConfirmedPreviewHash -or $preview.payload.operation -ne 'provision') {
    throw 'La confirmacion no coincide con un aprovisionamiento.'
}
$firebase = $preview.payload.firebase
$identity = $preview.payload.identity
if (-not [bool]$firebase.create_project -and -not [bool]$firebase.register_android_app) {
    throw 'La vista previa adopta un Firebase existente; no se permite aprovisionarlo de nuevo.'
}
$organizationId = [string]$env:PZ_GOOGLE_CLOUD_ORGANIZATION_ID
if ($organizationId -notmatch '^[0-9]{6,30}$') { throw 'Falta PZ_GOOGLE_CLOUD_ORGANIZATION_ID en el runner.' }
$projectId = [string]$firebase.project_id
$packageName = [string]$identity.package_name
$displayName = [string]$identity.display_name

& gcloud.cmd projects describe $projectId --format=json --quiet *> $null
if ($LASTEXITCODE -ne 0) {
    & gcloud.cmd projects create $projectId --organization=$organizationId --name=$displayName --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Google Cloud no pudo crear el proyecto confirmado.' }
}
$billingAccount = [string]$env:PZ_GOOGLE_CLOUD_BILLING_ACCOUNT
if ($billingAccount) {
    & gcloud.cmd billing projects link $projectId --billing-account=$billingAccount --quiet
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo vincular la facturacion configurada.' }
}
$accessToken = (& gcloud.cmd auth print-access-token --quiet).Trim()
if ($LASTEXITCODE -ne 0 -or $accessToken.Length -lt 40) { throw 'El runner no obtuvo credenciales de Google Cloud.' }
$headers = @{ Authorization = "Bearer $accessToken"; 'Content-Type' = 'application/json' }

function Wait-FirebaseOperation {
    param([string]$OperationName)
    if (-not $OperationName) { return }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $operation = Invoke-RestMethod -Method Get -Headers $headers -Uri "https://firebase.googleapis.com/v1beta1/$OperationName"
        if ($operation.done) {
            if ($operation.error) { throw 'Firebase informo un fallo durante la operacion confirmada.' }
            return $operation.response
        }
        Start-Sleep -Seconds 2
    }
    throw 'Firebase no completo la operacion dentro del tiempo permitido.'
}

if ([bool]$firebase.create_project) {
    try {
        $operation = Invoke-RestMethod -Method Post -Headers $headers -Uri "https://firebase.googleapis.com/v1beta1/projects/$projectId`:addFirebase" -Body '{}'
        Wait-FirebaseOperation -OperationName $operation.name | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 409) { throw }
    }
}
$appsResponse = Invoke-RestMethod -Method Get -Headers $headers -Uri "https://firebase.googleapis.com/v1beta1/projects/$projectId/androidApps"
$androidApp = @($appsResponse.apps) | Where-Object { $_.packageName -eq $packageName } | Select-Object -First 1
if (-not $androidApp) {
    $body = @{ displayName = $displayName; packageName = $packageName } | ConvertTo-Json -Compress
    $operation = Invoke-RestMethod -Method Post -Headers $headers -Uri "https://firebase.googleapis.com/v1beta1/projects/$projectId/androidApps" -Body $body
    $androidApp = Wait-FirebaseOperation -OperationName $operation.name
}
if (-not $androidApp.name) { throw 'Firebase no devolvio la app Android confirmada.' }
$config = Invoke-RestMethod -Method Get -Headers $headers -Uri "https://firebase.googleapis.com/v1beta1/$($androidApp.name)/config"
if (-not $config.configFileContents) { throw 'Firebase no devolvio google-services.json.' }
$outputDirectory = Split-Path -Parent $GoogleServicesOutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllBytes($GoogleServicesOutputPath, [Convert]::FromBase64String([string]$config.configFileContents))
$firebaseAppId = [string]$androidApp.appId
$projectNumber = if ($firebaseAppId -match '^1:([0-9]{6,20}):android:') { $Matches[1] } else { '' }
if (-not $projectNumber) { throw 'Firebase devolvio un appId sin numero de proyecto valido.' }
[pscustomobject]@{ ProjectId = $projectId; ProjectNumber = $projectNumber; FirebaseAppId = $firebaseAppId; PackageName = $packageName }
