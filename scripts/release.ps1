param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidatePattern('^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')]
  [string]$Version,

  [switch]$SkipEditor,

  [switch]$Resume
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
  if ($args.Count -lt 1) {
    throw 'Invoke-Checked requires a command.'
  }

  $command = [string]$args[0]
  $commandArguments = if ($args.Count -gt 1) { @($args[1..($args.Count - 1)]) } else { @() }

  & $command @commandArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $command $($commandArguments -join ' ')"
  }
}

function New-LocalReleaseTag {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Tag,

    [Parameter(Mandatory = $true)]
    [string]$TargetVersion
  )

  Invoke-Checked git tag -a $Tag -m "H.I.S. $TargetVersion"
}

function Get-ReleaseRecoveryPlan {
  param(
    [Parameter(Mandatory = $true)]
    [bool]$ReleaseCommitExists,

    [Parameter(Mandatory = $true)]
    [bool]$LocalTagExists,

    [Parameter(Mandatory = $true)]
    [bool]$RemoteTagExists
  )

  if ($RemoteTagExists) {
    return 'StopRemoteTagExists'
  }
  if (-not $ReleaseCommitExists) {
    return 'StopReleaseCommitMissing'
  }
  if ($LocalTagExists) {
    return 'PushExistingLocalTag'
  }
  return 'CreateLocalTagAndPush'
}

function Get-UnexpectedInitialChanges {
  param(
    [string[]]$DirtyPaths = @(),

    [Parameter(Mandatory = $true)]
    [string]$ReleaseNotesPath,

    [Parameter(Mandatory = $true)]
    [bool]$IsRecovery
  )

  if ($IsRecovery) {
    return $DirtyPaths
  }
  return @($DirtyPaths | Where-Object { $_ -ne $ReleaseNotesPath })
}

function Invoke-ReleaseFinalization {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Tag,

    [Parameter(Mandatory = $true)]
    [string]$TargetVersion,

    [Parameter(Mandatory = $true)]
    [string]$Branch,

    [Parameter(Mandatory = $true)]
    [string]$ReleaseNotesPath,

    [Parameter(Mandatory = $true)]
    [bool]$IsRecovery,

    [Parameter(Mandatory = $true)]
    [bool]$LocalTagExists
  )

  if (-not $IsRecovery) {
    Invoke-Checked git add -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json $ReleaseNotesPath
    Invoke-Checked git commit -m "chore: release $Tag"
  }
  if (-not $LocalTagExists) {
    New-LocalReleaseTag -Tag $Tag -TargetVersion $TargetVersion
  }

  $remoteTagBeforePush = @(& git ls-remote --tags origin "refs/tags/$Tag" "refs/tags/$Tag^{}")
  if ($LASTEXITCODE -ne 0) {
    throw "Could not perform the final remote tag check for $Tag. Nothing was pushed."
  }
  if ($remoteTagBeforePush.Count -gt 0) {
    throw "Remote tag $Tag appeared during preparation. Nothing was pushed; inspect GitHub Actions and do not move either tag."
  }

  Invoke-Checked git push --atomic origin "HEAD:refs/heads/$Branch" "refs/tags/$Tag:refs/tags/$Tag"
}

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false, $true)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-SourceVersions {
  $npmVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $npmLockVersion = (& node -p "require('./package-lock.json').version").Trim()
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the version from package-lock.json.'
  }
  $cargoText = Get-Content src-tauri/Cargo.toml -Raw
  $cargoLockText = Get-Content src-tauri/Cargo.lock -Raw
  $tauriVersion = (Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json).version

  if ($cargoText -notmatch '(?ms)^\[package\]\s*.*?^version\s*=\s*"([^"]+)"') {
    throw 'Could not read the package version from src-tauri/Cargo.toml.'
  }
  $cargoVersion = $Matches[1]

  if ($cargoLockText -notmatch '(?ms)^name = "hisfuture"\r?\nversion = "([^"]+)"') {
    throw 'Could not read the hisfuture version from src-tauri/Cargo.lock.'
  }

  return [ordered]@{
    npm = $npmVersion
    npmLock = $npmLockVersion
    Cargo = $cargoVersion
    CargoLock = $Matches[1]
    Tauri = $tauriVersion
  }
}

