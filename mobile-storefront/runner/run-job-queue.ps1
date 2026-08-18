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
$readiness = Join-Path $PSScriptRoot 'test-runner-readiness.ps1'
$artifactRemoval = Join-Path $PSScriptRoot 'remove-store-app-artifacts.ps1'
$artifactsRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'releases'

function Write-Utf8NoBom {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Content)
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Materialize-ApprovedBranding {
    param($Job)
    if ([int]$Job.preview.schema_version -ne 2 -or -not $Job.preview.branding -or -not $Job.preview.branding.assets) {
        throw 'brand_assets_required'
    }
    $jobId = [string]$Job.id
    if ($jobId -notmatch '^[a-z0-9]{15}$') { throw 'invalid_job_id' }
    $resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot)
    New-Item -ItemType Directory -Path $resolvedSecretsRoot -Force | Out-Null
    $workspaceRoot = Join-Path (Join-Path $resolvedSecretsRoot '_storefront-jobs') $jobId
    New-Item -ItemType Directory -Path $workspaceRoot -Force | Out-Null
    $assetHeaders = @{ 'x-pz-store-app-runner' = $runnerSecret; 'x-pz-store-app-runner-id' = $RunnerId }
    $materialized = @{}
    foreach ($kind in @('icon', 'splash')) {
        $asset = $Job.preview.branding.assets.$kind
        $fileName = [string]$asset.file_name
        if ($fileName -cnotmatch "^$kind[-_][a-f0-9]{32}(_[A-Za-z0-9]{6,32})?\.png$" -or [string]$asset.sha256 -cnotmatch '^[a-f0-9]{64}$') {
            throw "brand_asset_contract_invalid_$kind"
        }
        $target = Join-Path $workspaceRoot $fileName
        Invoke-WebRequest -Method Get -Headers $assetHeaders `
            -Uri "$baseUrl/api/pz/internal/storefront-app-builds/brand-assets/$jobId/$kind" -OutFile $target
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$asset.sha256 -or
            (Get-Item -LiteralPath $target).Length -ne [int64]$asset.bytes) {
            throw "brand_asset_download_mismatch_$kind"
        }
        $materialized[$kind] = $target
    }

    $profile = $Job.profile
    $preview = $Job.preview
    $configPath = Join-Path $workspaceRoot 'storefront.properties'
    $configLines = @(
        'schema.version=1'
        "store.key=$([string]$preview.store.slug)"
        "app.key=$([string]$preview.identity.app_key)"
        "store.url=$([string]$preview.identity.store_url)"
        "app.display_name=$([string]$preview.identity.display_name)"
        "application.id=$([string]$preview.identity.package_name)"
        "brand.key=$([string]$preview.identity.brand_key)"
        "firebase.project_id=$([string]$preview.firebase.project_id)"
        "firebase.provisioning=$(if ([bool]$preview.firebase.create_project) { 'create' } else { 'existing' })"
        "distribution=$([string]$profile.distribution)"
        'build.publishable=true'
        "version.code=$([int]$preview.build.version_code)"
        "version.name=$([string]$preview.build.version_name)"
    )
    Write-Utf8NoBom -Path $configPath -Content (($configLines -join "`n") + "`n")

    $brandPath = Join-Path $workspaceRoot 'brand.json'
    $brand = [ordered]@{
        schema_version = 1
        brand_key = [string]$preview.identity.brand_key
        store_key = [string]$preview.store.slug
        display_name = [string]$preview.identity.display_name
        application_id = [string]$preview.identity.package_name
        store_url = [string]$preview.identity.store_url
        publishable = $true
        firebase_android = [ordered]@{
            project_id = [string]$preview.firebase.project_id
            package_name = [string]$preview.identity.package_name
            configuration_file = 'app/google-services.json'
            tracked_in_git = $false
        }
        assets = [ordered]@{
            icon = [ordered]@{
                file = [IO.Path]::GetFileName([string]$materialized.icon)
                sha256 = [string]$preview.branding.assets.icon.sha256
                width = [int]$preview.branding.assets.icon.width
                height = [int]$preview.branding.assets.icon.height
                bytes = [int64]$preview.branding.assets.icon.bytes
                normalizer_version = [string]$preview.branding.assets.icon.normalizer_version
            }
            splash = [ordered]@{
                file = [IO.Path]::GetFileName([string]$materialized.splash)
                sha256 = [string]$preview.branding.assets.splash.sha256
                width = [int]$preview.branding.assets.splash.width
                height = [int]$preview.branding.assets.splash.height
                bytes = [int64]$preview.branding.assets.splash.bytes
                normalizer_version = [string]$preview.branding.assets.splash.normalizer_version
            }
        }
        palette = $preview.branding.palette
    }
    Write-Utf8NoBom -Path $brandPath -Content ($brand | ConvertTo-Json -Depth 10 -Compress)
    return [pscustomobject]@{ ConfigPath = $configPath; BrandPath = $brandPath; WorkspaceRoot = $workspaceRoot }
}

function Send-Completion {
    param([hashtable]$Body)
    Invoke-RestMethod -Method Post -Headers $headers -Uri "$baseUrl/api/pz/internal/storefront-app-builds/complete" `
        -Body ($Body | ConvertTo-Json -Depth 10 -Compress) | Out-Null
}

