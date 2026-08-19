[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$TargetRevision,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')][string]$TargetEngineVersion,
    [Parameter(Mandatory = $true)][ValidateSet('Provision', 'Update')][string]$Operation,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9-]{1,62}$')][string]$ConfigKey,
    [Parameter(Mandatory = $true)][string]$SecretsRoot,
    [switch]$RequireFirebaseProvisioning,
    [switch]$RequireReleaseSigning,
    [switch]$RequireAab,
    [switch]$ProvisionUploadSigning,
    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $mobileRoot
$failures = New-Object 'System.Collections.Generic.List[string]'

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Code)
    if (-not $failures.Contains($Code)) { [void]$failures.Add($Code) }
}

function Resolve-Executable {
    param([AllowEmptyString()][string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (-not $candidate) { continue }
        if ([IO.Path]::IsPathRooted($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return $candidate
        }
        $command = Get-Command $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { return [string]$command.Source }
    }
    return ''
}

$actualRevision = [string](& git -C $repositoryRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or $actualRevision.Trim().ToLowerInvariant() -cne $TargetRevision) {
    Add-Failure 'engine_revision_mismatch'
}
$workspaceChanges = @(& git -C $repositoryRoot status --porcelain --untracked-files=all 2>$null)
if ($LASTEXITCODE -ne 0 -or $workspaceChanges.Count -ne 0) { Add-Failure 'engine_workspace_not_clean' }

$engineProperties = Join-Path $mobileRoot 'config\engine.properties'
$engineVersion = ''
if (Test-Path -LiteralPath $engineProperties -PathType Leaf) {
    $versionLine = Get-Content -LiteralPath $engineProperties -Encoding UTF8 |
        Where-Object { $_ -cmatch '^engine\.version=' } | Select-Object -First 1
    if ($versionLine) { $engineVersion = $versionLine.Substring('engine.version='.Length).Trim() }
}
if ($engineVersion -cne $TargetEngineVersion) { Add-Failure 'engine_version_mismatch' }

$resolvedRepositoryRoot = [IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\', '/')
$resolvedSecretsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SecretsRoot).TrimEnd('\', '/')
$repositoryPrefix = $resolvedRepositoryRoot + [IO.Path]::DirectorySeparatorChar
if ($resolvedSecretsRoot.Equals($resolvedRepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedSecretsRoot.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Add-Failure 'secrets_root_inside_repository'
}
if ((Test-Path -LiteralPath $resolvedSecretsRoot) -and -not (Test-Path -LiteralPath $resolvedSecretsRoot -PathType Container)) {
    Add-Failure 'secrets_root_is_not_directory'
}
$secretsParent = Split-Path -Parent $resolvedSecretsRoot
if (-not $secretsParent -or -not (Test-Path -LiteralPath $secretsParent -PathType Container)) {
    Add-Failure 'secrets_root_parent_missing'
}

if (([string]$env:PZ_STORE_APP_RUNNER_SECRET).Length -lt 32) { Add-Failure 'runner_secret_missing' }
if ([string]$env:PZ_STOREFRONT_API_BASE_URL -cnotmatch '^https://[^\s/]+(?:/.*)?$') {
    Add-Failure 'storefront_api_base_url_missing'
}

$androidSdk = if ($env:ANDROID_SDK_ROOT) { [string]$env:ANDROID_SDK_ROOT } else { [string]$env:ANDROID_HOME }
if (-not $androidSdk -or -not (Test-Path -LiteralPath $androidSdk -PathType Container)) {
    Add-Failure 'android_sdk_missing'
}
$javaHomeExecutable = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { '' }
$keytoolHomeExecutable = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' } else { '' }
$java = Resolve-Executable -Candidates @($javaHomeExecutable, 'java.exe')
$keytool = Resolve-Executable -Candidates @($keytoolHomeExecutable, 'keytool.exe')
if (-not $java) { Add-Failure 'java_missing' }
if (-not $keytool) { Add-Failure 'keytool_missing' }
if (-not (Test-Path -LiteralPath (Join-Path $mobileRoot 'gradlew.bat') -PathType Leaf)) {
    Add-Failure 'gradle_wrapper_missing'
}

$storeSecretRoot = Join-Path $resolvedSecretsRoot $ConfigKey
$appKeystorePath = Join-Path $storeSecretRoot 'app-signing.p12'
$appPropertiesPath = Join-Path $storeSecretRoot 'app-signing.properties'
$uploadKeystorePath = Join-Path $storeSecretRoot 'upload-signing.p12'
$uploadPropertiesPath = Join-Path $storeSecretRoot 'upload-signing.properties'
if ($RequireAab -and $ProvisionUploadSigning) { Add-Failure 'upload_signing_mode_conflict' }
if ($RequireReleaseSigning) {
    if ($Operation -eq 'Provision') {
        if ([string]$env:PZ_STORE_APP_RUNNER_ALLOW_SIGNING -cne 'true') { Add-Failure 'signing_generation_not_authorized' }
        if (([string]$env:PZ_STORE_APP_KEYSTORE_PASSWORD).Length -lt 16) { Add-Failure 'keystore_password_missing' }
        if (([string]$env:PZ_STORE_APP_KEY_PASSWORD).Length -lt 16) { Add-Failure 'key_password_missing' }
        if ((Test-Path -LiteralPath $appKeystorePath) -or (Test-Path -LiteralPath $appPropertiesPath)) {
            Add-Failure 'app_signing_already_exists'
        }
        if ($ProvisionUploadSigning -and ((Test-Path -LiteralPath $uploadKeystorePath) -or (Test-Path -LiteralPath $uploadPropertiesPath))) {
            Add-Failure 'upload_signing_already_exists'
        }
    } else {
        if (-not (Test-Path -LiteralPath $appKeystorePath -PathType Leaf) -or
            -not (Test-Path -LiteralPath $appPropertiesPath -PathType Leaf)) {
            Add-Failure 'existing_app_signing_missing'
        }
        if ($ProvisionUploadSigning) {
            if ([string]$env:PZ_STORE_APP_RUNNER_ALLOW_SIGNING -cne 'true') { Add-Failure 'signing_generation_not_authorized' }
            if (([string]$env:PZ_STORE_APP_KEYSTORE_PASSWORD).Length -lt 16) { Add-Failure 'keystore_password_missing' }
            if (([string]$env:PZ_STORE_APP_KEY_PASSWORD).Length -lt 16) { Add-Failure 'key_password_missing' }
            if ((Test-Path -LiteralPath $uploadKeystorePath) -or (Test-Path -LiteralPath $uploadPropertiesPath)) {
                Add-Failure 'upload_signing_already_exists'
            }
        } elseif ($RequireAab -and (-not (Test-Path -LiteralPath $uploadKeystorePath -PathType Leaf) -or
            -not (Test-Path -LiteralPath $uploadPropertiesPath -PathType Leaf))) {
            Add-Failure 'existing_upload_signing_missing'
        }
    }
}

if ($RequireFirebaseProvisioning) {
    $firebaseAuthorized = [string]$env:PZ_STORE_APP_RUNNER_ALLOW_FIREBASE -ceq 'true'
    $organizationConfigured = [string]$env:PZ_GOOGLE_CLOUD_ORGANIZATION_ID -cmatch '^[0-9]{6,30}$'
    if (-not $firebaseAuthorized) { Add-Failure 'firebase_provisioning_not_authorized' }
    if (-not $organizationConfigured) {
        Add-Failure 'google_cloud_organization_missing'
    }
    $gcloud = Resolve-Executable -Candidates @('gcloud.cmd')
    if (-not $gcloud) {
        Add-Failure 'gcloud_missing'
    } elseif ($firebaseAuthorized -and $organizationConfigured) {
        $activeAccounts = @(& $gcloud auth list --filter=status:ACTIVE '--format=value(account)' --quiet 2>$null)
        $authListExitCode = $LASTEXITCODE
        $activeAccount = [string]($activeAccounts | Select-Object -First 1)
        if ($authListExitCode -ne 0 -or -not $activeAccount.Trim()) {
            Add-Failure 'google_cloud_identity_missing'
        } else {
            $accessToken = [string](& $gcloud auth print-access-token --quiet 2>$null)
            if ($LASTEXITCODE -ne 0 -or $accessToken.Trim().Length -lt 40) { Add-Failure 'google_cloud_token_unavailable' }
            $accessToken = $null
        }
    }
}

$result = [pscustomobject]@{
    Ready = $failures.Count -eq 0
    EngineRevision = $actualRevision.Trim().ToLowerInvariant()
    EngineVersion = $engineVersion
    Operation = $Operation.ToLowerInvariant()
    ConfigKey = $ConfigKey
    Failures = @($failures)
}
if ($PassThru) { return $result }
if (-not $result.Ready) { throw "runner_preflight_failed:$($failures -join ',')" }
Write-Host "Runner listo para $($result.Operation) de '$ConfigKey' sin ejecutar efectos externos."
