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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function bizKey(lead) {
  return `${normalizeText(lead.business_name)}|${normalizeText(lead.phone)}|${normalizeText(lead.area)}`
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
  .select('lead_id, source_url, business_name, phone, area')
  .like('lead_id', 'SWA-%')

if (error) {
  throw new Error(`Failed to fetch Swansea leads: ${error.message}`)
}

const leads = data || []
let sourceDupes = 0
let bizDupes = 0

const sourceSeen = new Set()
const bizSeen = new Set()

for (const lead of leads) {
  const source = normalizeText(lead.source_url)
  if (source) {
    if (sourceSeen.has(source)) sourceDupes += 1
    sourceSeen.add(source)
  }

  const key = bizKey(lead)
  if (key !== '||') {
    if (bizSeen.has(key)) bizDupes += 1
    bizSeen.add(key)
  }
}

console.log(`SWA lead count: ${leads.length}`)
console.log(`Duplicate source_url rows: ${sourceDupes}`)
console.log(`Duplicate business+phone+area rows: ${bizDupes}`)