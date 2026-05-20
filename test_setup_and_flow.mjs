const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

console.log('📌 Inserting mock GoCardless connection...\n');

// First, try to insert the connection
const connectionPayload = {
  UserId: 42,
  OrganisationId: 'test_org_' + Date.now(),
  AccessToken: 'test_token_' + Date.now(),
  RefreshToken: 'test_refresh_' + Date.now(),
  Environment: 'sandbox'
};

console.log('Connection payload:', connectionPayload);

fetch(`${supabaseUrl}/rest/v1/GoCardlessConnections`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify(connectionPayload)
})
.then(res => {
  console.log('\nConnection insert status:', res.status);
  return res.json();
})
.then(async (data) => {
  if (data[0]) {
    console.log('✅ Connection inserted:', data[0]);
  } else if (data.error) {
    console.log('⚠️  Error:', data.error);
  } else {
    console.log('Response:', JSON.stringify(data, null, 2));
  }
  
  // Now test the create_flow endpoint
  console.log('\n📌 Testing gocardless_create_flow...\n');
  
  const flowPayload = {
    userId: 42,
    customerId: 889,
    amount: 5000,
    description: 'Test payment'
  };
  
  const flowRes = await fetch(`${supabaseUrl}/functions/v1/gocardless_create_flow`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(flowPayload)
  });
  
  console.log('Flow endpoint status:', flowRes.status);
  const flowData = await flowRes.json();
  console.log('Flow response:', JSON.stringify(flowData, null, 2));
  
  if (flowData.flowUrl) {
    console.log('\n✨ SUCCESS! Flow created with URL:', flowData.flowUrl);
  }
})
.catch(err => console.error('Error:', err.message));
