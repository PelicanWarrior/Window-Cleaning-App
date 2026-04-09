$ErrorActionPreference = 'Stop'

$outDir = 'c:/Users/LordG/Window-Cleaning-App/Letters/prospecting'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$locations = @(
  'newcastle-upon-tyne-tyne-and-wear',
  'gateshead-tyne-and-wear',
  'jesmond-tyne-and-wear',
  'heaton-tyne-and-wear',
  'byker-tyne-and-wear',
  'walker-tyne-and-wear',
  'gosforth-tyne-and-wear',
  'kenton-tyne-and-wear',
  'blaydon-tyne-and-wear',
  'whickham-tyne-and-wear',
  'ryton-tyne-and-wear',
  'washington-tyne-and-wear',
  'sunderland-tyne-and-wear',
  'south-shields-tyne-and-wear',
  'north-shields-tyne-and-wear',
  'tynemouth-tyne-and-wear',
  'whitley-bay-tyne-and-wear',
  'jarrow-tyne-and-wear',
  'hebburn-tyne-and-wear',
  'wallsend-tyne-and-wear',
  'chester-le-street-county-durham',
  'consett-county-durham',
  'seaham-county-durham',
  'durham-county-durham',
  'newton-aycliffe-county-durham',
  'ashington-northumberland',
  'blyth-northumberland',
  'cramlington-northumberland',
  'morpeth-northumberland',
  'hexham-northumberland',
  'darlington-county-durham',
  'stockton-on-tees-county-durham',
  'hartlepool-county-durham',
  'middlesbrough-cleveland',
  'redcar-cleveland',
  'guisborough-cleveland',
  'yarm-north-yorkshire',
  'stokesley-north-yorkshire',
  'richmond-north-yorkshire',
  'northallerton-north-yorkshire',
  'thirsk-north-yorkshire',
  'whitby-north-yorkshire',
  'scarborough-north-yorkshire',
  'bridlington-east-yorkshire',
  'hull-east-yorkshire',
  'selby-north-yorkshire',
  'harrogate-north-yorkshire',
  'york-north-yorkshire',
  'carlisle-cumbria',
  'penrith-cumbria',
  'keswick-cumbria',
  'workington-cumbria',
  'whitehaven-cumbria',
  'maryport-cumbria',
  'barrow-in-furness-cumbria',
  'ulverston-cumbria',
  'kendal-cumbria',
  'windermere-cumbria',
  'ambleside-cumbria',
  'alnwick-northumberland',
  'berwick-upon-tweed-northumberland'
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
$seenPhone  = [System.Collections.Generic.HashSet[string]]::new()
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

  $isTargetArea = [regex]::IsMatch($area, 'tyne-and-wear|northumberland|county-durham|durham|cleveland|north-yorkshire|east-yorkshire|cumbria')
  if (-not $isTargetArea) { continue }

  if (-not $seenSource.Add($url)) { continue }
  if (-not $seenSlug.Add($slug))  { continue }
  if (-not $seenPhone.Add($phoneValue)) { continue }

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
  $bizKey       = ($businessName.Trim().ToLower() + '|' + $phoneValue)
  if (-not $seenBizKey.Add($bizKey)) { continue }

  $rows += [pscustomobject]@{
    lead_id         = ('NCL-{0:000}' -f $i)
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

$outFile = Join-Path $outDir 'newcastle_day1_leads_100.csv'
$rows | Select-Object -First 100 | Export-Csv -NoTypeInformation -Encoding UTF8 $outFile

Write-Output "Created: $outFile"
Write-Output "Rows: $($rows.Count)"
$rows | Group-Object area | Sort-Object Count -Descending | Select-Object Name, Count | Format-Table -AutoSize | Out-String | Write-Output
