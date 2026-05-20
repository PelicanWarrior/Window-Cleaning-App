const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

const ac = new AbortController();
const tid = setTimeout(() => ac.abort(), 20000);

console.log('Testing gocardless_create_flow with user 24 / customer 878...');

fetch(`${supabaseUrl}/functions/v1/gocardless_create_flow`, {
  method: 'POST',
  signal: ac.signal,
  headers: {
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ userId: 24, customerId: 878, amount: 5000, description: 'Test' })
})
.then(res => { clearTimeout(tid); console.log('Status:', res.status); return res.text(); })
.then(txt => { console.log('Body:', txt); })
.catch(err => { clearTimeout(tid); console.log('Error:', err.name, err.message); });
