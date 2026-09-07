param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$')]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$ArtifactPath,

  [string]$Tag = "v$Version",
  [string]$Notes = "H.I.S. Future $Version"
)

$resolvedArtifact = Resolve-Path -LiteralPath $ArtifactPath -ErrorAction Stop
$signaturePath = "$resolvedArtifact.sig"
if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
  throw "No existe la firma correspondiente: $signaturePath"
}

$signature = (Get-Content -LiteralPath $signaturePath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($signature)) {
  throw "La firma está vacía: $signaturePath"
}

$artifactName = [System.IO.Path]::GetFileName($resolvedArtifact)
$encodedTag = [System.Uri]::EscapeDataString($Tag)
$encodedArtifact = [System.Uri]::EscapeDataString($artifactName)
$downloadUrl = "https://github.com/Adegaxta/H.I.S.Future/releases/download/$encodedTag/$encodedArtifact"
$outputPath = Join-Path ([System.IO.Path]::GetDirectoryName($resolvedArtifact)) "latest.json"

$manifest = [ordered]@{
  version = $Version
  notes = $Notes
  pub_date = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $signature
      url = $downloadUrl
    }
  }
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputPath -Encoding utf8
Write-Output $outputPath
