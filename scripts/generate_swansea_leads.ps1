$ErrorActionPreference = 'Stop'

$outDir = 'c:/Users/LordG/Window-Cleaning-App/Letters/prospecting'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$locations = @(
  'swansea-west-glamorgan',
  'neath-west-glamorgan',
  'port-talbot-west-glamorgan',
  'llanelli-dyfed',
  'ammanford-dyfed',
  'bridgend-mid-glamorgan',
  'porthcawl-mid-glamorgan',
  'maesteg-mid-glamorgan',
  'carmarthen-dyfed',
  'aberdare-mid-glamorgan',
  'pontypridd-mid-glamorgan',
  'merthyr-tydfil-mid-glamorgan',
  'caerphilly-mid-glamorgan',
  'cardiff-south-glamorgan',
  'newport-gwent',
  'haverfordwest-dyfed',
  'barry-south-glamorgan',
  'penarth-south-glamorgan',
  'cwmbran-gwent',
  'pontypool-gwent',
  'ebbw-vale-gwent',
  'milford-haven-dyfed',
  'pembroke-dyfed',
  'tenby-dyfed',
  'brecon-powys',
  'gorseinon-west-glamorgan',
  'morriston-west-glamorgan',
  'pontardawe-west-glamorgan',
  'gowerton-west-glamorgan',
  'llansamlet-west-glamorgan',
  'amman-valley-west-glamorgan',
  'ystradgynlais-powys',
  'builth-wells-powys',
  'llandeilo-dyfed',
  'kidwelly-dyfed',
  'burry-port-dyfed',
  'cowbridge-south-glamorgan',
  'vale-of-glamorgan-south-glamorgan',
  'treorchy-mid-glamorgan',
  'tonypandy-mid-glamorgan',
  'ferndale-mid-glamorgan',
  'blackwood-gwent',
  'risca-gwent',
  'aberystwyth-dyfed'
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
$seenSlug = [System.Collections.Generic.HashSet[string]]::new()
$seenBizKey = [System.Collections.Generic.HashSet[string]]::new()
$i = 1

foreach ($url in $all) {
  if ($url -notmatch '/search/window-cleaners/(?<area>[^/]+)/(?<slug>[^/]+)/(?<id>\d{4,})/(?<phone>\d{7,11})$') {
    continue
  }

  $area = $Matches['area']
  $slug = $Matches['slug']
  $phoneValue = $Matches['phone']

  if ([string]::IsNullOrWhiteSpace($area)) { continue }
  if ($area -eq 'uk') { continue }

  # Keep Swansea and surrounding South Wales areas while avoiding unrelated national spillover.
  $isSouthWalesArea = [regex]::IsMatch($area, 'west-glamorgan|mid-glamorgan|south-glamorgan|dyfed|gwent|powys')

  if (-not $isSouthWalesArea) { continue }

  if (-not $seenSource.Add($url)) { continue }

  if (-not $seenSlug.Add($slug)) { continue }

  $parts = $slug -split '-'
  $nameParts = @()
  foreach ($part in $parts) {
    if ([string]::IsNullOrWhiteSpace($part)) {
      continue
    }

    if ($part -match '^[a-z]{1}$') {
      $nameParts += $part.ToUpper()
    } elseif ($part -match '^\d+$') {
      $nameParts += $part
    } else {
      $nameParts += ($part.Substring(0, 1).ToUpper() + $part.Substring(1))
    }
  }

  $businessName = ($nameParts -join ' ')
  $bizKey = ($businessName.Trim().ToLower() + '|' + $phoneValue + '|' + $area)
  if (-not $seenBizKey.Add($bizKey)) { continue }

  $rows += [pscustomobject]@{
    lead_id         = ('SWA-{0:000}' -f $i)
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

$outFile = Join-Path $outDir 'swansea_day1_leads_100.csv'
$rows | Select-Object -First 100 | Export-Csv -NoTypeInformation -Encoding UTF8 $outFile

Write-Output "Created: $outFile"
Write-Output "Rows: $($rows.Count)"
$rows | Group-Object area | Sort-Object Count -Descending | Select-Object Name, Count | Format-Table -AutoSize | Out-String | Write-Output