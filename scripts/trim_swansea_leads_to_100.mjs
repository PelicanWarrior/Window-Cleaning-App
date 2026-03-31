import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = path.join(root, '.env')

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

const env = parseEnvFile(envPath)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const { data, error } = await supabase
  .from('Leads')
  .select('id, lead_id')
  .like('lead_id', 'SWA-%')

if (error) {
  throw new Error(`Failed to load Swansea leads: ${error.message}`)
}

const leads = (data || []).sort((a, b) => String(a.lead_id).localeCompare(String(b.lead_id), undefined, { numeric: true }))
const target = 100

if (leads.length <= target) {
  console.log(`No trim needed. Swansea leads: ${leads.length}`)
  process.exit(0)
}

const toDelete = leads.slice(target).map((lead) => lead.id)

const chunkSize = 50
let deleted = 0
for (let i = 0; i < toDelete.length; i += chunkSize) {
  const chunk = toDelete.slice(i, i + chunkSize)
  const { error: deleteError } = await supabase
    .from('Leads')
    .delete()
    .in('id', chunk)

  if (deleteError) {
    throw new Error(`Failed deleting trim chunk ${i + 1}-${Math.min(i + chunkSize, toDelete.length)}: ${deleteError.message}`)
  }

  deleted += chunk.length
}

const { count, error: countError } = await supabase
  .from('Leads')
  .select('*', { count: 'exact', head: true })
  .like('lead_id', 'SWA-%')

if (countError) {
  throw new Error(`Count check failed after trim: ${countError.message}`)
}

console.log(`Deleted Swansea leads: ${deleted}`)
console.log(`Current SWA lead count: ${count}`)