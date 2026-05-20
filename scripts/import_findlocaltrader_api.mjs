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

function normalizeEmail(value) {
  return normalizeText(value)
}

async function fetchProviderRows() {
  const headers = {
    apikey: PROVIDER_ANON_KEY,
    Authorization: `Bearer ${PROVIDER_ANON_KEY}`,
    Accept: 'application/json'
  }

  const firstUrl = `${PROVIDER_SUPABASE_URL}/rest/v1/providers?select=*&is_approved=eq.true&limit=1`
  const firstRes = await fetch(firstUrl, { headers })
  if (!firstRes.ok) {
    throw new Error(`Provider API discovery failed: ${firstRes.status} ${await firstRes.text()}`)
  }
  const firstRows = await firstRes.json()
  const sample = firstRows[0] || {}
  const keys = Object.keys(sample)

  const emailField = keys.find((k) => /email/i.test(k)) || 'email'
  const websiteField = keys.find((k) => /^website$/i.test(k)) || keys.find((k) => /website/i.test(k)) || 'website'
  const phoneField = keys.find((k) => /^phone$/i.test(k)) || keys.find((k) => /phone/i.test(k)) || 'phone'
  const locationField = keys.find((k) => /^location$/i.test(k)) || 'location'

  const columns = Array.from(new Set([
    'slug',
    'business_name',
    'contact_name',
    locationField,
    'postcode',
    emailField,
    phoneField,
    websiteField,
    'is_approved'
  ])).join(',')

  const pageSize = 1000
  const all = []
  for (let offset = 0; ; offset += pageSize) {
    const url = `${PROVIDER_SUPABASE_URL}/rest/v1/providers?select=${encodeURIComponent(columns)}&is_approved=eq.true&order=created_at.desc&limit=${pageSize}&offset=${offset}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      throw new Error(`Provider API fetch failed (offset ${offset}): ${res.status} ${await res.text()}`)
    }
    const rows = await res.json()
    all.push(...rows)
    if (!rows.length || rows.length < pageSize) break
  }

  return {
    rows: all,
    mapping: { emailField, websiteField, phoneField, locationField }
  }
}

async function fetchAllExistingLeadIdsAndEmails(supabase) {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('Leads')
      .select('lead_id, email')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed loading existing leads: ${error.message}`)
    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

function nextFltIdFactory(existingLeadIds) {
  const used = new Set(existingLeadIds.map((id) => String(id || '').trim()).filter(Boolean))
  let n = 1
  return function nextId() {
    while (n <= 99999) {
      const candidate = `FLT-${String(n).padStart(3, '0')}`
      n += 1
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
    }
    const fallback = `FLT-${Date.now()}`
    used.add(fallback)
    return fallback
  }
}

if (!fs.existsSync(ENV_PATH)) throw new Error('.env file not found in workspace root.')

const env = parseEnvFile(ENV_PATH)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const { rows: providerRows, mapping } = await fetchProviderRows()

const incoming = []
const incomingEmailSet = new Set()
for (const row of providerRows) {
  const email = normalizeEmail(row[mapping.emailField])
  if (!email) continue
  if (incomingEmailSet.has(email)) continue
  incomingEmailSet.add(email)

  const businessName = String(row.business_name || '').trim() || 'Unknown Trader'
  const areaParts = [row[mapping.locationField], row.postcode].filter(Boolean).map((v) => String(v).trim())
  const area = areaParts.length ? areaParts.join(', ') : null
  const slug = String(row.slug || '').trim()

  incoming.push({
    business_name: businessName,
    owner_name: String(row.contact_name || '').trim() || null,
    area,
    email,
    phone: String(row[mapping.phoneField] || '').trim() || null,
    website: String(row[mapping.websiteField] || '').trim() || null,
    source_url: slug ? `https://findalocaltrader.com/listing/${slug}` : 'https://findalocaltrader.com/providers'
  })
}

const existing = await fetchAllExistingLeadIdsAndEmails(supabase)
const existingEmailSet = new Set(existing.map((r) => normalizeEmail(r.email)).filter(Boolean))
const nextFltId = nextFltIdFactory(existing.map((r) => r.lead_id))

const rowsToInsert = []
let skippedExisting = 0
for (const lead of incoming) {
  if (existingEmailSet.has(lead.email)) {
    skippedExisting += 1
    continue
  }

  rowsToInsert.push({
    lead_id: nextFltId(),
    area: lead.area,
    business_name: lead.business_name,
    owner_name: lead.owner_name,
    email: lead.email,
    phone: lead.phone,
    website: lead.website,
    source_url: lead.source_url,
    status: 'new',
    last_contacted: null,
    sequence_step: null,
    next_follow_up: null,
    response_status: null,
    notes: 'Imported from findalocaltrader providers API (email dedupe)'
  })

  existingEmailSet.add(lead.email)
}

let inserted = 0
const chunkSize = 50
for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
  const chunk = rowsToInsert.slice(i, i + chunkSize)
  const { data, error } = await supabase
    .from('Leads')
    .upsert(chunk, { onConflict: 'lead_id' })
    .select('lead_id')

  if (error) throw new Error(`Insert chunk failed: ${error.message}`)
  inserted += data?.length ?? chunk.length
}

console.log('--- Import Summary ---')
console.log(`Provider rows fetched:           ${providerRows.length}`)
console.log(`Incoming rows with email:        ${incoming.length}`)
console.log(`Skipped existing email matches:  ${skippedExisting}`)
console.log(`New rows inserted:               ${inserted}`)
console.log(`Email field used:                ${mapping.emailField}`)
