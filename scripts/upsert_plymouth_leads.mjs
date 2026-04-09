import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = path.join(root, '.env')
const leadsPath = path.join(root, 'Letters', 'prospecting', 'plymouth_day1_leads_100.json')

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

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '')
}

function normalizeEmail(value) {
  return normalizeText(value)
}

function buildBizKey(lead) {
  return `${normalizeText(lead.business_name)}|${normalizeText(lead.phone)}|${normalizeText(lead.area)}`
}

function normalizeLeadForInsert(lead, assignedLeadId) {
  const row = { ...lead, lead_id: assignedLeadId }
  if (normalizeText(row.last_contacted) === '') row.last_contacted = null
  if (normalizeText(row.next_follow_up) === '') row.next_follow_up = null
  if (normalizeText(row.email) === '') row.email = null
  return row
}

function nextPlyIdFactory(existingLeadIds) {
  const used = new Set(existingLeadIds.map((id) => String(id || '').trim()).filter(Boolean))
  let n = 1
  return function nextId() {
    while (n <= 99999) {
      const candidate = `PLY-${String(n).padStart(3, '0')}`
      n += 1
      if (!used.has(candidate)) { used.add(candidate); return candidate }
    }
    const fallback = `PLY-${Date.now()}`
    used.add(fallback)
    return fallback
  }
}

async function fetchAllLeads(supabase) {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('Leads')
      .select('id, lead_id, business_name, phone, email, area, source_url')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed loading existing leads: ${error.message}`)
    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

if (!fs.existsSync(envPath)) throw new Error('.env file not found in workspace root.')
if (!fs.existsSync(leadsPath)) throw new Error('Leads JSON not found. Expected Letters/prospecting/plymouth_day1_leads_100.json')

const env = parseEnvFile(envPath)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')

const rawJson = fs.readFileSync(leadsPath, 'utf8').replace(/^\uFEFF/, '')
const incomingRaw = JSON.parse(rawJson)
if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) throw new Error('No rows found in Plymouth leads JSON.')

const incomingUnique = []
const incomingSourceSet = new Set()
const incomingBizSet = new Set()
const incomingPhoneSet = new Set()
const incomingEmailSet = new Set()

for (const lead of incomingRaw) {
  const source = normalizeText(lead.source_url)
  const bizKey = buildBizKey(lead)
  const phone = normalizePhone(lead.phone)
  const email = normalizeEmail(lead.email)

  if (!source || incomingSourceSet.has(source) || incomingBizSet.has(bizKey)) continue
  if (phone && incomingPhoneSet.has(phone)) continue
  if (email && incomingEmailSet.has(email)) continue

  incomingSourceSet.add(source)
  incomingBizSet.add(bizKey)
  if (phone) incomingPhoneSet.add(phone)
  if (email) incomingEmailSet.add(email)
  incomingUnique.push(lead)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const existingLeads = await fetchAllLeads(supabase)

const existingSourceSet = new Set(existingLeads.map((l) => normalizeText(l.source_url)).filter(Boolean))
const existingBizSet = new Set(existingLeads.map((l) => buildBizKey(l)))
const existingPhoneSet = new Set(existingLeads.map((l) => normalizePhone(l.phone)).filter(Boolean))
const existingEmailSet = new Set(existingLeads.map((l) => normalizeEmail(l.email)).filter(Boolean))
const nextPlyId = nextPlyIdFactory(existingLeads.map((l) => l.lead_id))

const rowsToInsert = []
for (const lead of incomingUnique) {
  const source = normalizeText(lead.source_url)
  const bizKey = buildBizKey(lead)
  const phone = normalizePhone(lead.phone)
  const email = normalizeEmail(lead.email)

  if (existingSourceSet.has(source) || existingBizSet.has(bizKey)) continue
  if (phone && existingPhoneSet.has(phone)) continue
  if (email && existingEmailSet.has(email)) continue

  rowsToInsert.push(normalizeLeadForInsert(lead, nextPlyId()))
  existingSourceSet.add(source)
  existingBizSet.add(bizKey)
  if (phone) existingPhoneSet.add(phone)
  if (email) existingEmailSet.add(email)
}

const chunkSize = 50
let inserted = 0
for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
  const chunk = rowsToInsert.slice(i, i + chunkSize)
  const { data, error } = await supabase.from('Leads').upsert(chunk, { onConflict: 'lead_id' }).select('lead_id')
  if (error) throw new Error(`Insert chunk failed: ${error.message}`)
  inserted += data?.length ?? chunk.length
}

const { count, error: countError } = await supabase
  .from('Leads').select('*', { count: 'exact', head: true }).like('lead_id', 'PLY-%')
if (countError) throw new Error(`PLY count check failed: ${countError.message}`)

console.log(`Incoming rows:            ${incomingRaw.length}`)
console.log(`Incoming unique rows:     ${incomingUnique.length}`)
console.log(`New rows inserted:        ${inserted}`)
console.log(`Current PLY count in Supabase: ${count}`)
