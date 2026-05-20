const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

console.log('📌 Checking user 24 (has GoCardless connection)...\n');

// Get user 24's info
fetch(`${supabaseUrl}/rest/v1/Users?UserId=eq.24`, {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`
  }
})
.then(res => res.json())
.then(async (users) => {
  if (!users[0]) {
    console.log('User 24 not found');
    return;
  }
  
  console.log('✅ User 24 found:', users[0].UserName || users[0].email_address);
  
  // Get a customer for user 24
  const customersRes = await fetch(`${supabaseUrl}/rest/v1/Customers?UserId=eq.24&limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    }
  });
  
  const customers = await customersRes.json();
  if (!customers[0]) {
    console.log('❌ No customers for user 24');
    return;
  }
  
  const customer = customers[0];
  console.log('✅ Customer found:', customer.CustomerName, '(ID:', customer.id + ')');
  console.log('');
  
  // Test creating a flow for user 24
  console.log('📌 Testing gocardless_create_flow with real connection...\n');
  
  const flowPayload = {
    userId: 24,
    customerId: customer.id,
    amount: 5000,
    description: 'Test payment from automation',
    openBankingOnly: false
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
    console.log('❌ Error:', flowData.error);
  } else if (flowData.flowUrl) {
    console.log('✅ Flow created successfully!');
    console.log('');
    console.log('   Billing Request ID:', flowData.billingRequestId);
    console.log('   Flow URL:', flowData.flowUrl);
    console.log('');
    console.log('Next step: Go to the flow URL to test the payment!');
  } else {
    console.log('Response:', JSON.stringify(flowData, null, 2));
  }
})
.catch(err => console.error('Error:', err.message));
