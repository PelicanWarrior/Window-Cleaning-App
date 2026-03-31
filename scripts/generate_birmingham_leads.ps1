$ErrorActionPreference = 'Stop'

$outDir = 'c:/Users/LordG/Window-Cleaning-App/Letters/prospecting'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$locations = @(
  'birmingham-west-midlands',
  'solihull-west-midlands',
  'sutton-coldfield-west-midlands',
  'west-bromwich-west-midlands',
  'wolverhampton-west-midlands',
  'walsall-west-midlands',
  'dudley-west-midlands',
  'smethwick-west-midlands',
  'stourbridge-west-midlands',
  'coventry-west-midlands',
  'redditch-worcestershire',
  'tamworth-staffordshire'
)

$allowedAreas = [System.Collections.Generic.HashSet[string]]::new()
foreach ($loc in $locations) { [void]$allowedAreas.Add($loc) }

$all = [System.Collections.Generic.HashSet[string]]::new()

foreach ($loc in $locations) {
  foreach ($p in 1..8) {
    $u = if ($p -eq 1) {
      "https://www.thomsonlocal.com/search/window-cleaners/$loc"
    } else {
      "https://www.thomsonlocal.com/search/window-cleaners/$loc?page=$p"
    }

    $html = & curl.exe -Ls -A "Mozilla/5.0" $u
    if ([string]::IsNullOrWhiteSpace($html)) { continue }

    $pageMatches = [regex]::Matches(
      $html,
      'href="(/search/window-cleaners/(?<area>[^/]+)/(?<slug>[^/]+)/(?<id>\d{4,})/(?<phone>\d{7,11}))"'
    )

    $links = $pageMatches | ForEach-Object {
      if ($allowedAreas.Contains($_.Groups['area'].Value)) {
        $_.Groups[1].Value
      }
    } | Select-Object -Unique

    if (($links | Measure-Object).Count -eq 0) {
      if ($p -gt 2) { break }
      continue
    }

    foreach ($l in $links) {
      [void]$all.Add("https://www.thomsonlocal.com$l")
    }
  }
}

$rows = @()
$seen = [System.Collections.Generic.HashSet[string]]::new()
$i = 1

foreach ($url in $all) {
  if ($url -notmatch '/search/window-cleaners/(?<area>[^/]+)/(?<slug>[^/]+)/(?<id>\d{4,})/(?<phone>\d{7,11})$') {
    continue
  }

  $area = $Matches['area']
  if (-not $allowedAreas.Contains($area)) { continue }

  $slug = $Matches['slug']
  if (-not $seen.Add($slug)) { continue }

  $parts = $slug -split '-'
  $nameParts = @()
  foreach ($part in $parts) {
    if ($part -match '^[a-z]{1}$') {
      $nameParts += $part.ToUpper()
    } elseif ($part -match '^\d+$') {
      $nameParts += $part
    } else {
      $nameParts += ($part.Substring(0, 1).ToUpper() + $part.Substring(1))
    }
  }

  $rows += [pscustomobject]@{
    lead_id        = ('BRM-{0:000}' -f $i)
    area           = $area
    business_name  = ($nameParts -join ' ')
    owner_name     = ''
    email          = ''
    phone          = $Matches['phone']
    website        = ''
    source_url     = $url
    status         = 'new'
    last_contacted = ''
    sequence_step  = ''
    next_follow_up = ''
    response_status= ''
    notes          = 'Email to research from website/contact page'
  }

  $i++
  if ($rows.Count -ge 100) { break }
}

$outFile = Join-Path $outDir 'birmingham_day1_leads_100.csv'
$rows | Select-Object -First 100 | Export-Csv -NoTypeInformation -Encoding UTF8 $outFile

Write-Output "Created: $outFile"
Write-Output "Rows: $($rows.Count)"
$rows | Group-Object area | Sort-Object Count -Descending | Select-Object Name, Count | Format-Table -AutoSize | Out-String | Write-Output
