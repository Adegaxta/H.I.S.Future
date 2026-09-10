param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$')]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$ArtifactPath,

  [string]$Tag = "v$Version",
  [string]$Notes = "H.I.S. Future $Version",

  [ValidatePattern('^[^/]+/[^/]+$')]
  [string]$Repository = "Adegaxta/H.I.S.Future"
)

$resolvedArtifact = (Resolve-Path -LiteralPath $ArtifactPath -ErrorAction Stop).Path
$signaturePath = "$resolvedArtifact.sig"
if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
  throw "No existe la firma correspondiente: $signaturePath"
}

$signature = (Get-Content -LiteralPath $signaturePath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($signature)) {
  throw "La firma está vacía: $signaturePath"
}

$artifactName = [System.IO.Path]::GetFileName($resolvedArtifact)
$githubAssetName = ($artifactName -replace '[\s.]+', '.').Trim('.')
$encodedTag = [System.Uri]::EscapeDataString($Tag)
$encodedArtifact = [System.Uri]::EscapeDataString($githubAssetName)
$downloadUrl = "https://github.com/$Repository/releases/download/$encodedTag/$encodedArtifact"
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

$json = $manifest | ConvertTo-Json -Depth 5
$utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)

$writtenBytes = [System.IO.File]::ReadAllBytes($outputPath)
if (
  $writtenBytes.Length -ge 3 -and
  $writtenBytes[0] -eq 0xEF -and
  $writtenBytes[1] -eq 0xBB -and
  $writtenBytes[2] -eq 0xBF
) {
  throw "latest.json contiene un BOM UTF-8 inesperado: $outputPath"
}

try {
  $validatedJson = $utf8NoBom.GetString($writtenBytes)
  $null = $validatedJson | ConvertFrom-Json -ErrorAction Stop
} catch {
  throw "latest.json no puede leerse como UTF-8 válido y parsearse como JSON: $($_.Exception.Message)"
}

Write-Output $outputPath
