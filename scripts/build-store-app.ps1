[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)][string]$ConfigKey,
    [ValidateSet('Preview', 'Provision', 'Update')][string]$Operation = 'Preview',
    [ValidateSet('Provision', 'Update')][string]$PreviewFor,
    [int]$VersionCode,
    [string]$VersionName,
    [string]$ConfirmedPreviewPath,
    [string]$ConfirmedPreviewHash,
    [string]$SigningPropertiesPath,
    [string]$UploadSigningPropertiesPath,
    [string]$SecretsRoot,
    [string]$ApiBaseUrl,
    [string]$ExistingFirebaseProjectNumber,
    [string]$ExistingFirebaseAppId,
    [string]$ExistingSigningCertSha256,
    [string]$ExistingUploadCertSha256,
    [ValidateSet('Debug', 'Release')][string]$BuildType = 'Release',
    [switch]$AllowFirebaseProvisioning,
    [switch]$AllowSigningGeneration,
    [switch]$ExecuteBuild
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $repositoryRoot 'mobile-storefront\runner\store-app-runner.ps1'
& $runner @PSBoundParameters
