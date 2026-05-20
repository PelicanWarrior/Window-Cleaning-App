# Setup mock GoCardless connection for testing
$envFile = Get-Content .env
foreach ($line in $envFile) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '=') {
        $name, $value = $line -split '=', 2
        $name = $name.Trim()
        $value = $value.Trim() -replace '^["'']|["'']$'
        if ($name) {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$url = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_URL")
$key = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_ANON_KEY")

Write-Host "Inserting mock GoCardless connection for testing..."
Write-Host "User ID: 42`n"

$headers = @{
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
    "Prefer" = "return=representation"
}

$connectionData = @{
    UserId = 42
    OrganisationId = "test_organisation_123"
    AccessToken = "test_access_token"
    RefreshToken = "test_refresh_token"
    Environment = "sandbox"
} | ConvertTo-Json

Write-Host "Payload: $connectionData`n"

try {
    $response = Invoke-WebRequest -Uri "$url/rest/v1/GoCardlessConnections" `
        -Method POST `
        -Headers $headers `
        -Body $connectionData `
        -ContentType "application/json"
    
    Write-Host "âœ… Mock connection created! Status: $($response.StatusCode)`n"
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "âš ï¸  Connection already exists for this user`n"
    } else {
        Write-Host "â Œ Error inserting connection: $($_.Exception.Message)"
    }
}

Write-Host "Testing gocardless_create_flow edge function..."
$flowPayload = @{ userId = 42 } | ConvertTo-Json
try {
    $flowResponse = Invoke-WebRequest -Uri "$url/functions/v1/gocardless_create_flow" `
        -Method POST `
        -Headers $headers `
        -Body $flowPayload `
        -ContentType "application/json"
    
    Write-Host "âœ… Flow Created Successfully!"
    $flowResponse.Content | Write-Host
} catch {
    Write-Host "â Œ Error calling function: $($_.Exception.Message)"
}