function Assert-VersionsEqual {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Versions,

    [Parameter(Mandatory = $true)]
    [string]$Expected
  )

  foreach ($entry in $Versions.GetEnumerator()) {
    if ($entry.Value -ne $Expected) {
      throw "$($entry.Key) version '$($entry.Value)' does not match '$Expected'."
    }
  }
}

function Compare-SemVer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Left,

    [Parameter(Mandatory = $true)]
    [string]$Right
  )

  $leftParts = $Left.Split('.')
  $rightParts = $Right.Split('.')
  for ($index = 0; $index -lt 3; $index++) {
    $leftNumber = [System.Numerics.BigInteger]::Parse($leftParts[$index])
    $rightNumber = [System.Numerics.BigInteger]::Parse($rightParts[$index])
    $comparison = $leftNumber.CompareTo($rightNumber)
    if ($comparison -ne 0) {
      return $comparison
    }
  }
  return 0
}

function New-ReleaseNotesDraft {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$TargetVersion
  )

  $semanticTags = @(& git tag --merged HEAD --list 'v*.*.*' --sort=-version:refname) |
    Where-Object { $_ -match '^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$' }
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect existing release tags.'
  }

  $baseTag = $semanticTags | Select-Object -First 1
  if ($baseTag) {
    $subjects = @(& git log --reverse --format=%s "$baseTag..HEAD")
  } else {
    $subjects = @(& git log --reverse --format=%s HEAD)
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read commits for the release notes draft.'
  }
  $subjects = @($subjects | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($subjects.Count -eq 0) {
    throw 'No commits are available to generate release notes. Create the notes file manually and rerun.'
  }

  $sections = [ordered]@{
    'Features' = @()
    'Improvements' = @()
    'Fixes' = @()
    'Documentation' = @()
    'Maintenance' = @()
    'Changes' = @()
  }

  foreach ($subject in $subjects) {
    $category = 'Changes'
    $note = $subject.Trim()
    if ($subject -match '^feat(?:\([^)]+\))?!?:\s*(.+)$') {
      $category = 'Features'
      $note = $Matches[1]
    } elseif ($subject -match '^(?:perf|refactor|style)(?:\([^)]+\))?!?:\s*(.+)$') {
      $category = 'Improvements'
      $note = $Matches[1]
    } elseif ($subject -match '^fix(?:\([^)]+\))?!?:\s*(.+)$') {
      $category = 'Fixes'
      $note = $Matches[1]
    } elseif ($subject -match '^docs(?:\([^)]+\))?!?:\s*(.+)$') {
      $category = 'Documentation'
      $note = $Matches[1]
    } elseif ($subject -match '^(?:build|chore|ci|test)(?:\([^)]+\))?!?:\s*(.+)$') {
      $category = 'Maintenance'
      $note = $Matches[1]
    }

    if ($note.Length -gt 0) {
      $note = $note.Substring(0, 1).ToUpperInvariant() + $note.Substring(1)
      $sections[$category] += $note
    }
  }

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("## H.I.S. $TargetVersion")
  foreach ($section in $sections.GetEnumerator()) {
    if ($section.Value.Count -eq 0) {
      continue
    }
    $lines.Add('')
    $lines.Add("### $($section.Key)")
    $lines.Add('')
    foreach ($note in $section.Value) {
      $lines.Add("- $note")
    }
  }

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $directory
  }
  Write-Utf8NoBom -Path $Path -Content (($lines -join "`n") + "`n")
  $draftBase = if ($baseTag) { $baseTag } else { 'the repository start' }
  Write-Host "Generated release notes draft from commits since $draftBase."
}

