param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidatePattern('^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')]
  [string]$Version,

  [switch]$SkipEditor
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
  }
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

  $dirtyFiles = @(& git status --porcelain --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect the Git working tree.'
  }
  $dirtyPaths = @($dirtyFiles | ForEach-Object { $_.Substring(3).Replace('\', '/') })
  $unexpectedInitialChanges = @($dirtyPaths | Where-Object { $_ -ne $releaseNotesRelativePath })
  if ($unexpectedInitialChanges.Count -gt 0) {
    throw "The working tree must be clean except for $releaseNotesRelativePath. Commit or stash these files first: $($unexpectedInitialChanges -join ', ')"
  }

  $currentVersions = Get-SourceVersions
  $currentVersion = [string]$currentVersions.npm
  Assert-VersionsEqual -Versions $currentVersions -Expected $currentVersion
  if ($currentVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "Current version '$currentVersion' is not a supported X.Y.Z semantic version."
  }

  if ((Compare-SemVer -Left $Version -Right $currentVersion) -le 0) {
    throw "Target version $Version must be greater than current version $currentVersion."
  }

  Invoke-Checked git fetch --tags origin

  $tag = "v$Version"
  & git show-ref --verify --quiet "refs/tags/$tag"
  if ($LASTEXITCODE -eq 0) {
    throw "Local tag $tag already exists."
  }

  $remoteTag = @(& git ls-remote --tags origin "refs/tags/$tag")
  if ($LASTEXITCODE -ne 0) {
    throw "Could not check whether remote tag $tag already exists on origin."
  }
  if ($remoteTag.Count -gt 0) {
    throw "Remote tag $tag already exists on origin."
  }

  Write-Host "Current version: $currentVersion"
  Write-Host "Target version:  $Version"

  if (-not (Test-Path -LiteralPath $releaseNotesPath -PathType Leaf)) {
    New-ReleaseNotesDraft -Path $releaseNotesPath -TargetVersion $Version
  }
  Edit-ReleaseNotes -Path $releaseNotesPath
  $releaseNotesContent = Get-ValidatedReleaseNotes -Path $releaseNotesPath -TargetVersion $Version

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

  Invoke-Checked npm run build
  Invoke-Checked npm run test:nodal

  Push-Location (Join-Path $repositoryRoot 'src-tauri')
  try {
    Invoke-Checked cargo check --locked
    Invoke-Checked cargo fmt --all -- --check
  } finally {
    Pop-Location
  }

  Invoke-Checked git diff --check
  Assert-VersionsEqual -Versions (Get-SourceVersions) -Expected $Version

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

  Write-Host ''
  Invoke-Checked git diff --stat
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
    Invoke-Checked git restore -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
    Write-Host "Release aborted. Version changes were restored; release notes remain at $releaseNotesRelativePath. Nothing was committed, tagged, or pushed."
    exit 0
  }

  Invoke-Checked git add -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json $releaseNotesRelativePath
  Invoke-Checked git commit -m "chore: release $tag"
  Invoke-Checked git tag -a $tag -m "H.I.S. $Version"
  Invoke-Checked git push --atomic origin "HEAD:refs/heads/$branch" "refs/tags/$tag:refs/tags/$tag"

  Write-Host "Pushed $tag. GitHub Actions is now building and validating the public release."
} finally {
  Pop-Location
}
