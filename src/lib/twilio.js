import { supabase } from './supabase'

async function getFunctionErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage
  if (typeof error === 'string') return error
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  if (typeof error?.context?.data?.error === 'string' && error.context.data.error.trim()) return error.context.data.error
  if (typeof error?.context?.data?.message === 'string' && error.context.data.message.trim()) return error.context.data.message

  const details = error?.details || error?.hint || error?.code
  if (typeof details === 'string' && details.trim()) return details

  return fallbackMessage
}

export async function connectTwilioAccount({ userId, country, billingRatePencePerSegment = 5 }) {
  const { data, error } = await supabase.functions.invoke('twilio_connect', {
    body: {
      userId,
      country,
      billingRatePencePerSegment,
    },
  })

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to connect Twilio'))
  }

  return data
}

export async function sendTwilioMessage({ userId, customerId, subject, body }) {
  const { data, error } = await supabase.functions.invoke('send_sms_twilio', {
    body: {
      userId,
      customerId,
      subject,
      body,
    },
  })

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Unable to send Twilio message'))
  }

  return data
}
