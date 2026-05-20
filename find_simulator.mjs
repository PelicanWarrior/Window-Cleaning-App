const gcAccessToken = 'sandbox_AV6JwFpcwGKvVXUeoCxzg-hH1zCp-MB5GpzcIq2m';
const mandateId = 'MD01KS0DQXTV3FMR749TGQCHP4AS';

// Try different simulator IDs
const simulatorIds = [
  'mandate_active',
  'mandates_activate', 
  'mandate_submitted',
  'mandate_activated',
  'activate_mandate'
];

for (const simId of simulatorIds) {
  const res = await fetch(`https://api-sandbox.gocardless.com/scenario_simulators/${simId}/actions/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gcAccessToken}`,
      'GoCardless-Version': '2015-07-06',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ links: { mandate: mandateId } })
  });
  
  const data = await res.json();
  if (res.status !== 404) {
    console.log(`✅ Found working simulator: ${simId} (status ${res.status})`);
    console.log(JSON.stringify(data, null, 2));
    break;
  } else {
    console.log(`  ${simId}: 404`);
  }
}

// Also check mandate status
console.log('\nChecking current mandate status...');
const statusRes = await fetch(`https://api-sandbox.gocardless.com/mandates/${mandateId}`, {
  headers: { 'Authorization': `Bearer ${gcAccessToken}`, 'GoCardless-Version': '2015-07-06' }
});
const statusData = await statusRes.json();
console.log('Current status:', statusData.mandates?.status);
