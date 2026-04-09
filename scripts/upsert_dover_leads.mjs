import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = path.join(root, '.env')
const leadsPath = path.join(root, 'Letters', 'prospecting', 'dover_day1_leads_100.json')

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

function buildBizKey(lead) {
  return `${normalizeText(lead.business_name)}|${normalizeText(lead.phone)}|${normalizeText(lead.area)}`
}

function normalizeLeadForInsert(lead, assignedLeadId) {
  const row = { ...lead, lead_id: assignedLeadId }
  if (normalizeText(row.last_contacted) === '') row.last_contacted = null
  if (normalizeText(row.next_follow_up) === '') row.next_follow_up = null
  return row
}

function nextDvrIdFactory(existingLeadIds) {
  const used = new Set(existingLeadIds.map((id) => String(id || '').trim()).filter(Boolean))
  let n = 1
  return function nextId() {
    while (n <= 99999) {
      const candidate = `DVR-${String(n).padStart(3, '0')}`
      n += 1
      if (!used.has(candidate)) { used.add(candidate); return candidate }
    }
    const fallback = `DVR-${Date.now()}`
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
      .select('id, lead_id, business_name, phone, area, source_url')
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
if (!fs.existsSync(leadsPath)) throw new Error('Leads JSON not found. Expected Letters/prospecting/dover_day1_leads_100.json')

const env = parseEnvFile(envPath)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')

const rawJson = fs.readFileSync(leadsPath, 'utf8').replace(/^\uFEFF/, '')
const incomingRaw = JSON.parse(rawJson)
if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) throw new Error('No rows found in Dover leads JSON.')

const incomingUnique = []
const incomingSourceSet = new Set()
const incomingBizSet = new Set()
for (const lead of incomingRaw) {
  const source = normalizeText(lead.source_url)
  const bizKey = buildBizKey(lead)
  if (!source || incomingSourceSet.has(source) || incomingBizSet.has(bizKey)) continue
  incomingSourceSet.add(source)
  incomingBizSet.add(bizKey)
  incomingUnique.push(lead)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const existingLeads = await fetchAllLeads(supabase)

const existingSourceSet = new Set(existingLeads.map((l) => normalizeText(l.source_url)).filter(Boolean))
const existingBizSet = new Set(existingLeads.map((l) => buildBizKey(l)))
const nextDvrId = nextDvrIdFactory(existingLeads.map((l) => l.lead_id))

const rowsToInsert = []
for (const lead of incomingUnique) {
  const source = normalizeText(lead.source_url)
  const bizKey = buildBizKey(lead)
  if (existingSourceSet.has(source) || existingBizSet.has(bizKey)) continue
  rowsToInsert.push(normalizeLeadForInsert(lead, nextDvrId()))
  existingSourceSet.add(source)
  existingBizSet.add(bizKey)
}

const chunkSize = 50
let inserted = 0
for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
  const chunk = rowsToInsert.slice(i, i + chunkSize)
  const { data, error } = await supabase.from('Leads').upsert(chunk, { onConflict: 'lead_id' }).select('lead_id')
  if (error) throw new Error(`Insert chunk failed: ${error.message}`)
  inserted += data?.length ?? chunk.length
}

const allAfter = await fetchAllLeads(supabase)
const dupIds = new Set()
const seenSource = new Map()
const seenBiz = new Map()
for (const lead of allAfter) {
  const src = normalizeText(lead.source_url)
  if (src) { if (seenSource.has(src)) dupIds.add(lead.id); else seenSource.set(src, lead.id) }
  const bk = buildBizKey(lead)
  if (bk !== '||') { if (seenBiz.has(bk)) dupIds.add(lead.id); else seenBiz.set(bk, lead.id) }
}
const idsToDelete = [...dupIds]
let deleted = 0
for (let i = 0; i < idsToDelete.length; i += chunkSize) {
  const chunk = idsToDelete.slice(i, i + chunkSize)
  const { error } = await supabase.from('Leads').delete().in('id', chunk)
  if (error) throw new Error(`Duplicate cleanup failed: ${error.message}`)
  deleted += chunk.length
}

const { count, error: countError } = await supabase
  .from('Leads').select('*', { count: 'exact', head: true }).like('lead_id', 'DVR-%')
if (countError) throw new Error(`DVR count check failed: ${countError.message}`)

console.log(`Incoming rows:          ${incomingRaw.length}`)
console.log(`Incoming unique rows:   ${incomingUnique.length}`)
console.log(`New rows inserted:      ${inserted}`)
console.log(`Duplicate rows deleted: ${deleted}`)
console.log(`Current DVR count in Supabase: ${count}`)
