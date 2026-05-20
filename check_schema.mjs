const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

// Try to query the table to see what it looks like
fetch(`${supabaseUrl}/rest/v1/GoCardlessConnections?limit=1`, {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`
  }
})
.then(res => res.json())
.then(data => {
  console.log('GoCardlessConnections table schema (from first record):');
  if (Array.isArray(data) && data[0]) {
    console.log(JSON.stringify(data[0], null, 2));
  } else if (Array.isArray(data)) {
    console.log('Table is empty. Showing table structure...');
  }
})
.catch(err => console.error('Error:', err.message));
