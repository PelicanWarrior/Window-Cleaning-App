const supabaseUrl = 'https://izlsldpoojwtaqkzbwpg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU';

const mandateId = 'MD01KS0DQXTV3FMR749TGQCHP4AS';
const headers = {
  'apikey': anonKey,
  'Authorization': `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

console.log('📌 Updating customer 878 with mandate details...');

const updateRes = await fetch(`${supabaseUrl}/rest/v1/Customers?id=eq.878`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    MandateId: mandateId,
    MandateStatus: 'pending_submission'
  })
});

console.log('Update status:', updateRes.status);
const updated = await updateRes.json();
if (updated[0]) {
  console.log('✅ Updated MandateId:', updated[0].MandateId);
} else {
  console.log('Response:', JSON.stringify(updated));
}
