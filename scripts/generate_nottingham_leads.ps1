$ErrorActionPreference = 'Stop'

$outDir = 'c:/Users/LordG/Window-Cleaning-App/Letters/prospecting'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$locations = @(
  'nottingham-nottinghamshire',
  'west-bridgford-nottinghamshire',
  'beeston-nottinghamshire',
  'long-eaton-derbyshire',
  'chilwell-nottinghamshire',
  'stapleford-nottinghamshire',
  'ilkeston-derbyshire',
  'ripley-derbyshire',
  'heanor-derbyshire',
  'derby-derbyshire',
  'belper-derbyshire',
  'alfreton-derbyshire',
  'mansfield-nottinghamshire',
  'sutton-in-ashfield-nottinghamshire',
  'kirkby-in-ashfield-nottinghamshire',
  'newark-nottinghamshire',
  'southwell-nottinghamshire',
  'retford-nottinghamshire',
  'worksop-nottinghamshire',
  'chesterfield-derbyshire',
  'matlock-derbyshire',
  'loughborough-leicestershire',
  'leicester-leicestershire',
  'melton-mowbray-leicestershire',
  'coalville-leicestershire',
  'grantham-lincolnshire',
  'lincoln-lincolnshire',
  'gainsborough-lincolnshire',
  'new-sleaford-lincolnshire',
  'boston-lincolnshire',
  'oakham-rutland',
  'kettering-northamptonshire',
  'corby-northamptonshire',
  'wellingborough-northamptonshire',
  'northampton-northamptonshire',
  'market-harborough-leicestershire',
  'hinckley-leicestershire',
  'nuneaton-warwickshire',
  'tamworth-staffordshire',
  'burton-on-trent-staffordshire',
  'uttoxeter-staffordshire',
  'ashbourne-derbyshire',
  'buxton-derbyshire',
  'bakewell-derbyshire',
  'sheffield-south-yorkshire',
  'rotherham-south-yorkshire',
  'doncaster-south-yorkshire',
  'scunthorpe-south-humberside',
  'grimsby-south-humberside',
  'louth-lincolnshire',
  'spalding-lincolnshire',
  'wisbech-cambridgeshire',
  'peterborough-cambridgeshire'
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

  $isTargetArea = [regex]::IsMatch($area, 'nottinghamshire|derbyshire|leicestershire|lincolnshire|rutland|northamptonshire|warwickshire|staffordshire|south-yorkshire|south-humberside|cambridgeshire')
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
    lead_id         = ('NTG-{0:000}' -f $i)
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

$outFile = Join-Path $outDir 'nottingham_day1_leads_100.csv'
$rows | Select-Object -First 100 | Export-Csv -NoTypeInformation -Encoding UTF8 $outFile

Write-Output "Created: $outFile"
Write-Output "Rows: $($rows.Count)"
$rows | Group-Object area | Sort-Object Count -Descending | Select-Object Name, Count | Format-Table -AutoSize | Out-String | Write-Output
