[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^https?://')][string]$PocketBaseUrl,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$runnerSecret = [string]$env:PZ_STORE_APP_RUNNER_SECRET
if ($runnerSecret.Length -lt 32) { throw 'Falta PZ_STORE_APP_RUNNER_SECRET.' }
$baseUrl = $PocketBaseUrl.TrimEnd('/')
$headers = @{ 'x-pz-store-app-runner' = $runnerSecret; 'Content-Type' = 'application/json' }
$engine = Join-Path $PSScriptRoot 'store-app-runner.ps1'
$allowFirebase = [string]$env:PZ_STORE_APP_RUNNER_ALLOW_FIREBASE -eq 'true'
$allowSigning = [string]$env:PZ_STORE_APP_RUNNER_ALLOW_SIGNING -eq 'true'
$apiBaseUrl = [string]$env:PZ_STOREFRONT_API_BASE_URL

function Send-Completion {
    param([hashtable]$Body)
    Invoke-RestMethod -Method Post -Headers $headers -Uri "$baseUrl/api/pz/internal/storefront-app-builds/complete" `
        -Body ($Body | ConvertTo-Json -Depth 10 -Compress) | Out-Null
}

function Assert-PanelPreviewMatchesLocal {
    param($Panel, $Local)
    foreach ($key in @('app_key', 'brand_key', 'display_name', 'package_name', 'store_url')) {
        if ([string]$Panel.identity.$key -cne [string]$Local.identity.$key) { throw "preview_identity_mismatch_$key" }
    }
    if ([string]$Panel.engine.target_version -cne [string]$Local.engine.version) {
        throw 'engine_version_mismatch'
    }
    if ([string]$Panel.engine.target_revision -and
        [string]$Panel.engine.target_revision -cne [string]$Local.engine.revision) {
        throw 'engine_revision_mismatch'
    }
    if (-not [bool]$Local.engine.workspace_clean) { throw 'engine_workspace_not_clean' }
    if ([string]$Panel.firebase.project_id -cne [string]$Local.firebase.project_id -or
        [bool]$Panel.firebase.create_project -ne [bool]$Local.firebase.create_project -or
        [bool]$Panel.firebase.register_android_app -ne [bool]$Local.firebase.register_android_app -or
        [int]$Panel.build.version_code -ne [int]$Local.build.version_code -or
        [string]$Panel.build.version_name -cne [string]$Local.build.version_name -or
        [bool]$Panel.build.apk -ne [bool]$Local.build.apk -or
        [bool]$Panel.build.aab -ne [bool]$Local.build.aab -or
        [bool]$Panel.signing.create_app_signing_key -ne [bool]$Local.signing.create_app_signing_key -or
        [bool]$Panel.signing.create_play_upload_key -ne [bool]$Local.signing.create_play_upload_key -or
        [string]$Panel.operation -cne [string]$Local.operation) {
        throw 'preview_contract_mismatch'
    }
}

do {
    $claim = Invoke-RestMethod -Method Post -Headers $headers -Uri "$baseUrl/api/pz/internal/storefront-app-builds/claim" `
        -Body (@{ runner_id = $RunnerId } | ConvertTo-Json -Compress)
    if (-not $claim.job) {
        if ($Once) { break }
        Start-Sleep -Seconds 10
        continue
    }
    $job = $claim.job
    try {
        $operation = if ($job.operation -eq 'provision') { 'Provision' } elseif ($job.operation -eq 'update') { 'Update' } else { throw 'invalid_job_operation' }
        $configKey = [string]$job.profile.brand_key
        $versionCode = [int]$job.preview.build.version_code
        $versionName = [string]$job.preview.build.version_name
        $localPreview = & $engine -ConfigKey $configKey -Operation Preview -PreviewFor $operation `
            -VersionCode $versionCode -VersionName $versionName -BuildType Release
        Assert-PanelPreviewMatchesLocal -Panel $job.preview -Local $localPreview.Payload

        $storeSecretRoot = Join-Path $SecretsRoot $configKey
        $signingPath = Join-Path $storeSecretRoot 'app-signing.properties'
        $uploadPath = Join-Path $storeSecretRoot 'upload-signing.properties'
        $arguments = @{
            ConfigKey = $configKey; Operation = $operation; VersionCode = $versionCode; VersionName = $versionName
            ConfirmedPreviewPath = $localPreview.PreviewPath; ConfirmedPreviewHash = $localPreview.PreviewHash
            SigningPropertiesPath = if (Test-Path -LiteralPath $signingPath) { $signingPath } else { '' }
            UploadSigningPropertiesPath = if (Test-Path -LiteralPath $uploadPath) { $uploadPath } else { '' }
            SecretsRoot = $SecretsRoot; ApiBaseUrl = $apiBaseUrl; BuildType = 'Release'; ExecuteBuild = $true
            ExistingFirebaseProjectNumber = [string]$job.profile.firebase_project_number
            ExistingFirebaseAppId = [string]$job.profile.firebase_app_id
            ExistingSigningCertSha256 = [string]$job.profile.signing_cert_sha256
            ExistingUploadCertSha256 = [string]$job.profile.upload_cert_sha256
        }
        if ($allowFirebase) { $arguments.AllowFirebaseProvisioning = $true }
        if ($allowSigning) { $arguments.AllowSigningGeneration = $true }
        $result = & $engine @arguments
        $artifactSpecs = @()
        foreach ($file in Get-ChildItem -LiteralPath $result.OutputDirectory -File) {
            $kind = switch -Regex ($file.Name) {
                '\.apk$' { 'apk'; break }
                '\.aab$' { 'aab'; break }
                '^SHA256SUMS\.txt$' { 'checksums'; break }
                '^INSTRUCCIONES\.txt$' { 'instructions'; break }
                '^build-manifest\.json$' { 'build_manifest'; break }
                default { continue }
            }
            $artifactSpecs += @{
                kind = $kind
                visibility = if ($kind -in @('aab', 'build_manifest')) { 'master_only' } else { 'store_delivery' }
                file_name = $file.Name
                storage_locator = $file.FullName
                sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                bytes = $file.Length
            }
        }
        Send-Completion -Body @{
            job_id = [string]$job.id; runner_id = $RunnerId; status = 'succeeded'; failure_code = ''
            firebase_project_number = [string]$result.FirebaseProjectNumber
            firebase_app_id = [string]$result.FirebaseAppId
            signing_cert_sha256 = [string]$result.SigningCertSha256
            upload_cert_sha256 = [string]$result.UploadCertSha256
            engine_version = [string]$result.EngineVersion
            engine_revision = [string]$result.EngineRevision
            artifacts = $artifactSpecs
        }
    } catch {
        $failureCode = ([string]$_.Exception.Message).ToLowerInvariant() -replace '[^a-z0-9_:-]', '_'
        if ($failureCode.Length -lt 3) { $failureCode = 'runner_failed' }
        if ($failureCode.Length -gt 80) { $failureCode = $failureCode.Substring(0, 80) }
        Send-Completion -Body @{
            job_id = [string]$job.id; runner_id = $RunnerId; status = 'needs_attention'; failure_code = $failureCode
            firebase_project_number = ''; firebase_app_id = ''; signing_cert_sha256 = ''; upload_cert_sha256 = ''; artifacts = @()
            engine_version = ''; engine_revision = ''
        }
    }
    if ($Once) { break }
} while ($true)
