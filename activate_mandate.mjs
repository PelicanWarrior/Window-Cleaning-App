const gcAccessToken = 'sandbox_AV6JwFpcwGKvVXUeoCxzg-hH1zCp-MB5GpzcIq2m';
const mandateId = 'MD01KS0DQXTV3FMR749TGQCHP4AS';

console.log('📌 Activating mandate via GoCardless sandbox simulator API...\n');

// Use the scenario simulator to activate the mandate
const simRes = await fetch('https://api-sandbox.gocardless.com/scenario_simulators/mandate_activated/actions/run', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${gcAccessToken}`,
    'GoCardless-Version': '2015-07-06',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ links: { mandate: mandateId } })
});

console.log('Simulator status:', simRes.status);
const simData = await simRes.json();
console.log('Response:', JSON.stringify(simData, null, 2));

if (simRes.ok) {
  console.log('\n✅ Mandate activated!');
}
