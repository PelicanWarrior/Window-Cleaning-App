import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim()
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim()

if (!supabaseUrl || !supabaseKey) {
  console.error('URL or Key not found in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.log('UNAUTHORIZED: ' + error.message)
    // Try public query just to see if we can connect
    const { data: test, error: testErr } = await supabase.from('profiles').select('*').limit(1)
    if (testErr) console.log('Public profiles query error: ' + testErr.message)
    else console.log('Public profiles query success')
  } else {
    console.log('Users found:', data.users.length)
    const user = data.users.find(u => u.email === 'gocardless-test@test.com')
    if (user) console.log('User ID:', user.id, 'Confirmed:', !!user.email_confirmed_at)
    else console.log('User not found')
  }
}

run()
