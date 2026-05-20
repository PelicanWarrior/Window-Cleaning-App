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

function normalizeEmail(value) {
  return normalizeText(value)
}

function nextAttIdFactory(existingLeadIds) {
  const used = new Set(existingLeadIds.map((id) => String(id || '').trim()).filter(Boolean))
  let n = 1
  return function nextId() {
    while (n <= 99999) {
      const candidate = `ATT-${String(n).padStart(3, '0')}`
      n += 1
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
    }
    const fallback = `ATT-${Date.now()}`
    used.add(fallback)
    return fallback
  }
}

async function fetchAllLeadEmails(supabase) {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('Leads')
      .select('lead_id, email')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed to load existing leads: ${error.message}`)
    const batch = data || []
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

const manualLeads = [
  {
    business_name: 'Clear Co Cleaning',
    area: 'Bangor, BT19 6ZP',
    email: 'info@clearcocleaningni.co.uk',
    phone: null,
    website: null,
    source_url: 'manual_attachment'
  },
  {
    business_name: 'Professional Window And Gutter Cleaning',
    area: null,
    email: 'pmub8@icloud.com',
    phone: '07519082707',
    website: null,
    source_url: 'manual_attachment_image'
  },
  {
    business_name: 'M&A Exterior Cleaning',
    area: null,
    email: 'info@madorset.co.uk',
    phone: '07470103103',
    website: 'https://madorset.co.uk',
    source_url: 'manual_attachment_image'
  },
  {
    business_name: "Defoe's Exterior Cleaning",
    area: 'Bedfordshire, Buckinghamshire and Hertfordshire',
    email: 'aaronadefoe@gmail.com',
    phone: null,
    website: null,
    source_url: 'https://findalocaltrader.com/listing/defoes-exterior-cleaning'
  },
  {
    business_name: 'ClearSky Cleaning Services',
    area: 'Ampthill, Flitton, Dunstable, Harlington, Westoning, Flitwick, Silsoe',
    email: 'info.clearskycleaning@gmail.com',
    phone: null,
    website: 'https://clear-sky.base44.app',
    source_url: 'https://findalocaltrader.com/listing/clearsky-cleaning-services'
  },
  {
    business_name: 'Thames Cleaning',
    area: 'London',
    email: 'thamescleaningltd@gmail.com',
    phone: null,
    website: null,
    source_url: 'https://findalocaltrader.com/listing/thames-cleaning'
  },
  {
    business_name: 'J&J Window Cleaning',
    area: 'Hertford',
    email: 'jensonbailey20@gmail.com',
    phone: '07534257047',
    website: 'https://www.facebook.com/profile.php?id=61559974620096',
    source_url: 'https://findalocaltrader.com/listing/j-j-window-cleaning'
  },
  {
    business_name: 'MT Exteriors',
    area: 'Luton',
    email: 'mt_exteriors@hotmail.com',
    phone: null,
    website: 'https://www.facebook.com/profile.php?id=100095528582887',
    source_url: 'https://findalocaltrader.com/listing/mt-exteriors'
  },
  {
    business_name: 'Blinging Exterior Cleaning',
    area: 'Luton, Dunstable, Harpenden, St Albans, Hemel Hempstead, Watford, Bushey, Hitchin, Stevenage, Milton Keynes, Bedford',
    email: 'info@blingingexteriorcleaning.co.uk',
    phone: null,
    website: 'https://blingingexteriorcleaning.co.uk',
    source_url: 'https://findalocaltrader.com/listing/blinging-exterior-cleaning'
  }
]

if (!fs.existsSync(envPath)) throw new Error('.env file not found in workspace root.')

const env = parseEnvFile(envPath)
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const existingLeads = await fetchAllLeadEmails(supabase)

const existingEmailSet = new Set(existingLeads.map((lead) => normalizeEmail(lead.email)).filter(Boolean))
const nextAttId = nextAttIdFactory(existingLeads.map((lead) => lead.lead_id))

const incomingUnique = []
const incomingEmailSet = new Set()
for (const lead of manualLeads) {
  const email = normalizeEmail(lead.email)
  if (!email) continue
  if (incomingEmailSet.has(email)) continue
  incomingEmailSet.add(email)
  incomingUnique.push(lead)
}

const rowsToInsert = []
const skippedExisting = []
for (const lead of incomingUnique) {
  const email = normalizeEmail(lead.email)
  if (existingEmailSet.has(email)) {
    skippedExisting.push(email)
    continue
  }

  rowsToInsert.push({
    lead_id: nextAttId(),
    area: lead.area || null,
    business_name: lead.business_name,
    owner_name: null,
    email,
    phone: lead.phone || null,
    website: lead.website || null,
    source_url: lead.source_url || 'manual_attachment',
    status: 'new',
    last_contacted: null,
    sequence_step: null,
    next_follow_up: null,
    response_status: null,
    notes: 'Added from user-provided attachments (dedupe by email)'
  })

  existingEmailSet.add(email)
}

let inserted = 0
if (rowsToInsert.length > 0) {
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
}

console.log(`Incoming leads provided:         ${manualLeads.length}`)
console.log(`Incoming unique emails:          ${incomingUnique.length}`)
console.log(`Skipped existing email matches:  ${skippedExisting.length}`)
console.log(`New rows inserted:               ${inserted}`)
if (skippedExisting.length > 0) {
  console.log('Skipped emails already in DB:')
  for (const email of skippedExisting) {
    console.log(`- ${email}`)
  }
}
