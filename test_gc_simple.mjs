import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log('🧪 GoCardless Test\n');
  
  // Get test user
  const { data: user } = await supabase
    .from('Users')
    .select('id')
    .eq('email_address', 'gocardless-test@test.com')
    .maybeSingle();
  
  let userId = user?.id;
  
  if (!userId) {
    console.log('Creating test user...');
    const { data: newUser } = await supabase
      .from('Users')
      .insert({ UserName: 'gc_test', email_address: 'gocardless-test@test.com' })
      .select('id')
      .single();
    userId = newUser.id;
  }
  
  console.log('User ID:', userId);
  
  // Create test customer
  console.log('Creating test customer with name "Successful"...');
  const { data: cust, error: custError } = await supabase
    .from('Customers')
    .insert({
      UserId: userId,
      CustomerName: 'Successful Testcase',
      Address: '123 Test St',
      // Town column missing, omitting
      Postcode: 'TS1 1TS',
      EmailAddress: 'cust@test.com',
      Price: 50
    })
    .select('id')
    .single();
  
  if (custError) { console.error('Error creating customer:', custError); process.exit(1); }
  console.log('Customer ID:', cust.id);
  console.log('\n✅ Test setup complete. You can now test the GoCardless flow via UI.');
}

run().catch(console.error);
