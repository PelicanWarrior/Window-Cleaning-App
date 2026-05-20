# Load environment variables
$envFile = Get-Content .env
foreach ($line in $envFile) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '=') {
        $name, $value = $line -split '=', 2
        $name = $name.Trim()
        $value = $value.Trim() -replace '^["'']|["'']$'
        if ($name) { [Environment]::SetEnvironmentVariable($name, $value, "Process") }
    }
}

$url = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_URL")
$key = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_ANON_KEY")

Write-Host "GoCardless Direct API Test (User ID 18)`n"
$userId = 18
$customerId = 889
$amount = 5000

$headers = @{
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}

$body = @{
    userId = $userId
    customerId = $customerId
    amount = $amount
    description = "Test payment"
    openBankingOnly = $false
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$url/functions/v1/gocardless_create_flow" -Method POST -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Success! Status: $($response.StatusCode)"
    $responseData = $response.Content | ConvertFrom-Json
    $responseData | ConvertTo-Json -Depth 10 | Write-Host
} catch {
    Write-Host "Request failed."
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
        $streamReader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $streamReader.ReadToEnd()
        Write-Host "Error Body: $errorBody"
    } else {
        Write-Host "Exception: $_"
    }
}
