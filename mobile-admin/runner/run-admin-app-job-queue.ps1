[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId = 'mobile-admin-runner-local',
    [Parameter(Mandatory = $true)][string]$SigningPropertiesPath,
    [switch]$ServiceMode,
    [switch]$HeartbeatOnly,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$runnerSecret = [string]$env:PZ_ADMIN_APP_RUNNER_SECRET
if ($runnerSecret.Length -lt 32) { throw 'Falta PZ_ADMIN_APP_RUNNER_SECRET con al menos 32 caracteres.' }
if (-not (Test-Path -LiteralPath $SigningPropertiesPath -PathType Leaf)) { throw 'No existe la firma externa configurada.' }
$baseUrl = $ApiBaseUrl.TrimEnd('/')
if ($baseUrl -notmatch '^https://|^http://(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$') { throw 'ApiBaseUrl debe usar HTTPS o localhost.' }
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$buildScript = Join-Path $repositoryRoot 'scripts\build-admin-app.ps1'
$engineManifestPath = Join-Path (Join-Path $repositoryRoot 'mobile-admin') 'engine.json'
$engineManifest = Get-Content -LiteralPath $engineManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$engineRevision = ([string](& git -C $repositoryRoot rev-parse HEAD 2>$null)).Trim().ToLowerInvariant()
$workspaceChanges = @(& git -C $repositoryRoot status --porcelain --untracked-files=normal 2>$null)
$workspaceClean = $LASTEXITCODE -eq 0 -and $workspaceChanges.Count -eq 0
if ($engineRevision -cnotmatch '^[a-f0-9]{40}$') { throw 'No se pudo fijar la revisión del runner.' }
$firebaseConfigPath = Join-Path (Join-Path $repositoryRoot 'mobile-admin\app') 'google-services.json'
$allowFirebase = Test-Path -LiteralPath $firebaseConfigPath -PathType Leaf
$allowSigning = Test-Path -LiteralPath $SigningPropertiesPath -PathType Leaf
$headers = @{ 'x-pz-admin-app-runner' = $runnerSecret; 'x-pz-admin-app-runner-id' = $RunnerId }

function Get-Sha256Lower {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Send-RunnerHeartbeat {
    $currentRevision = ([string](& git -C $repositoryRoot rev-parse HEAD 2>$null)).Trim().ToLowerInvariant()
    $currentChanges = @(& git -C $repositoryRoot status --porcelain --untracked-files=normal 2>$null)
    $stillClean = $workspaceClean -and $LASTEXITCODE -eq 0 -and $currentChanges.Count -eq 0 -and $currentRevision -ceq $engineRevision
    $body = @{
        runner_id = $RunnerId
        engine_version = [string]$engineManifest.version
        engine_revision = $engineRevision
        mode = if ($ServiceMode) { 'service' } else { 'manual' }
        allow_firebase = [bool]$allowFirebase
        allow_signing = [bool]$allowSigning
        workspace_clean = [bool]$stillClean
    }
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/pz/internal/admin-app-runners/heartbeat" -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) | Out-Null
}

function Send-Completion {
    param([hashtable]$Body)
    $Body.engine_name = [string]$engineManifest.name
    $Body.engine_version = [string]$engineManifest.version
    $Body.engine_contract_version = [int]$engineManifest.contract_version
    $Body.engine_revision = $engineRevision
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/pz/internal/admin-app-builds/complete" `
        -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 8 -Compress) | Out-Null
}

function Send-ArtifactUpload {
    param(
        [Parameter(Mandatory = $true)][string]$JobId,
        [Parameter(Mandatory = $true)][hashtable]$Artifact,
        [Parameter(Mandatory = $true)][string]$Path
    )
    Add-Type -AssemblyName System.Net.Http
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromMinutes(15)
    $form = [System.Net.Http.MultipartFormDataContent]::new()
    $stream = $null
    $fileContent = $null
    $response = $null
    try {
        $client.DefaultRequestHeaders.Add('x-pz-admin-app-runner', $runnerSecret)
        $client.DefaultRequestHeaders.Add('x-pz-admin-app-runner-id', $RunnerId)
        foreach ($field in @{
            job_id = $JobId
            runner_id = $RunnerId
            kind = [string]$Artifact.kind
            file_name = [string]$Artifact.file_name
            sha256 = [string]$Artifact.sha256
            bytes = [string]$Artifact.bytes
        }.GetEnumerator()) {
            $form.Add([System.Net.Http.StringContent]::new([string]$field.Value), [string]$field.Key)
        }
        $stream = [IO.File]::OpenRead($Path)
        $fileContent = [System.Net.Http.StreamContent]::new($stream)
        $contentType = switch ([string]$Artifact.kind) {
            'apk' { 'application/vnd.android.package-archive' }
            'build_manifest' { 'application/json' }
            default { 'text/plain' }
        }
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new($contentType)
        $form.Add($fileContent, 'file', [string]$Artifact.file_name)
        $response = $client.PostAsync(
            "$baseUrl/api/pz/internal/admin-app-builds/artifacts/upload",
            $form
        ).GetAwaiter().GetResult()
        $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            $code = ''
            try { $code = [string](ConvertFrom-Json $responseBody).error } catch {}
            if (-not $code) { $code = "artifact_upload_http_$([int]$response.StatusCode)" }
            throw $code
        }
    } finally {
        if ($response) { $response.Dispose() }
        if ($fileContent) { $fileContent.Dispose() }
        if ($stream) { $stream.Dispose() }
        if ($form) { $form.Dispose() }
        if ($client) { $client.Dispose() }
    }
}

