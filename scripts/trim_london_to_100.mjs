import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const envPath = path.join(process.cwd(), '.env')
const raw = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const lineRaw of raw.split(/\r?\n/)) {
  const line = lineRaw.trim()
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i === -1) continue
  const key = line.slice(0, i).trim()
  let value = line.slice(i + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  env[key] = value
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { data, error } = await supabase
  .from('Leads')
  .select('id, lead_id')
  .like('lead_id', 'LDN-%')

if (error) throw new Error(`Failed to load LDN leads: ${error.message}`)

const over = (data || []).filter((row) => {
  const num = Number.parseInt(String(row.lead_id || '').split('-')[1], 10)
  return Number.isFinite(num) && num > 100
})

if (over.length > 0) {
  for (let i = 0; i < over.length; i += 50) {
    const chunk = over.slice(i, i + 50).map((r) => r.id)
    const { error: deleteError } = await supabase.from('Leads').delete().in('id', chunk)
    if (deleteError) throw new Error(`Failed deleting LDN overage: ${deleteError.message}`)
  }
}

const { count, error: countError } = await supabase
  .from('Leads')
  .select('*', { count: 'exact', head: true })
  .like('lead_id', 'LDN-%')

if (countError) throw new Error(`Failed count check: ${countError.message}`)

console.log(`Deleted over-100 LDN rows: ${over.length}`)
console.log(`Current LDN count: ${count}`)
