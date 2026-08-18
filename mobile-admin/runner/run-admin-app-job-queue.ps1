[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$RunnerId = 'mobile-admin-runner-local',
    [Parameter(Mandatory = $true)][string]$SigningPropertiesPath,
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
$headers = @{ 'x-pz-admin-app-runner' = $runnerSecret; 'x-pz-admin-app-runner-id' = $RunnerId }

function Get-Sha256Lower {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Send-Completion {
    param([hashtable]$Body)
    Invoke-RestMethod -Method Post -Uri "$baseUrl/api/pz/internal/admin-app-builds/complete" `
        -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 8 -Compress) | Out-Null
}

do {
    $claim = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/pz/internal/admin-app-builds/claim" `
        -Headers $headers -ContentType 'application/json' -Body (@{ runner_id = $RunnerId } | ConvertTo-Json -Compress)
    $job = $claim.job
    if (-not $job) {
        if ($Once) { break }
        Start-Sleep -Seconds 5
        continue
    }
    try {
        $profile = $job.profile
        $preview = & $buildScript -Operation Preview -ReleaseOperation ([string]$job.operation) `
            -VersionCode ([int]$job.version_code) -VersionName ([string]$job.version_name) `
            -Channel ([string]$profile.channel) -PackageName ([string]$profile.package_name) `
            -DisplayName ([string]$profile.display_name) -AdminUrl ([string]$profile.admin_url) `
            -ExpectedSigningCertSha256 ([string]$profile.signing_cert_sha256)
        if ([string]$preview.PreviewHash -ne [string]$job.preview_hash) { throw 'runner_preview_mismatch' }
        $build = & $buildScript -Operation Build -ReleaseOperation ([string]$job.operation) `
            -VersionCode ([int]$job.version_code) -VersionName ([string]$job.version_name) `
            -Channel ([string]$profile.channel) -PackageName ([string]$profile.package_name) `
            -DisplayName ([string]$profile.display_name) -AdminUrl ([string]$profile.admin_url) `
            -ExpectedSigningCertSha256 ([string]$profile.signing_cert_sha256) `
            -BuildType Release -SigningPropertiesPath $SigningPropertiesPath `
            -ConfirmedPreviewPath ([string]$preview.PreviewPath) -ConfirmedPreviewHash ([string]$preview.PreviewHash) -ExecuteBuild
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
            $form = @{
                job_id = [string]$job.id; runner_id = $RunnerId; kind = $kind; file_name = $file.Name
                sha256 = $artifact.sha256; bytes = [string]$file.Length; file = $file
            }
            Invoke-RestMethod -Method Post -Uri "$baseUrl/api/pz/internal/admin-app-builds/artifacts/upload" -Headers $headers -Form $form | Out-Null
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
    }
    if ($Once) { break }
} while ($true)
