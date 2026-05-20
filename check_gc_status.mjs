const gcAccessToken = 'sandbox_AV6JwFpcwGKvVXUeoCxzg-hH1zCp-MB5GpzcIq2m';
const mandateId = 'MD01KS0DQXTV3FMR749TGQCHP4AS';

console.log('📌 Checking mandate status from GoCardless API...\n');

const res = await fetch(`https://api-sandbox.gocardless.com/mandates/${mandateId}`, {
  headers: {
    'Authorization': `Bearer ${gcAccessToken}`,
    'GoCardless-Version': '2015-07-06'
  }
});

console.log('Status:', res.status);
const data = await res.json();

if (data.mandates) {
  const m = data.mandates;
  console.log('Mandate:', m.id);
  console.log('Status:', m.status);
  console.log('Reference:', m.reference);
  console.log('Customer:', m.links?.customer);
} else {
  console.log('Response:', JSON.stringify(data, null, 2));
}

// List available scenario simulators
console.log('\n📌 Checking available scenario simulators...');
const simListRes = await fetch('https://api-sandbox.gocardless.com/scenario_simulators', {
  headers: {
    'Authorization': `Bearer ${gcAccessToken}`,
    'GoCardless-Version': '2015-07-06'
  }
});

console.log('List status:', simListRes.status);
const simListData = await simListRes.json();
if (simListData.scenario_simulators) {
  console.log('Available simulators:');
  for (const s of simListData.scenario_simulators) {
    console.log(' -', s.id);
  }
} else {
  console.log('Response:', JSON.stringify(simListData, null, 2));
}
