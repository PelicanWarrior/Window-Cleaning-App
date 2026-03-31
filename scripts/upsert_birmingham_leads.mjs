import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = path.join(root, '.env')
const leadsPath = path.join(root, 'Letters', 'prospecting', 'birmingham_day1_leads_100.json')

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

if (!fs.existsSync(envPath)) {
  throw new Error('.env file not found in workspace root.')
}

if (!fs.existsSync(leadsPath)) {
  throw new Error('Leads JSON not found. Expected Letters/prospecting/birmingham_day1_leads_100.json')
}

const env = parseEnvFile(envPath)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const rawJson = fs.readFileSync(leadsPath, 'utf8').replace(/^\uFEFF/, '')
const rows = JSON.parse(rawJson)
if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error('No rows found in Birmingham leads JSON.')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const chunkSize = 50
let totalProcessed = 0

for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize)
  const { data, error } = await supabase
    .from('Leads')
    .upsert(chunk, { onConflict: 'lead_id' })
    .select('lead_id')

  if (error) {
    throw new Error(`Chunk ${i + 1}-${Math.min(i + chunkSize, rows.length)} failed: ${error.message}`)
  }

  totalProcessed += data?.length ?? chunk.length
  console.log(`Chunk ${i + 1}-${Math.min(i + chunkSize, rows.length)} upserted.`)
}

const { count, error: countError } = await supabase
  .from('Leads')
  .select('*', { count: 'exact', head: true })
  .like('lead_id', 'BRM-%')

if (countError) {
  throw new Error(`Upsert succeeded, but BRM count check failed: ${countError.message}`)
}

console.log(`Processed rows: ${totalProcessed}`)
console.log(`Current BRM lead count in Supabase: ${count}`)