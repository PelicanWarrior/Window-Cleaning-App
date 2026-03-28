param(
  [Parameter(Mandatory = $true)]
  [string]$Area,

  [Parameter(Mandatory = $false)]
  [int]$Count = 100,

  [Parameter(Mandatory = $false)]
  [string]$MasterFile = "./manchester_day1_leads_100.csv"
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $MasterFile)) {
  throw "Master file not found: $MasterFile"
}

$rows = Import-Csv $MasterFile
$today = Get-Date -Format 'yyyy-MM-dd'
$batchFile = "./batch_${today}_${Area}.csv"

$batch = $rows |
  Where-Object { $_.area -eq $Area -and $_.status -eq 'new' } |
  Select-Object -First $Count

if (($batch | Measure-Object).Count -eq 0) {
  Write-Host "No new leads found for area: $Area"
  exit 0
}

$batch | Export-Csv -NoTypeInformation -Encoding UTF8 $batchFile

$selected = @{}
foreach ($b in $batch) {
  $selected[$b.lead_id] = $true
}

foreach ($r in $rows) {
  if ($selected.ContainsKey($r.lead_id)) {
    $r.status = 'queued'
    $r.next_follow_up = (Get-Date).AddDays(3).ToString('yyyy-MM-dd')
  }
}

$rows | Export-Csv -NoTypeInformation -Encoding UTF8 $MasterFile
Write-Host "Created batch: $batchFile"
Write-Host "Queued leads: $($batch.Count)"
