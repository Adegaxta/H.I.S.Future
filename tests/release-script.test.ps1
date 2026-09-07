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
  Assert-Equal ($tagCall -join '|') 'tag|-a|v0.1.3|-m|H.I.S. 0.1.3' 'Tag arguments were not forwarded literally.'

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

Write-Output 'PASS: release tag arguments and post-commit recovery states.'
