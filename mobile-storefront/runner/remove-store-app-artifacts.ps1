[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]$Action,
    [string]$ArtifactsRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'releases')
)

$ErrorActionPreference = 'Stop'
$actionId = [string]$Action.id
$actionType = [string]$Action.type
if ($actionId -cnotmatch '^[a-z0-9]{15}$' -or $actionType -notin @('delete_artifacts', 'delete_app')) {
    throw 'admin_action_invalid'
}
$targets = @($Action.target.artifacts)
if (($targets.Count -lt 1 -and $actionType -ne 'delete_app') -or $targets.Count -gt 500) {
    throw 'admin_action_target_invalid'
}

$resolvedRoot = [IO.Path]::GetFullPath(
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ArtifactsRoot)
).TrimEnd('\', '/')
$rootPrefix = $resolvedRoot + [IO.Path]::DirectorySeparatorChar
$validated = New-Object 'System.Collections.Generic.List[object]'
$seenIds = New-Object 'System.Collections.Generic.HashSet[string]'

function Assert-NoReparsePoint {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Root)
    $cursor = $Path
    while ($true) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'artifact_path_reparse_point'
            }
        }
        if ($cursor -ieq $Root) { break }
        $parent = [IO.Directory]::GetParent($cursor)
        if (-not $parent) { throw 'artifact_path_outside_custody' }
        $cursor = $parent.FullName.TrimEnd('\', '/')
        if ($cursor -ine $Root -and -not $cursor.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'artifact_path_outside_custody'
        }
    }
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = $null
    try {
        $stream = [IO.File]::OpenRead($Path)
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        if ($stream) { $stream.Dispose() }
        $algorithm.Dispose()
    }
}

foreach ($target in $targets) {
    $id = [string]$target.id
    $kind = [string]$target.kind
    $fileName = [string]$target.file_name
    $locator = [string]$target.storage_locator
    $sha256 = ([string]$target.sha256).ToLowerInvariant()
    $bytes = [int64]$target.bytes
    if ($id -cnotmatch '^[a-z0-9]{15}$' -or -not $seenIds.Add($id) `
        -or $kind -notin @('apk', 'aab', 'checksums', 'instructions', 'build_manifest') `
        -or ($actionType -eq 'delete_artifacts' -and $kind -notin @('apk', 'aab')) `
        -or $fileName -cnotmatch '^[A-Za-z0-9._-]+$' -or -not $locator `
        -or $sha256 -cnotmatch '^[a-f0-9]{64}$' -or $bytes -lt 1) {
        throw 'admin_action_target_invalid'
    }
    if ($locator -ceq 'pocketbase_managed') {
        [void]$validated.Add([pscustomobject]@{
            Id = $id; Path = ''; Sha256 = $sha256; Bytes = $bytes; BackendManaged = $true
        })
        continue
    }
    $resolvedPath = [IO.Path]::GetFullPath(
        $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($locator)
    )
    if (-not $resolvedPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) `
        -or [IO.Path]::GetFileName($resolvedPath) -cne $fileName) {
        throw 'artifact_path_outside_custody'
    }
    Assert-NoReparsePoint -Path $resolvedPath -Root $resolvedRoot
    $exists = Test-Path -LiteralPath $resolvedPath -PathType Leaf
    if ($exists) {
        $file = Get-Item -LiteralPath $resolvedPath
        if ($file.Length -ne $bytes `
            -or (Get-Sha256Hex -Path $resolvedPath) -cne $sha256) {
            throw 'artifact_integrity_mismatch'
        }
    } elseif (Test-Path -LiteralPath $resolvedPath) {
        throw 'artifact_path_not_file'
    }
    [void]$validated.Add([pscustomobject]@{
        Id = $id; Path = $resolvedPath; Sha256 = $sha256; Bytes = $bytes; BackendManaged = $false
    })
}

foreach ($item in $validated) {
    if ($item.BackendManaged) { continue }
    Assert-NoReparsePoint -Path $item.Path -Root $resolvedRoot
    if (Test-Path -LiteralPath $item.Path -PathType Leaf) {
        $file = Get-Item -LiteralPath $item.Path -Force
        if ($file.Length -ne $item.Bytes `
            -or (Get-Sha256Hex -Path $item.Path) -cne $item.Sha256) {
            throw 'artifact_integrity_mismatch'
        }
        Remove-Item -LiteralPath $item.Path -Force
    } elseif (Test-Path -LiteralPath $item.Path) {
        throw 'artifact_path_not_file'
    }
}

[pscustomobject]@{
    ActionId = $actionId
    DeletedArtifactIds = @($validated | ForEach-Object { $_.Id })
}
