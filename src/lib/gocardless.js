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

export async function createGoCardlessFlow({ userId, customerId, invoiceId = null, openBankingOnly = false, prefillBankDetails = null }) {
  const { data, error } = await supabase.functions.invoke('gocardless_create_flow', getInvokeOptions({
    userId,
    customerId,
    invoiceId,
    openBankingOnly,
    prefillBankDetails,
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
    successPlus: true,
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

export async function syncGoCardlessPayments({ userId, limit = 50 }) {
  const { data, error } = await supabase.functions.invoke('gocardless_sync_payments', getInvokeOptions({
    userId,
    limit,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to sync GoCardless payments'))
  }
  return data
}

export async function createGoCardlessSubscription({ userId, customerId, amount, startDate = null, interval = 1, intervalUnit = 'monthly' }) {
  const { data, error } = await supabase.functions.invoke('gocardless_create_subscription', getInvokeOptions({
    userId,
    customerId,
    amount,
    startDate,
    interval,
    intervalUnit,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to create subscription'))
  }
  return data
}

export async function cancelGoCardlessSubscription({ userId, customerId }) {
  const { data, error } = await supabase.functions.invoke('gocardless_cancel_subscription', getInvokeOptions({
    userId,
    customerId,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to cancel subscription'))
  }
  return data
}

export async function updateGoCardlessSubscription({ userId, customerId, amount, startDate = null, interval = 1, intervalUnit = 'monthly' }) {
  const { data, error } = await supabase.functions.invoke('gocardless_update_subscription', getInvokeOptions({
    userId,
    customerId,
    amount,
    startDate,
    interval,
    intervalUnit,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to update subscription'))
  }
  return data
}

export async function refundGoCardlessPayment({ userId, invoiceId, amount = null }) {
  const { data, error } = await supabase.functions.invoke('gocardless_refund_payment', getInvokeOptions({
    userId,
    invoiceId,
    amount,
  }))

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to refund payment'))
  }
  return data
}