function Send-AdminCompletion {
    param([hashtable]$Body)
    Invoke-RestMethod -Method Post -Headers $headers -Uri "$baseUrl/api/pz/internal/storefront-app-admin-actions/complete" `
        -Body ($Body | ConvertTo-Json -Depth 6 -Compress) | Out-Null
}

function Assert-PanelPreviewMatchesLocal {
    param($Panel, $Local)
    foreach ($key in @('app_key', 'brand_key', 'display_name', 'package_name', 'store_url')) {
        if ([string]$Panel.identity.$key -cne [string]$Local.identity.$key) { throw "preview_identity_mismatch_$key" }
    }
    if ([string]$Panel.engine.target_version -cne [string]$Local.engine.version) {
        throw 'engine_version_mismatch'
    }
    if ([int]$Panel.schema_version -ne 2 -or [int]$Local.schema_version -ne 2) { throw 'brand_assets_required' }
    foreach ($kind in @('icon', 'splash')) {
        foreach ($property in @('sha256', 'width', 'height', 'bytes', 'normalizer_version')) {
            if ([string]$Panel.branding.assets.$kind.$property -cne [string]$Local.branding.assets.$kind.$property) {
                throw "brand_asset_mismatch_${kind}_$property"
            }
        }
    }
    foreach ($property in @('deep_sapphire', 'energy_cobalt', 'flash_blue', 'platinum', 'luminous_ice', 'pearl_white', 'ink', 'secondary_text', 'base_background')) {
        if ([string]$Panel.branding.palette.$property -cne [string]$Local.branding.palette.$property) {
            throw "brand_palette_mismatch_$property"
        }
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
    $adminClaim = Invoke-RestMethod -Method Post -Headers $headers `
        -Uri "$baseUrl/api/pz/internal/storefront-app-admin-actions/claim" `
        -Body (@{ runner_id = $RunnerId } | ConvertTo-Json -Compress)
    if ($adminClaim.action) {
        $adminAction = $adminClaim.action
        try {
            $removal = & $artifactRemoval -Action $adminAction -ArtifactsRoot $artifactsRoot
            Send-AdminCompletion -Body @{
                action_id = [string]$adminAction.id
                runner_id = $RunnerId
                status = 'succeeded'
                failure_code = ''
                deleted_artifact_ids = @($removal.DeletedArtifactIds)
            }
        } catch {
            $failureCode = ([string]$_.Exception.Message).ToLowerInvariant() -replace '[^a-z0-9_:-]', '_'
            if ($failureCode.Length -lt 3) { $failureCode = 'artifact_removal_failed' }
            if ($failureCode.Length -gt 80) { $failureCode = $failureCode.Substring(0, 80) }
            Send-AdminCompletion -Body @{
                action_id = [string]$adminAction.id
                runner_id = $RunnerId
                status = 'needs_attention'
                failure_code = $failureCode
                deleted_artifact_ids = @()
            }
        }
        if ($Once) { break }
        continue
    }
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
        $readinessArguments = @{
            TargetRevision = [string]$job.preview.engine.target_revision
            TargetEngineVersion = [string]$job.preview.engine.target_version
            Operation = $operation
            ConfigKey = $configKey
            SecretsRoot = $SecretsRoot
            RequireReleaseSigning = $true
        }
        if ([bool]$job.preview.firebase.create_project -or [bool]$job.preview.firebase.register_android_app) {
            $readinessArguments.RequireFirebaseProvisioning = $true
        }
        if ([bool]$job.preview.build.aab) { $readinessArguments.RequireAab = $true }
        & $readiness @readinessArguments
        $jobWorkspace = Materialize-ApprovedBranding -Job $job
        $localPreview = & $engine -ConfigKey $configKey -Operation Preview -PreviewFor $operation `
            -ConfigPath $jobWorkspace.ConfigPath -BrandPath $jobWorkspace.BrandPath `
            -VersionCode $versionCode -VersionName $versionName -BuildType Release
        Assert-PanelPreviewMatchesLocal -Panel $job.preview -Local $localPreview.Payload

        $storeSecretRoot = Join-Path $SecretsRoot $configKey
        $signingPath = Join-Path $storeSecretRoot 'app-signing.properties'
        $uploadPath = Join-Path $storeSecretRoot 'upload-signing.properties'
        $arguments = @{
            ConfigKey = $configKey; Operation = $operation; ConfigPath = $jobWorkspace.ConfigPath; BrandPath = $jobWorkspace.BrandPath
            VersionCode = $versionCode; VersionName = $versionName
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
