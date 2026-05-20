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
    OrganisationId = "test_organisation_123"  # Mock ID for testing
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
    
    Write-Host "✅ Mock connection created! Status: $($response.StatusCode)`n"
    $responseData = $response.Content | ConvertFrom-Json
    $responseData | ConvertTo-Json -Depth 10 | Write-Host
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "⚠️  Connection already exists for this user`n"
    } else {
        Write-Host "❌ Error: $($_.Exception.Message)`n"
        if ($_.Exception.Response) {
            $errorBody = $_.Exception.Response.Content.ReadAsStream() | Select-Object -ExpandProperty ToString
            Write-Host "Response: $errorBody"
        }
    }
}

Write-Host "`n" 
Write-Host "Now attempting to create GoCardless flow with the mock connection..."
Write-Host ""

$flowData = @{
    userId = 42
    customerId = 889
    amount = 5000
    description = "Test refund flow"
    openBankingOnly = $false
} | ConvertTo-Json

$flowHeaders = @{
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}

try {
    $flowResponse = Invoke-WebRequest -Uri "$url/functions/v1/gocardless_create_flow" `
        -Method POST `
        -Headers $flowHeaders `
        -Body $flowData `
        -ContentType "application/json"
    
    Write-Host "✅ Create flow succeeded! Status: $($flowResponse.StatusCode)`n"
    $flowResult = $flowResponse.Content | ConvertFrom-Json
    $flowResult | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($flowResult.flowUrl) {
        Write-Host "`n🔗 Flow URL: $($flowResult.flowUrl)`n"
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)`n"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Response: $errorBody"
    }
}