function Edit-ReleaseNotes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  Write-Host "Release notes file: $Path"
  if ($SkipEditor) {
    Write-Host 'Editor skipped. Review the file before confirming.'
    return
  }

  $codeCommand = Get-Command code -ErrorAction SilentlyContinue
  if ($codeCommand) {
    Invoke-Checked code --wait $Path
    return
  }

  $notepadCommand = Get-Command notepad.exe -ErrorAction SilentlyContinue
  if ($notepadCommand) {
    Start-Process -FilePath $notepadCommand.Source -ArgumentList ('"{0}"' -f $Path) -Wait
    return
  }

  Write-Host 'Open the file above in an editor and save it.'
  $null = Read-Host 'Press Enter when the release notes are ready'
}

function Get-ValidatedReleaseNotes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$TargetVersion
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Release notes file does not exist: $Path"
  }

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw 'Release notes must be UTF-8 without BOM.'
  }

  try {
    $content = [System.Text.UTF8Encoding]::new($false, $true).GetString($bytes)
  } catch {
    throw "Release notes are not valid UTF-8: $($_.Exception.Message)"
  }
  if ([string]::IsNullOrWhiteSpace($content)) {
    throw 'Release notes cannot be empty.'
  }

  $lines = @($content -split '\r?\n')
  $nonEmptyLines = @($lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $expectedHeading = "## H.I.S. $TargetVersion"
  if ($nonEmptyLines.Count -lt 2 -or $nonEmptyLines[0].Trim() -cne $expectedHeading) {
    throw "Release notes must start with '$expectedHeading' and contain a non-empty body."
  }

  return $content
}

function Get-GitFileText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Ref,

    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $lines = @(& git show "${Ref}:$Path")
  if ($LASTEXITCODE -ne 0) {
    throw "Could not read $Path at $Ref."
  }
  return ($lines -join "`n")
}

function Assert-ReleaseStateAtRef {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Ref,

    [Parameter(Mandatory = $true)]
    [string]$TargetVersion
  )

  $package = Get-GitFileText -Ref $Ref -Path 'package.json' | ConvertFrom-Json
  $packageLockText = Get-GitFileText -Ref $Ref -Path 'package-lock.json'
  $cargoText = Get-GitFileText -Ref $Ref -Path 'src-tauri/Cargo.toml'
  $cargoLockText = Get-GitFileText -Ref $Ref -Path 'src-tauri/Cargo.lock'
  $tauri = Get-GitFileText -Ref $Ref -Path 'src-tauri/tauri.conf.json' | ConvertFrom-Json
  $notesPath = ".release-notes/$TargetVersion.md"
  $notes = Get-GitFileText -Ref $Ref -Path $notesPath

  if ($packageLockText -notmatch '(?m)^\s*"version"\s*:\s*"([^"]+)"') {
    throw "Could not read the npm lock version at $Ref."
  }
  $npmLockVersion = $Matches[1]
  if ($cargoText -notmatch '(?ms)^\[package\]\s*.*?^version\s*=\s*"([^"]+)"') {
    throw "Could not read the Cargo version at $Ref."
  }
  $cargoVersion = $Matches[1]
  if ($cargoLockText -notmatch '(?ms)^name = "hisfuture"\r?\nversion = "([^"]+)"') {
    throw "Could not read the Cargo lock version at $Ref."
  }
  $cargoLockVersion = $Matches[1]

  Assert-VersionsEqual -Versions ([ordered]@{
      npm = $package.version
      npmLock = $npmLockVersion
      Cargo = $cargoVersion
      CargoLock = $cargoLockVersion
      Tauri = $tauri.version
    }) -Expected $TargetVersion

  $nonEmptyNoteLines = @(($notes -split '\r?\n') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $expectedHeading = "## H.I.S. $TargetVersion"
  if ($nonEmptyNoteLines.Count -lt 2 -or $nonEmptyNoteLines[0].Trim() -cne $expectedHeading) {
    throw "Release notes at $Ref must start with '$expectedHeading' and contain a non-empty body."
  }
}

