const gcAccessToken = 'sandbox_AV6JwFpcwGKvVXUeoCxzg-hH1zCp-MB5GpzcIq2m';
const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';
const mandateId = 'MD01KS0DQXTV3FMR749TGQCHP4AS';

// Check mandate status
const statusRes = await fetch(`https://api-sandbox.gocardless.com/mandates/${mandateId}`, {
  headers: { 'Authorization': `Bearer ${gcAccessToken}`, 'GoCardless-Version': '2015-07-06' }
});
const { mandates } = await statusRes.json();
console.log('Mandate status:', mandates.status);

if (mandates.status === 'active') {
  console.log('✅ Mandate is active! Collecting payment...\n');
  
  const collectRes = await fetch(`${supabaseUrl}/functions/v1/gocardless_collect_payment`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 24, customerId: 878, amount: 5000, description: 'Test payment' })
  });
  
  console.log('Collect status:', collectRes.status);
  const collectData = await collectRes.json();
  console.log('Result:', JSON.stringify(collectData, null, 2));
  
} else if (mandates.status === 'pending_submission') {
  console.log('⏳ Mandate still pending_submission. Trying to submit via GoCardless API...\n');
  
  // Try to submit the mandate directly
  const submitRes = await fetch(`https://api-sandbox.gocardless.com/mandates/${mandateId}/actions/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gcAccessToken}`,
      'GoCardless-Version': '2015-07-06',
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  
  console.log('Submit status:', submitRes.status);
  const submitData = await submitRes.json();
  console.log('Submit result:', JSON.stringify(submitData, null, 2));
}
