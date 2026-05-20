const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

console.log('📌 Checking customer 878 after flow completion...\n');

const headers = { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` };

// Check customer 878
const custRes = await fetch(`${supabaseUrl}/rest/v1/Customers?id=eq.878`, { headers });
const [cust] = await custRes.json();
console.log('Customer 878:');
console.log('  GocardlessCustomerId:', cust?.GocardlessCustomerId);
console.log('  MandateId:', cust?.MandateId);
console.log('  MandateStatus:', cust?.MandateStatus);
console.log('');

// Check latest billing request
const brRes = await fetch(`${supabaseUrl}/rest/v1/GoCardlessWebhookEvents?order=id.desc&limit=5`, { headers });
const events = await brRes.json();
if (events.length > 0) {
  console.log(`Last ${events.length} webhook events:`);
  for (const ev of events) {
    console.log(`  [${ev.EventId}] ${ev.ResourceType}.${ev.Action} - ${ev.ResourceId}`);
  }
} else {
  console.log('No webhook events yet.');
}

console.log('');
console.log('Now syncing billing request to get mandate ID...');

// Sync the billing request to get the mandate
const syncRes = await fetch(`${supabaseUrl}/functions/v1/gocardless_sync_billing_request`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ billingRequestId: 'BRQ01KS0DME22ND4KCW6B3K8X6CT3', customerId: 878, userId: 24 })
});

console.log('Sync status:', syncRes.status);
const syncData = await syncRes.json();
console.log('Sync result:', JSON.stringify(syncData, null, 2));
