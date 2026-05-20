$url = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_URL")
$key = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_ANON_KEY")

$headers = @{
    "Authorization" = "Bearer $key"
    "apikey" = "$key"
    "Content-Type" = "application/json"
}

Write-Host "--- Step 1: Insert Mock Connection ---"
$connectionData = @{
    UserId = 42
    OrganisationId = "test_org_42"
    AccessToken = "test_token"
    RefreshToken = "test_refresh"
    Environment = "sandbox"
} | ConvertTo-Json

try {
    $res1 = Invoke-RestMethod -Uri "$url/rest/v1/GoCardlessConnections" -Method Post -Headers $headers -Body $connectionData
    Write-Host "Success: Mock connection inserted."
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "Info: Connection already exists."
    } else {
        Write-Host "Error inserting connection: $($_.Exception.Message)"
    }
}

Write-Host "`n--- Step 2: Call gocardless_create_flow ---"
$flowData = @{ userId = 42 } | ConvertTo-Json
try {
    $res2 = Invoke-RestMethod -Uri "$url/functions/v1/gocardless_create_flow" -Method Post -Headers $headers -Body $flowData
    Write-Host "Success: Flow created."
    $res2 | ConvertTo-Json | Write-Host
} catch {
    Write-Host "Error calling function: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
        Write-Host "Response: $errBody"
    }
}
