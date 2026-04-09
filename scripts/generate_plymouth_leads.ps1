$ErrorActionPreference = 'Stop'

$outDir = 'c:/Users/LordG/Window-Cleaning-App/Letters/prospecting'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$locations = @(
  'plymouth-devon',
  'ivybridge-devon',
  'saltash-cornwall',
  'torpoint-cornwall',
  'tavistock-devon',
  'yelmpton-devon',
  'modbury-devon',
  'kingsbridge-devon',
  'totnes-devon',
  'newton-abbot-devon',
  'paignton-devon',
  'torquay-devon',
  'brixham-devon',
  'buckfastleigh-devon',
  'okehampton-devon',
  'launceston-cornwall',
  'liskeard-cornwall',
  'bodmin-cornwall',
  'truro-cornwall',
  'st-austell-cornwall',
  'falmouth-cornwall',
  'penryn-cornwall',
  'redruth-cornwall',
  'hayle-cornwall',
  'penzance-cornwall',
  'exeter-devon',
  'exmouth-devon',
  'sidmouth-devon',
  'seaton-devon',
  'honiton-devon',
  'crediton-devon',
  'tiverton-devon',
  'barnstaple-devon',
  'bideford-devon',
  'ilfracombe-devon',
  'holsworthy-devon',
  'bude-cornwall',
  'camelford-cornwall',
  'padstow-cornwall',
  'newquay-cornwall',
  'helston-cornwall',
  'st-ives-cornwall',
  'callington-cornwall',
  'wadebridge-cornwall',
  'teignmouth-devon',
  'dawlish-devon',
  'bovey-tracey-devon',
  'torbay-devon',
  'south-brent-devon',
  'taunton-somerset',
  'bridgwater-somerset'
)

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

    $links = $pageMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique

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
$seenSource = [System.Collections.Generic.HashSet[string]]::new()
$seenSlug   = [System.Collections.Generic.HashSet[string]]::new()
$seenBizKey = [System.Collections.Generic.HashSet[string]]::new()
$i = 1

foreach ($url in $all) {
  if ($url -notmatch '/search/window-cleaners/(?<area>[^/]+)/(?<slug>[^/]+)/(?<id>\d{4,})/(?<phone>\d{7,11})$') {
    continue
  }

  $area       = $Matches['area']
  $slug       = $Matches['slug']
  $phoneValue = $Matches['phone']

  if ([string]::IsNullOrWhiteSpace($area)) { continue }
  if ($area -eq 'uk') { continue }

  $isTargetArea = [regex]::IsMatch($area, 'devon|cornwall|somerset')
  if (-not $isTargetArea) { continue }

  if (-not $seenSource.Add($url)) { continue }
  if (-not $seenSlug.Add($slug))  { continue }

  $parts     = $slug -split '-'
  $nameParts = @()
  foreach ($part in $parts) {
    if ([string]::IsNullOrWhiteSpace($part)) { continue }
    if ($part -match '^[a-z]$') {
      $nameParts += $part.ToUpper()
    } elseif ($part -match '^\d+$') {
      $nameParts += $part
    } else {
      $nameParts += ($part.Substring(0,1).ToUpper() + $part.Substring(1))
    }
  }

  $businessName = ($nameParts -join ' ')
  $bizKey       = ($businessName.Trim().ToLower() + '|' + $phoneValue + '|' + $area)
  if (-not $seenBizKey.Add($bizKey)) { continue }

  $rows += [pscustomobject]@{
    lead_id         = ('PLY-{0:000}' -f $i)
    area            = $area
    business_name   = $businessName
    owner_name      = ''
    email           = ''
    phone           = $phoneValue
    website         = ''
    source_url      = $url
    status          = 'new'
    last_contacted  = ''
    sequence_step   = ''
    next_follow_up  = ''
    response_status = ''
    notes           = 'Email to research from website/contact page'
  }

  $i++
  if ($rows.Count -ge 100) { break }
}

$outFile = Join-Path $outDir 'plymouth_day1_leads_100.csv'
$rows | Select-Object -First 100 | Export-Csv -NoTypeInformation -Encoding UTF8 $outFile

Write-Output "Created: $outFile"
Write-Output "Rows: $($rows.Count)"
$rows | Group-Object area | Sort-Object Count -Descending | Select-Object Name, Count | Format-Table -AutoSize | Out-String | Write-Output