function Find-ReleaseCommit {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Tag
  )

  $expectedSubject = "chore: release $Tag"
  $matches = @()
  $entries = @(& git log HEAD --format='%H%x09%s')
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect release commits.'
  }
  foreach ($entry in $entries) {
    $separator = $entry.IndexOf("`t")
    if ($separator -lt 1) {
      continue
    }
    if ($entry.Substring($separator + 1) -ceq $expectedSubject) {
      $matches += $entry.Substring(0, $separator)
    }
  }
  if ($matches.Count -gt 1) {
    throw "Multiple commits named '$expectedSubject' exist in local history. Refusing ambiguous recovery."
  }
  if ($matches.Count -eq 1) {
    return $matches[0]
  }
  return $null
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseNotesRelativePath = ".release-notes/$Version.md"
$releaseNotesPath = Join-Path $repositoryRoot $releaseNotesRelativePath
$versionFiles = @(
  'package-lock.json',
  'package.json',
  'src-tauri/Cargo.lock',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json'
)
Push-Location $repositoryRoot

try {
  $insideWorkTree = (& git rev-parse --is-inside-work-tree 2>$null)
  if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne 'true') {
    throw 'This script must run inside the H.I.S. Future Git repository.'
  }

  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
    throw 'A release cannot be prepared from a detached HEAD.'
  }

  $tag = "v$Version"
  $remoteTag = @(& git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")
  if ($LASTEXITCODE -ne 0) {
    throw "Could not check whether remote tag $tag already exists on origin."
  }
  $remoteTagExists = $remoteTag.Count -gt 0
  if ($remoteTagExists) {
    throw "Remote tag $tag already exists. Its workflow may already be running; this script will not fetch over, move, recreate, or push that tag. Inspect GitHub Actions before doing anything else."
  }

  $dirtyFiles = @(& git status --porcelain --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect the Git working tree.'
  }
  $dirtyPaths = @($dirtyFiles | ForEach-Object { $_.Substring(3).Replace('\', '/') })
  $unexpectedInitialChanges = @(Get-UnexpectedInitialChanges `
      -DirtyPaths $dirtyPaths `
      -ReleaseNotesPath $releaseNotesRelativePath `
      -IsRecovery $Resume.IsPresent)
  if ($unexpectedInitialChanges.Count -gt 0) {
    $cleanRequirement = if ($Resume) { 'completely clean in recovery mode' } else { "clean except for $releaseNotesRelativePath" }
    throw "The working tree must be $cleanRequirement. Commit or stash these files first: $($unexpectedInitialChanges -join ', ')"
  }

  $currentVersions = Get-SourceVersions
  $currentVersion = [string]$currentVersions.npm
  Assert-VersionsEqual -Versions $currentVersions -Expected $currentVersion
  if ($currentVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "Current version '$currentVersion' is not a supported X.Y.Z semantic version."
  }

  $versionComparison = Compare-SemVer -Left $Version -Right $currentVersion
  if ($Resume) {
    if ($versionComparison -ne 0) {
      throw "Recovery requires target version $Version to equal the prepared source version $currentVersion."
    }
  } elseif ($versionComparison -le 0) {
    $resumeHint = if ($versionComparison -eq 0) { " If a release commit already exists, rerun with: .\scripts\release.ps1 $Version -Resume" } else { '' }
    throw "Target version $Version must be greater than current version $currentVersion.$resumeHint"
  }

  Invoke-Checked git fetch --tags origin

  & git show-ref --verify --quiet "refs/tags/$tag"
  $localTagExists = $LASTEXITCODE -eq 0
  $releaseCommit = Find-ReleaseCommit -Tag $tag
  $releaseCommitExists = -not [string]::IsNullOrWhiteSpace($releaseCommit)
  $recoveryPlan = Get-ReleaseRecoveryPlan `
    -ReleaseCommitExists $releaseCommitExists `
    -LocalTagExists $localTagExists `
    -RemoteTagExists $remoteTagExists

  if ($Resume) {
    if ($recoveryPlan -eq 'StopReleaseCommitMissing') {
      throw "Cannot resume $tag because no unique 'chore: release $tag' commit exists in local history."
    }
    & git merge-base --is-ancestor $releaseCommit HEAD
    if ($LASTEXITCODE -ne 0) {
      throw "Release commit $releaseCommit is not an ancestor of HEAD. Refusing recovery."
    }
    Assert-ReleaseStateAtRef -Ref $releaseCommit -TargetVersion $Version

    $allowedRecoveryPaths = @(
      '.github/workflows/release.yml',
      ".release-notes/$Version.md",
      'docs/release-automation.md',
      'package.json',
      'scripts/release.ps1',
      'tests/release-script.test.ps1'
    )
    $postReleasePaths = @(& git diff --name-only "$releaseCommit..HEAD")
    if ($LASTEXITCODE -ne 0) {
      throw "Could not inspect commits after release commit $releaseCommit."
    }
    $unsafePostReleasePaths = @($postReleasePaths | Where-Object { $_ -notin $allowedRecoveryPaths })
    if ($unsafePostReleasePaths.Count -gt 0) {
      throw "Recovery commits contain non-automation changes that must not be added silently to $tag`: $($unsafePostReleasePaths -join ', ')"
    }

    if ($localTagExists) {
      $localTagCommit = (& git rev-parse "$tag^{commit}").Trim()
      if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve local tag $tag."
      }
      & git merge-base --is-ancestor $releaseCommit $localTagCommit
      if ($LASTEXITCODE -ne 0) {
        throw "Local tag $tag does not contain release commit $releaseCommit. It will not be moved automatically."
      }
      & git merge-base --is-ancestor $localTagCommit HEAD
      if ($LASTEXITCODE -ne 0) {
        throw "Local tag $tag is not on the current branch history. It will not be moved automatically."
      }
      Assert-ReleaseStateAtRef -Ref $tag -TargetVersion $Version
    }
  } else {
    if ($localTagExists) {
      throw "Local tag $tag already exists. Use -Resume only after inspecting that unpublished tag."
    }
    if ($releaseCommitExists) {
      throw "Release commit $releaseCommit already exists. Use .\scripts\release.ps1 $Version -Resume instead of creating a duplicate."
    }
  }

  Write-Host "Current version: $currentVersion"
  Write-Host "Target version:  $Version"

  if ($Resume) {
    $releaseNotesContent = Get-ValidatedReleaseNotes -Path $releaseNotesPath -TargetVersion $Version
    Assert-ReleaseStateAtRef -Ref HEAD -TargetVersion $Version
    Write-Host "Recovery mode: $recoveryPlan from release commit $releaseCommit."
  } else {
    if (-not (Test-Path -LiteralPath $releaseNotesPath -PathType Leaf)) {
      New-ReleaseNotesDraft -Path $releaseNotesPath -TargetVersion $Version
    }
    Edit-ReleaseNotes -Path $releaseNotesPath
    $releaseNotesContent = Get-ValidatedReleaseNotes -Path $releaseNotesPath -TargetVersion $Version
  }

  if (-not $Resume) {
    Invoke-Checked npm version $Version --no-git-tag-version

    $cargoPath = Join-Path $repositoryRoot 'src-tauri/Cargo.toml'
    $cargoText = Get-Content $cargoPath -Raw
    $cargoPattern = '(?ms)(^\[package\]\s*.*?^version\s*=\s*")' + [regex]::Escape($currentVersion) + '(")'
    if ([regex]::Matches($cargoText, $cargoPattern).Count -ne 1) {
      throw 'Could not uniquely update the package version in src-tauri/Cargo.toml.'
    }
    Write-Utf8NoBom $cargoPath ([regex]::Replace($cargoText, $cargoPattern, "`${1}$Version`${2}"))

    $cargoLockPath = Join-Path $repositoryRoot 'src-tauri/Cargo.lock'
    $cargoLockText = Get-Content $cargoLockPath -Raw
    $cargoLockPattern = '(?m)(^name = "hisfuture"\r?\nversion = ")' + [regex]::Escape($currentVersion) + '(")'
    if ([regex]::Matches($cargoLockText, $cargoLockPattern).Count -ne 1) {
      throw 'Could not uniquely update the hisfuture version in src-tauri/Cargo.lock.'
    }
    Write-Utf8NoBom $cargoLockPath ([regex]::Replace($cargoLockText, $cargoLockPattern, "`${1}$Version`${2}"))

    $tauriPath = Join-Path $repositoryRoot 'src-tauri/tauri.conf.json'
    $tauriText = Get-Content $tauriPath -Raw
    $tauriPattern = '("version"\s*:\s*")' + [regex]::Escape($currentVersion) + '(")'
    if ([regex]::Matches($tauriText, $tauriPattern).Count -ne 1) {
      throw 'Could not uniquely update the version in src-tauri/tauri.conf.json.'
    }
    Write-Utf8NoBom $tauriPath ([regex]::Replace($tauriText, $tauriPattern, "`${1}$Version`${2}"))

    Assert-VersionsEqual -Versions (Get-SourceVersions) -Expected $Version
  }

  Invoke-Checked npm run build
  Invoke-Checked npm run test:nodal
  Invoke-Checked npm run test:release

  Push-Location (Join-Path $repositoryRoot 'src-tauri')
  try {
    Invoke-Checked cargo check --locked
    Invoke-Checked cargo fmt --all -- --check
  } finally {
    Pop-Location
  }

  Invoke-Checked git diff --check
  Assert-VersionsEqual -Versions (Get-SourceVersions) -Expected $Version

  if (-not $Resume) {
    $allowedChanges = @($versionFiles + $releaseNotesRelativePath) | Sort-Object
    $actualChanges = @(
      & git diff --name-only
      & git ls-files --others --exclude-standard
    ) | Where-Object { $_ } | Sort-Object -Unique
    $missingVersionChanges = @($versionFiles | Where-Object { $_ -notin $actualChanges })
    $unexpectedChanges = @($actualChanges | Where-Object { $_ -notin $allowedChanges })
    if ($LASTEXITCODE -ne 0 -or $missingVersionChanges.Count -gt 0 -or $unexpectedChanges.Count -gt 0) {
      throw "Unexpected files changed while preparing the release: $($actualChanges -join ', ')"
    }
  }

  Write-Host ''
  if (-not $Resume) {
    Invoke-Checked git diff --stat
  }
  Write-Host ''
  Write-Host "Current version: $currentVersion"
  Write-Host "Target version:  $Version"
  Write-Host ''
  Write-Host '## Release notes:'
  Write-Host ''
  Write-Host $releaseNotesContent
  Write-Host ''
  Write-Host -NoNewline 'This will trigger a public H.I.S. release. Continue? [y/N] '
  $confirmation = [Console]::ReadLine()
  if ($confirmation -cne 'y') {
    if ($Resume) {
      Write-Host 'Recovery aborted. No commit, tag, or remote reference was changed.'
    } else {
      Invoke-Checked git restore -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
      Write-Host "Release aborted. Version changes were restored; release notes remain at $releaseNotesRelativePath. Nothing was committed, tagged, or pushed."
    }
    exit 0
  }

  Invoke-ReleaseFinalization `
    -Tag $tag `
    -TargetVersion $Version `
    -Branch $branch `
    -ReleaseNotesPath $releaseNotesRelativePath `
    -IsRecovery $Resume.IsPresent `
    -LocalTagExists $localTagExists

  Write-Host "Pushed $tag. GitHub Actions is now building and validating the public release."
} finally {
  Pop-Location
}
