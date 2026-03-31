import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const envPath = path.join(root, '.env')
const leadsPath = path.join(root, 'Letters', 'prospecting', 'swansea_day1_leads_100.json')

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
  const business = normalizeText(lead.business_name)
  const phone = normalizeText(lead.phone)
  const area = normalizeText(lead.area)
  return `${business}|${phone}|${area}`
}

function nextSwaIdFactory(existingLeadIds) {
  const used = new Set(existingLeadIds.map((id) => String(id || '').trim()).filter(Boolean))
  let n = 1

  return function nextId() {
    while (n <= 99999) {
      const candidate = `SWA-${String(n).padStart(3, '0')}`
      n += 1
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
    }

    const fallback = `SWA-${Date.now()}`
    used.add(fallback)
    return fallback
  }
}

async function fetchAllLeads(supabase) {
  const all = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('Leads')
      .select('id, lead_id, business_name, phone, area, source_url')
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Failed loading existing leads: ${error.message}`)
    }

    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
  }

  return all
}

if (!fs.existsSync(envPath)) {
  throw new Error('.env file not found in workspace root.')
}

if (!fs.existsSync(leadsPath)) {
  throw new Error('Leads JSON not found. Expected Letters/prospecting/swansea_day1_leads_100.json')
}

const env = parseEnvFile(envPath)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const rawJson = fs.readFileSync(leadsPath, 'utf8').replace(/^\uFEFF/, '')
const incomingRaw = JSON.parse(rawJson)
if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) {
  throw new Error('No rows found in Swansea leads JSON.')
}

const incomingUnique = []
const incomingSourceSet = new Set()
const incomingBizSet = new Set()
for (const lead of incomingRaw) {
  const source = normalizeText(lead.source_url)
  const bizKey = buildBizKey(lead)
  if (!source || incomingSourceSet.has(source) || incomingBizSet.has(bizKey)) {
    continue
  }

  incomingSourceSet.add(source)
  incomingBizSet.add(bizKey)
  incomingUnique.push(lead)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const existingLeads = await fetchAllLeads(supabase)

const existingSourceSet = new Set(
  existingLeads
    .map((lead) => normalizeText(lead.source_url))
    .filter(Boolean)
)

const existingBizSet = new Set(existingLeads.map((lead) => buildBizKey(lead)))
const nextSwaId = nextSwaIdFactory(existingLeads.map((lead) => lead.lead_id))

const rowsToInsert = []
for (const lead of incomingUnique) {
  const source = normalizeText(lead.source_url)
  const bizKey = buildBizKey(lead)

  if (existingSourceSet.has(source) || existingBizSet.has(bizKey)) {
    continue
  }

  rowsToInsert.push({
    ...lead,
    lead_id: nextSwaId()
  })

  existingSourceSet.add(source)
  existingBizSet.add(bizKey)
}

const chunkSize = 50
let inserted = 0
for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
  const chunk = rowsToInsert.slice(i, i + chunkSize)
  const { data, error } = await supabase
    .from('Leads')
    .upsert(chunk, { onConflict: 'lead_id' })
    .select('lead_id')

  if (error) {
    throw new Error(`Insert chunk ${i + 1}-${Math.min(i + chunkSize, rowsToInsert.length)} failed: ${error.message}`)
  }

  inserted += data?.length ?? chunk.length
}

const allAfterInsert = await fetchAllLeads(supabase)
const duplicateIds = new Set()

const firstBySource = new Map()
for (const lead of allAfterInsert) {
  const source = normalizeText(lead.source_url)
  if (!source) continue

  if (!firstBySource.has(source)) {
    firstBySource.set(source, lead.id)
    continue
  }

  duplicateIds.add(lead.id)
}

const firstByBizKey = new Map()
for (const lead of allAfterInsert) {
  const bizKey = buildBizKey(lead)
  if (bizKey === '||') continue

  if (!firstByBizKey.has(bizKey)) {
    firstByBizKey.set(bizKey, lead.id)
    continue
  }

  duplicateIds.add(lead.id)
}

const idsToDelete = [...duplicateIds]
let deleted = 0
for (let i = 0; i < idsToDelete.length; i += chunkSize) {
  const chunk = idsToDelete.slice(i, i + chunkSize)
  const { error } = await supabase
    .from('Leads')
    .delete()
    .in('id', chunk)

  if (error) {
    throw new Error(`Duplicate cleanup chunk ${i + 1}-${Math.min(i + chunkSize, idsToDelete.length)} failed: ${error.message}`)
  }

  deleted += chunk.length
}

const allAfterCleanup = await fetchAllLeads(supabase)
const remainingSource = new Set()
const remainingBiz = new Set()
let sourceDupesRemaining = 0
let bizDupesRemaining = 0

for (const lead of allAfterCleanup) {
  const source = normalizeText(lead.source_url)
  if (source) {
    if (remainingSource.has(source)) sourceDupesRemaining += 1
    remainingSource.add(source)
  }

  const bizKey = buildBizKey(lead)
  if (bizKey !== '||') {
    if (remainingBiz.has(bizKey)) bizDupesRemaining += 1
    remainingBiz.add(bizKey)
  }
}

const { count: swaCount, error: swaCountError } = await supabase
  .from('Leads')
  .select('*', { count: 'exact', head: true })
  .like('lead_id', 'SWA-%')

if (swaCountError) {
  throw new Error(`SWA count check failed: ${swaCountError.message}`)
}

console.log(`Incoming rows: ${incomingRaw.length}`)
console.log(`Incoming unique rows: ${incomingUnique.length}`)
console.log(`Inserted new Swansea rows: ${inserted}`)
console.log(`Deleted duplicate rows: ${deleted}`)
console.log(`Current SWA lead count in Supabase: ${swaCount}`)
console.log(`Remaining duplicate source_url rows: ${sourceDupesRemaining}`)
console.log(`Remaining duplicate biz+phone+area rows: ${bizDupesRemaining}`)