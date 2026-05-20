import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env')

const PROVIDER_SUPABASE_URL = 'https://sftaxpgjwtoaiqlnxqep.supabase.co'
const PROVIDER_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdGF4cGdqd3RvYWlxbG54cWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2Njk5NjQsImV4cCI6MjA4OTI0NTk2NH0.1IiVp92BttM_HuOiDpV2bJHkezwBWQY5s0BgvuIcBls'

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

function extractSlug(sourceUrl) {
  const url = String(sourceUrl || '')
  const m = url.match(/\/listing\/([a-z0-9\-_.]+)/i)
  return m ? m[1].toLowerCase() : null
}

function isWindowCleaningProvider(provider) {
  const bag = [
    ...(Array.isArray(provider.services) ? provider.services : []),
    ...(Array.isArray(provider.keywords) ? provider.keywords : []),
    provider.business_name,
    provider.description
  ]
    .map((v) => normalizeText(v))
    .join(' ')

  return bag.includes('window clean') || bag.includes('window cleaning')
}

async function fetchProvidersMap() {
  const headers = {
    apikey: PROVIDER_ANON_KEY,
    Authorization: `Bearer ${PROVIDER_ANON_KEY}`,
    Accept: 'application/json'
  }

  const pageSize = 1000
  const all = []
  for (let offset = 0; ; offset += pageSize) {
    const url = `${PROVIDER_SUPABASE_URL}/rest/v1/providers?select=slug,business_name,services,keywords,description,is_approved&is_approved=eq.true&order=created_at.desc&limit=${pageSize}&offset=${offset}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Provider fetch failed ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    all.push(...rows)
    if (!rows.length || rows.length < pageSize) break
  }

  const bySlug = new Map()
  for (const row of all) {
    const slug = normalizeText(row.slug)
    if (!slug) continue
    bySlug.set(slug, row)
  }

  return bySlug
}

async function fetchImportedFltLeads(supabase) {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('Leads')
      .select('id,lead_id,business_name,source_url,notes')
      .like('lead_id', 'FLT-%')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed loading FLT leads: ${error.message}`)
    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
  }

  return all.filter((lead) => normalizeText(lead.notes).includes('findalocaltrader providers api'))
}

if (!fs.existsSync(ENV_PATH)) throw new Error('.env file not found in workspace root.')

const env = parseEnvFile(ENV_PATH)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const [providersBySlug, importedLeads] = await Promise.all([
  fetchProvidersMap(),
  fetchImportedFltLeads(supabase)
])

const keep = []
const remove = []
const unknown = []

for (const lead of importedLeads) {
  const slug = extractSlug(lead.source_url)
  if (!slug) {
    unknown.push(lead)
    continue
  }

  const provider = providersBySlug.get(slug)
  if (!provider) {
    unknown.push(lead)
    continue
  }

  if (isWindowCleaningProvider(provider)) {
    keep.push(lead)
  } else {
    remove.push(lead)
  }
}

let deleted = 0
const chunkSize = 100
for (let i = 0; i < remove.length; i += chunkSize) {
  const ids = remove.slice(i, i + chunkSize).map((r) => r.id)
  const { error } = await supabase.from('Leads').delete().in('id', ids)
  if (error) throw new Error(`Delete failed: ${error.message}`)
  deleted += ids.length
}

console.log('--- Cleanup Summary ---')
console.log(`Imported FLT leads reviewed:     ${importedLeads.length}`)
console.log(`Kept (window cleaning):          ${keep.length}`)
console.log(`Deleted (not window cleaning):   ${deleted}`)
console.log(`Unknown mapping (left untouched): ${unknown.length}`)

if (remove.length > 0) {
  console.log('\nSample deleted leads:')
  for (const row of remove.slice(0, 20)) {
    console.log(`- ${row.lead_id} | ${row.business_name}`)
  }
}

if (unknown.length > 0) {
  console.log('\nSample unknown (not deleted):')
  for (const row of unknown.slice(0, 20)) {
    console.log(`- ${row.lead_id} | ${row.business_name}`)
  }
}
