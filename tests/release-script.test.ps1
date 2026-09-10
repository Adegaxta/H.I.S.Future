Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]
    $Actual,

    [Parameter(Mandatory = $true)]
    $Expected,

    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if ($Actual -cne $Expected) {
    throw "$Message Expected '$Expected', got '$Actual'."
  }
}

$releaseScript = (Resolve-Path (Join-Path $PSScriptRoot '../scripts/release.ps1')).Path
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $releaseScript,
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
  throw "release.ps1 has syntax errors: $($parseErrors.Message -join '; ')"
}

$requiredFunctions = @(
  'Invoke-Checked',
  'New-LocalReleaseTag',
  'Get-ReleaseRecoveryPlan',
  'Get-UnexpectedInitialChanges',
  'Invoke-ReleaseFinalization'
)
$functionDefinitions = $ast.FindAll(
  { param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] },
  $false
)
foreach ($functionName in $requiredFunctions) {
  $definition = $functionDefinitions | Where-Object { $_.Name -ceq $functionName }
  if (@($definition).Count -ne 1) {
    throw "Expected exactly one $functionName function in release.ps1."
  }
  Invoke-Expression $definition.Extent.Text
}

$script:capturedGitCalls = [System.Collections.Generic.List[object]]::new()
function git {
  $null = $script:capturedGitCalls.Add([object]@($args))
  $global:LASTEXITCODE = 0
}

try {
  # Regression for the real failure: -a must reach git and must not bind as
  # an abbreviation of a PowerShell wrapper parameter.
  New-LocalReleaseTag -Tag 'v0.1.3' -TargetVersion '0.1.3'
  $tagCall = @($script:capturedGitCalls[0])
  Assert-Equal ($tagCall -join '|') 'tag|-a|v0.1.3|-m|H.I.S. Future 0.1.3' 'Tag arguments were not forwarded literally.'

  Invoke-Checked git push --atomic origin HEAD:refs/heads/main refs/tags/v0.1.3:refs/tags/v0.1.3
  $pushCall = @($script:capturedGitCalls[1])
  Assert-Equal ($pushCall -join '|') 'push|--atomic|origin|HEAD:refs/heads/main|refs/tags/v0.1.3:refs/tags/v0.1.3' 'Push arguments were not forwarded literally.'

  $script:capturedGitCalls.Clear()
  Invoke-ReleaseFinalization `
    -Tag 'v0.1.3' `
    -TargetVersion '0.1.3' `
    -Branch 'main' `
    -ReleaseNotesPath '.release-notes/0.1.3.md' `
    -IsRecovery $true `
    -LocalTagExists $false
  $recoveryCalls = @($script:capturedGitCalls | ForEach-Object { @($_)[0] })
  Assert-Equal ($recoveryCalls -join '|') 'tag|ls-remote|push' 'Post-commit recovery must create only the missing tag and push; it must not create another commit.'

  $script:capturedGitCalls.Clear()
  Invoke-ReleaseFinalization `
    -Tag 'v0.1.3' `
    -TargetVersion '0.1.3' `
    -Branch 'main' `
    -ReleaseNotesPath '.release-notes/0.1.3.md' `
    -IsRecovery $true `
    -LocalTagExists $true
  $existingTagCalls = @($script:capturedGitCalls | ForEach-Object { @($_)[0] })
  Assert-Equal ($existingTagCalls -join '|') 'ls-remote|push' 'Recovery with an unpublished local tag must reuse it without another tag or commit.'
  $existingTagPushCall = @($script:capturedGitCalls[1])
  Assert-Equal `
    ($existingTagPushCall -join '|') `
    'push|--atomic|origin|HEAD:refs/heads/main|refs/tags/v0.1.3:refs/tags/v0.1.3' `
    'Recovery must build the local-to-remote tag refspec without PowerShell treating the colon as variable-scope syntax.'
} finally {
  Remove-Item Function:\git
}

# Recovery decisions after a release commit exists. These are pure simulations:
# no repository refs or remotes are changed by this test.
Assert-Equal `
  (Get-ReleaseRecoveryPlan -ReleaseCommitExists $true -LocalTagExists $false -RemoteTagExists $false) `
  'CreateLocalTagAndPush' `
  'A post-commit failure without a tag must resume without another commit.'
Assert-Equal `
  (Get-ReleaseRecoveryPlan -ReleaseCommitExists $true -LocalTagExists $true -RemoteTagExists $false) `
  'PushExistingLocalTag' `
  'An unpublished local tag must be reused, not duplicated.'
Assert-Equal `
  (Get-ReleaseRecoveryPlan -ReleaseCommitExists $true -LocalTagExists $true -RemoteTagExists $true) `
  'StopRemoteTagExists' `
  'A remote tag must stop local recovery because its workflow may have started.'
Assert-Equal `
  (Get-ReleaseRecoveryPlan -ReleaseCommitExists $false -LocalTagExists $false -RemoteTagExists $false) `
  'StopReleaseCommitMissing' `
  'Recovery must not synthesize a missing release commit.'

$cleanRecoveryChanges = @(Get-UnexpectedInitialChanges `
    -DirtyPaths @() `
    -ReleaseNotesPath '.release-notes/0.1.3.md' `
    -IsRecovery $true)
