const url = 'https://izlsldpoojwtaqkzbwpg.supabase.co/functions/v1/gocardless_create_flow';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

const payload = {
  userId: 42,
  customerId: 889,
  amount: 5000,
  description: 'Test payment for GoCardless'
};

console.log('🧪 Testing gocardless_create_flow');
console.log('Payload:', payload);
console.log('');

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(res => {
  console.log('Status:', res.status);
  return res.json();
})
.then(data => {
  console.log('Response:', JSON.stringify(data, null, 2));
  if (data.flowUrl) {
    console.log('\n✅ Flow created successfully!');
    console.log('URL:', data.flowUrl);
  }
})
.catch(err => {
  console.error('Error:', err.message);
});
