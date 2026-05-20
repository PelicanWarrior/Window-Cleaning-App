const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

console.log('📌 Listing GoCardless connections...\n');

fetch(`${supabaseUrl}/rest/v1/GoCardlessConnections`, {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`
  }
})
.then(res => res.json())
.then(async (connections) => {
  console.log('Found', connections.length, 'connections:\n');
  
  for (const conn of connections) {
    console.log(`User ${conn.UserId}:`);
    console.log(`  Org: ${conn.OrganisationId}`);
    console.log(`  Token: ${conn.AccessToken.substring(0, 20)}...`);
    console.log(`  Connected: ${conn.ConnectedAt}`);
    console.log('');
  }
  
  if (connections.length === 0) {
    console.log('No connections found!');
    return;
  }
  
  // Get customers for first connection's user
  const userId = connections[0].UserId;
  console.log(`\n📌 Getting customers for user ${userId}...`);
  
  const custRes = await fetch(`${supabaseUrl}/rest/v1/Customers?UserId=eq.${userId}&limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    }
  });
  
  const customers = await custRes.json();
  if (customers[0]) {
    console.log(`✅ Found customer: ${customers[0].CustomerName} (ID: ${customers[0].id})`);
    console.log(`\n🚀 Creating flow for user ${userId}...`);
    
    const flowPayload = {
      userId: userId,
      customerId: customers[0].id,
      amount: 5000,
      description: 'Test refund flow'
    };
    
    const flowRes = await fetch(`${supabaseUrl}/functions/v1/gocardless_create_flow`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(flowPayload)
    });
    
    const flowData = await flowRes.json();
    if (flowData.error) {
      console.log('❌', flowData.error);
    } else if (flowData.flowUrl) {
      console.log('✅ Flow created!');
      console.log('   URL:', flowData.flowUrl);
      console.log('   Billing Request:', flowData.billingRequestId);
    }
  }
})
.catch(err => console.error('Error:', err.message));
