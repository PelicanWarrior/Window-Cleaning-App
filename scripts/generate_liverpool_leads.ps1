$ErrorActionPreference = 'Stop'

$outDir = 'c:/Users/LordG/Window-Cleaning-App/Letters/prospecting'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$locations = @(
  'liverpool-merseyside',
  'bootle-merseyside',
  'crosby-merseyside',
  'maghull-merseyside',
  'kirkby-merseyside',
  'prescot-merseyside',
  'huyton-merseyside',
  'st-helens-merseyside',
  'rainhill-merseyside',
  'whiston-merseyside',
  'halewood-merseyside',
  'garston-merseyside',
  'allerton-merseyside',
  'woolton-merseyside',
  'birkenhead-merseyside',
  'wallasey-merseyside',
  'new-brighton-merseyside',
  'prenton-merseyside',
  'bebington-merseyside',
  'west-kirby-merseyside',
  'heswall-merseyside',
  'southport-merseyside',
  'formby-merseyside',
  'ormskirk-lancashire',
  'wigan-greater-manchester',
  'widnes-cheshire',
  'runcorn-cheshire',
  'ellesmere-port-cheshire',
  'chester-cheshire',
  'skelmersdale-lancashire',
  'warrington-cheshire',
  'middlewich-cheshire',
  'nantwich-cheshire',
  'crewe-cheshire',
  'winsford-cheshire',
  'knutsford-cheshire',
  'wilmslow-cheshire',
  'congleton-cheshire',
  'buckley-clwyd',
  'mold-clwyd',
  'rhyl-clwyd',
  'prestatyn-clwyd',
  'colwyn-bay-clwyd',
  'llandudno-clwyd',
  'wrexham-clwyd',
  'lancaster-lancashire',
  'blackpool-lancashire',
  'fleetwood-lancashire',
  'preston-lancashire',
  'chorley-lancashire',
  'bolton-greater-manchester',
  'bury-greater-manchester',
  'rochdale-greater-manchester',
  'salford-greater-manchester',
  'stockport-greater-manchester'
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

  $isTargetArea = [regex]::IsMatch($area, 'merseyside|cheshire|lancashire|greater-manchester|clwyd')
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
    lead_id         = ('LVP-{0:000}' -f $i)
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

$outFile = Join-Path $outDir 'liverpool_day1_leads_100.csv'
$rows | Select-Object -First 100 | Export-Csv -NoTypeInformation -Encoding UTF8 $outFile

Write-Output "Created: $outFile"
Write-Output "Rows: $($rows.Count)"
$rows | Group-Object area | Sort-Object Count -Descending | Select-Object Name, Count | Format-Table -AutoSize | Out-String | Write-Output