Assert-Equal $cleanRecoveryChanges.Count 0 'A clean recovery tree must produce an empty array, not null.'

$generateLatest = (Resolve-Path (Join-Path $PSScriptRoot '../scripts/generate-latest.ps1')).Path
$workflowPath = (Resolve-Path (Join-Path $PSScriptRoot '../.github/workflows/release.yml')).Path
$workflowText = Get-Content -LiteralPath $workflowPath -Raw
if (-not $workflowText.Contains('$encodedArtifactName = [System.Uri]::EscapeDataString($githubAssetName)')) {
  throw 'Release workflow must URL-encode the asset name before validating latest.json.'
}
if (-not $workflowText.Contains('$githubAssetName = ($artifactName -replace ''[\s.]+'', ''.'').Trim(''.'')')) {
  throw 'Release workflow must normalize the asset name before validating latest.json.'
}
if (-not $workflowText.Contains('/$encodedArtifactName"')) {
  throw 'Release workflow must validate latest.json against the encoded asset URL.'
}
if (-not $workflowText.Contains("-replace '[\s.]+', '.'")) {
  throw 'Release workflow must validate GitHub-normalized asset names.'
}
if (-not $workflowText.Contains('workflow_dispatch:') -or -not $workflowText.Contains('release_tag:')) {
  throw 'Release workflow must expose explicit draft recovery by tag.'
}
if (-not $workflowText.Contains('gh release delete-asset $env:RELEASE_TAG $assetName --yes') -or -not $workflowText.Contains('gh release upload $env:RELEASE_TAG') -or -not $workflowText.Contains('--clobber')) {
  throw 'Release workflow must overwrite the three assets when recovering a draft.'
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "hisfuture-release-test-$([guid]::NewGuid().ToString('N'))"
try {
  $null = New-Item -ItemType Directory -Path $temporaryDirectory
  $artifactPath = Join-Path $temporaryDirectory 'H.I.S. Future_0.1.6_x64-setup.exe'
  $signaturePath = "$artifactPath.sig"
  [System.IO.File]::WriteAllText($artifactPath, 'test artifact')
  [System.IO.File]::WriteAllText($signaturePath, 'test signature')

  $latestPath = & $generateLatest `
    -Version '0.1.6' `
    -ArtifactPath $artifactPath `
    -Tag 'v0.1.6' `
    -Repository 'Adegaxta/H.I.S.Future'
  if ($LASTEXITCODE -ne 0) {
    throw 'generate-latest.ps1 failed in the release URL encoding regression test.'
  }

  $manifest = Get-Content -LiteralPath ($latestPath | Select-Object -Last 1) -Raw | ConvertFrom-Json
  Assert-Equal `
    $manifest.platforms.'windows-x86_64'.url `
    'https://github.com/Adegaxta/H.I.S.Future/releases/download/v0.1.6/H.I.S.Future_0.1.6_x64-setup.exe' `
    'latest.json must use GitHub-normalized asset names in the release URL.'
} finally {
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}

Write-Output 'PASS: release tag arguments, recovery states, and encoded latest.json asset URLs.'
