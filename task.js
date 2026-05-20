const URL = "https://izlsldpoojwtaqkzbwpg.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bHNsZHBvb2p3dGFxa3pid3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTIyMjMsImV4cCI6MjA4MzA2ODIyM30.lQH5IjzfY89iWB2N8BUD8UHa3Z4U-HPSnZ30GiHcTPU";
const h = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };

async function run() {
  const inv55 = await fetch(`${URL}/rest/v1/CustomerInvoices?id=eq.55&select=*`, { headers: h }).then(r => r.json()).then(d => d[0]);
  console.log("Invoice 55 Columns:", Object.keys(inv55).join(", "));
  
  const jobs55 = await fetch(`${URL}/rest/v1/CustomerInvoiceJobs?InvoiceID=eq.55&select=*`, { headers: h }).then(r => r.json());
  if (jobs55[0]) console.log("Job Columns:", Object.keys(jobs55[0]).join(", "));

  const invData = {};
  const skip = ["id", "created_at", "CreatedAt"];
  for (let key in inv55) { if (!skip.includes(key)) invData[key] = inv55[key]; }
  
  // Try to use InvoiceNo instead of InvoiceNumber if the latter failed
  if (invData.InvoiceNumber !== undefined) {
    invData.InvoiceNumber = "INV-" + Date.now();
  } else if (invData.InvoiceNo !== undefined) {
    invData.InvoiceNo = "INV-" + Date.now();
  }
  
  invData.InvoiceDate = new Date().toISOString();

  const invResp = await fetch(`${URL}/rest/v1/CustomerInvoices`, { method: "POST", headers: h, body: JSON.stringify(invData) });
  const newInvs = await invResp.json();
  
  if (!newInvs[0]) {
    console.error("Invoice insertion failed:", JSON.stringify(newInvs, null, 2));
    process.exit(1);
  }
  const newInv = newInvs[0];
  console.log("New Invoice ID:", newInv.id);

  const sourceJob = jobs55[0] || {};
  const jobData = {};
  for (let key in sourceJob) { if (!skip.includes(key)) jobData[key] = sourceJob[key]; }
  
  jobData.InvoiceID = newInv.id;
  if (!(jobData.Price > 0)) jobData.Price = 10.00;

  const jobResp = await fetch(`${URL}/rest/v1/CustomerInvoiceJobs`, { method: "POST", headers: h, body: JSON.stringify(jobData) });
  const newJobs = await jobResp.json();
  const newJob = newJobs[0];
  console.log("New Job ID:", newJob ? newJob.id : "N/A");

  const resFn = await fetch(`${URL}/functions/v1/gocardless_collect_payment`, {
    method: "POST",
    headers: { ...h, "Prefer": null },
    body: JSON.stringify({ userId: 24, customerId: 878, invoiceId: newInv.id })
  });
  const fnBody = await resFn.json();
  console.log("Fn Status:", resFn.status);
  console.log("Fn Response:", JSON.stringify(fnBody, null, 2));
}
run().catch(console.error);