function Receive-BrandAsset {
    param($Asset, [string]$Destination)
    if (-not $Asset) { return '' }
    if ([string]$Asset.sha256 -notmatch '^[a-f0-9]{64}$' -or [string]$Asset.download_path -notmatch '^/api/pz/internal/admin-app-brand-assets/') {
        throw 'runner_brand_contract_invalid'
    }
    Invoke-WebRequest -Method Get -Uri "$baseUrl$([string]$Asset.download_path)" -Headers $headers -OutFile $Destination | Out-Null
    if ((Get-Sha256Lower $Destination) -ne [string]$Asset.sha256) { throw 'runner_brand_checksum_mismatch' }
    return $Destination
}

do {
    Send-RunnerHeartbeat
    if ($HeartbeatOnly) { break }
    $claimBody = @{
        runner_id = $RunnerId
    }
    $claim = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/pz/internal/admin-app-builds/claim" `
        -Headers $headers -ContentType 'application/json' -Body ($claimBody | ConvertTo-Json -Compress)
    $job = $claim.job
    if (-not $job) {
        if ($Once) { break }
        Start-Sleep -Seconds 5
        continue
    }
    $preview = $null
    $brandDirectory = Join-Path ([IO.Path]::GetTempPath()) ("pz-admin-runner-brand-" + [Guid]::NewGuid().ToString('N'))
    try {
        if ([string]$job.preview.engine.name -cne [string]$engineManifest.name -or [string]$job.preview.engine.version -cne [string]$engineManifest.version -or [string]$job.preview.engine.revision -cne $engineRevision -or [int]$job.preview.engine.contract_version -ne [int]$engineManifest.contract_version) {
            throw 'runner_engine_release_mismatch'
        }
        if ([string]$job.preview.channel -cne 'production') { throw 'runner_build_channel_invalid' }
        New-Item -ItemType Directory -Path $brandDirectory | Out-Null
        $profile = $job.profile
        $iconPath = Receive-BrandAsset -Asset $profile.icon -Destination (Join-Path $brandDirectory 'icon.png')
        $splashPath = Receive-BrandAsset -Asset $profile.splash -Destination (Join-Path $brandDirectory 'splash.png')
        $preview = & $buildScript -Operation Preview -ReleaseOperation ([string]$job.operation) `
            -VersionCode ([int]$job.version_code) -VersionName ([string]$job.version_name) `
             -Channel ([string]$job.preview.channel) -PackageName ([string]$profile.package_name) `
            -DisplayName ([string]$profile.display_name) -AdminUrl ([string]$profile.admin_url) -ApiBaseUrl ([string]$job.preview.engine.api_base_url) `
            -ExpectedSigningCertSha256 ([string]$profile.signing_cert_sha256) `
            -IconSha256 ([string]$profile.icon.sha256) -SplashSha256 ([string]$profile.splash.sha256) `
            -SplashBackgroundColor ([string]$profile.splash_background_color) -EngineRevision $engineRevision
        if ([string]$preview.PreviewHash -ne [string]$job.preview_hash) { throw 'runner_preview_mismatch' }
        $build = & $buildScript -Operation Build -ReleaseOperation ([string]$job.operation) `
            -VersionCode ([int]$job.version_code) -VersionName ([string]$job.version_name) `
             -Channel ([string]$job.preview.channel) -PackageName ([string]$profile.package_name) `
            -DisplayName ([string]$profile.display_name) -AdminUrl ([string]$profile.admin_url) -ApiBaseUrl ([string]$job.preview.engine.api_base_url) `
            -ExpectedSigningCertSha256 ([string]$profile.signing_cert_sha256) `
            -IconSha256 ([string]$profile.icon.sha256) -SplashSha256 ([string]$profile.splash.sha256) `
            -SplashBackgroundColor ([string]$profile.splash_background_color) -IconPath $iconPath -SplashPath $splashPath `
            -BuildType Release -SigningPropertiesPath $SigningPropertiesPath `
            -ConfirmedPreviewPath ([string]$preview.PreviewPath) -ConfirmedPreviewHash ([string]$preview.PreviewHash) -EngineRevision $engineRevision -ExecuteBuild
        $artifacts = @()
        foreach ($file in Get-ChildItem -LiteralPath $build.OutputDirectory -File) {
            $kind = switch -Regex ($file.Name) {
                '\.apk$' { 'apk'; break }
                '^SHA256SUMS\.txt$' { 'checksums'; break }
                '^INSTRUCCIONES\.txt$' { 'instructions'; break }
                '^build-manifest\.json$' { 'build_manifest'; break }
                default { continue }
            }
            $artifact = @{ kind = $kind; file_name = $file.Name; sha256 = Get-Sha256Lower $file.FullName; bytes = $file.Length }
            Send-ArtifactUpload -JobId ([string]$job.id) -Artifact $artifact -Path $file.FullName
            $artifacts += $artifact
        }
        Send-Completion -Body @{
            job_id = [string]$job.id; runner_id = $RunnerId; status = 'succeeded'; failure_code = ''
            signing_cert_sha256 = [string]$build.SigningCertSha256; artifacts = $artifacts
        }
    } catch {
        $code = ([string]$_.Exception.Message).ToLowerInvariant() -replace '[^a-z0-9_:-]', '_'
        if ($code.Length -lt 3) { $code = 'runner_failed' }
        if ($code.Length -gt 80) { $code = $code.Substring(0, 80) }
        Send-Completion -Body @{
            job_id = [string]$job.id; runner_id = $RunnerId; status = 'needs_attention'; failure_code = $code
            signing_cert_sha256 = ''; artifacts = @()
        }
    } finally {
        if ($preview -and $preview.PreviewPath -and (Test-Path -LiteralPath ([string]$preview.PreviewPath))) {
            Remove-Item -LiteralPath ([string]$preview.PreviewPath) -Force
        }
        Get-ChildItem -LiteralPath $brandDirectory -File -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
        if (Test-Path -LiteralPath $brandDirectory) { Remove-Item -LiteralPath $brandDirectory -Force }
    }
    if ($Once) { break }
} while ($true)
