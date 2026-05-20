const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

console.log('📌 Inserting mock GoCardless connection for user 42...\n');

const connectionPayload = {
  UserId: 42,
  OrganisationId: 'test_org_' + Date.now(),
  AccessToken: 'test_token_' + Date.now(),
  Environment: 'sandbox',
  ConnectedAt: new Date().toISOString()
};

fetch(`${supabaseUrl}/rest/v1/GoCardlessConnections`, {
  method: 'POST',
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify(connectionPayload)
})
.then(res => {
  console.log('Insert status:', res.status);
  return res.json();
})
.then(async (data) => {
  if (Array.isArray(data) && data[0]) {
    console.log('✅ Connection inserted:');
    console.log('  OrganisationId:', data[0].OrganisationId);
    console.log('  AccessToken:', data[0].AccessToken.substring(0, 20) + '...');
    console.log('  ConnectedAt:', data[0].ConnectedAt);
  } else if (data.message) {
    console.log('❌ Error:', data.message);
    return;
  } else {
    console.log('Response:', JSON.stringify(data, null, 2));
  }
  
  // Now test the create_flow endpoint
  console.log('\n📌 Testing gocardless_create_flow...\n');
  
  const flowPayload = {
    userId: 42,
    customerId: 889,
    amount: 5000,
    description: 'Test payment for refund testing'
  };
  
  const flowRes = await fetch(`${supabaseUrl}/functions/v1/gocardless_create_flow`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(flowPayload)
  });
  
  console.log('Status:', flowRes.status);
  const flowData = await flowRes.json();
  
  if (flowData.error) {
    console.log('❌ Error:', flowData.error);
  } else if (flowData.flowUrl) {
    console.log('✅ SUCCESS! Flow created:');
    console.log('   Flow URL:', flowData.flowUrl);
    console.log('   Billing Request ID:', flowData.billingRequestId);
    console.log('\n📋 Next steps:');
    console.log('   1. Copy the flow URL above');
    console.log('   2. Visit it in a browser to authenticate');
    console.log('   3. Complete the GoCardless flow');
    console.log('   4. This will activate the mandate');
  } else {
    console.log('Response:', JSON.stringify(flowData, null, 2));
  }
})
.catch(err => console.error('Error:', err.message));
