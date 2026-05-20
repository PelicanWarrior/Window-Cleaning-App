import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env')

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

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function extractListingLinks(html) {
  const links = new Set()
  const re = /href=["'](\/listing\/[a-z0-9\-_/]+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    links.add(`https://findalocaltrader.com${m[1]}`)
  }
  return Array.from(links)
}

function extractEmail(html) {
  const text = stripTags(html)
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  const filtered = emails
    .map((e) => normalizeEmail(e))
    .filter((e) => e && !e.includes('example.com') && e !== 'info@findalocaltrader.com')
  return filtered[0] || null
}

function extractBusinessName(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) return stripTags(h1[1])

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (title) {
    const raw = stripTags(title[1])
    return raw.split('|')[0].trim()
  }

  return 'Unknown Trader'
}

function extractArea(html) {
  const text = stripTags(html)
  const m = text.match(/Operates in\s+([^|]{1,220}?)(?:\s+(?:Overview|Services|Photos|Company info|About)|$)/i)
  if (m) return m[1].trim()
  return null
}

function extractWebsite(html) {
  const m = html.match(/href=["'](https?:\/\/[^"']+)["'][^>]*>\s*[^<]*\s*<\/a>/gi) || []
  const candidates = m
    .map((chunk) => {
      const href = chunk.match(/href=["'](https?:\/\/[^"']+)["']/i)
      return href ? href[1] : null
    })
    .filter(Boolean)
    .filter((u) => !u.includes('findalocaltrader.com'))

  return candidates[0] || null
}

function extractPhone(html) {
  const text = stripTags(html)
  const phones = text.match(/(?:\+44\s?7\d{3}|07\d{3})[\s\d]{6,}/g) || []
  if (!phones.length) return null
  return phones[0].replace(/\s+/g, ' ').trim()
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; lead-importer/1.0)' }
  })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return await res.text()
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

if (!fs.existsSync(ENV_PATH)) {
  throw new Error('.env file not found in workspace root.')
}

const env = parseEnvFile(ENV_PATH)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const providerPages = 12
const listingLinks = new Set()
for (let page = 1; page <= providerPages; page += 1) {
  const url = `https://findalocaltrader.com/providers?page=${page}`
  try {
    const html = await fetchText(url)
    for (const link of extractListingLinks(html)) listingLinks.add(link)
    console.log(`Scanned providers page ${page}/${providerPages}: +${extractListingLinks(html).length} links`)
  } catch (error) {
    console.log(`WARN providers page ${page} failed: ${error.message}`)
  }
}

const listingUrls = Array.from(listingLinks)
console.log(`Discovered listing URLs: ${listingUrls.length}`)

const scrapedLeads = []
for (let i = 0; i < listingUrls.length; i += 1) {
  const url = listingUrls[i]
  try {
    const html = await fetchText(url)
    const email = extractEmail(html)
    if (!email) continue

    scrapedLeads.push({
      business_name: extractBusinessName(html),
      area: extractArea(html),
      email,
      phone: extractPhone(html),
      website: extractWebsite(html),
      source_url: url
    })
  } catch (error) {
    console.log(`WARN listing fetch failed (${i + 1}/${listingUrls.length}): ${url} :: ${error.message}`)
  }

  if ((i + 1) % 50 === 0) {
    console.log(`Fetched ${i + 1}/${listingUrls.length} listing pages...`)
  }
}

console.log(`Scraped leads with email: ${scrapedLeads.length}`)

const incomingEmailSet = new Set()
const incomingUnique = []
for (const lead of scrapedLeads) {
  const email = normalizeEmail(lead.email)
  if (!email || incomingEmailSet.has(email)) continue
  incomingEmailSet.add(email)
  incomingUnique.push({ ...lead, email })
}

console.log(`Incoming unique by email: ${incomingUnique.length}`)

const existing = await fetchAllExistingLeadIdsAndEmails(supabase)
const existingEmailSet = new Set(existing.map((row) => normalizeEmail(row.email)).filter(Boolean))
const nextFltId = nextFltIdFactory(existing.map((row) => row.lead_id))

const rowsToInsert = []
let skippedExisting = 0
for (const lead of incomingUnique) {
  if (existingEmailSet.has(lead.email)) {
    skippedExisting += 1
    continue
  }

  rowsToInsert.push({
    lead_id: nextFltId(),
    area: lead.area || null,
    business_name: lead.business_name || 'Unknown Trader',
    owner_name: null,
    email: lead.email,
    phone: lead.phone || null,
    website: lead.website || null,
    source_url: lead.source_url,
    status: 'new',
    last_contacted: null,
    sequence_step: null,
    next_follow_up: null,
    response_status: null,
    notes: 'Imported from findalocaltrader providers directory (email dedupe)'
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
console.log(`Listing URLs discovered:         ${listingUrls.length}`)
console.log(`Scraped rows with email:         ${scrapedLeads.length}`)
console.log(`Incoming unique emails:          ${incomingUnique.length}`)
console.log(`Skipped existing email matches:  ${skippedExisting}`)
console.log(`New rows inserted:               ${inserted}`)
