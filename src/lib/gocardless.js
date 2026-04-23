import { supabase } from './supabase'

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function getInvokeOptions(body) {
  return {
    body,
    headers: SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : undefined,
  }
}

export async function getFunctionErrorMessage(error, fallback) {
  if (error?.context) {
    try {
      const json = await error.context.json()
      if (json?.error) return json.error
      if (json?.message) return json.message
      return JSON.stringify(json)
    } catch {
      try {
        const text = await error.context.text()
        if (text) return text
      } catch {
        // ignore
      }
    }
  }

  return error?.message || fallback
}

export async function startGoCardlessConnect(userId) {
  const { data, error } = await supabase.functions.invoke('gocardless_connect_start', getInvokeOptions({ userId }))
  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to connect GoCardless'))
  }
  if (!data?.url) {
    throw new Error('GoCardless connect URL was not returned')
  }
  return data
}

export async function createGoCardlessFlow({ userId, customerId, invoiceId = null }) {
  const { data, error } = await supabase.functions.invoke('gocardless_create_flow', getInvokeOptions({
    userId,
    customerId,
    invoiceId,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to create GoCardless flow'))
  }
  if (!data?.url) {
    throw new Error('GoCardless flow URL was not returned')
  }
  return data
}

export async function collectGoCardlessPayment({ userId, customerId, invoiceId }) {
  const { data, error } = await supabase.functions.invoke('gocardless_collect_payment', getInvokeOptions({
    userId,
    customerId,
    invoiceId,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to collect GoCardless payment'))
  }
  return data
}

export async function syncGoCardlessBillingRequest({ userId, billingRequestId }) {
  const { data, error } = await supabase.functions.invoke('gocardless_sync_billing_request', getInvokeOptions({
    userId,
    billingRequestId,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to sync GoCardless billing request'))
  }
  return data
}

export async function syncGoCardlessMandateStatus({ userId, customerId }) {
  const { data, error } = await supabase.functions.invoke('gocardless_sync_mandate_status', getInvokeOptions({
    userId,
    customerId,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to sync mandate status'))
  }
  return data
}
