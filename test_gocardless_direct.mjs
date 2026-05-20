import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testGoCardless() {
  console.log('?? GoCardless Direct Edge Function Test');
  console.log('='.repeat(50));
  
  try {
    // 1. Get a user
    const { data: userData, error: userError } = await supabase.from('Users').select('id').limit(1).single();
    if (userError || !userData) {
      console.error('Failed to get a user:', userError);
      return;
    }
    const testUserId = userData.id;
    console.log('Step 1: Found user ID:', testUserId);

    // 2. Get a customer (avoiding 'Phone' column if it's causing issues)
    const { data: customerData, error: custError } = await supabase.from('Customers').select('id').limit(1).single();
    if (custError || !customerData) {
      console.error('Failed to get a customer:', custError);
      return;
    }
    const customerId = customerData.id;
    console.log('Step 2: Found customer ID:', customerId);

    // 3. Try calling the edge function
    console.log('\nStep 3: Testing gocardless_create_flow edge function...');
    const response = await fetch(\/functions/v1/gocardless_create_flow, {
      method: 'POST',
      headers: {
        'Authorization': Bearer \,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: testUserId,
        customerId: customerId,
        amount: 5000,
        description: 'Test payment',
        openBankingOnly: false
      })
    });

    const responseData = await response.json();
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(responseData, null, 2));

  } catch (err) {
    console.error('Test failed with error:', err);
  }
}

testGoCardless();
