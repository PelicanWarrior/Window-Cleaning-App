import { sendTwilioMessage } from './twilio'

export const CONTACT_METHODS = ['Text', 'E-Mail', 'Phone']

export const normalizePreferredContact = (value) => {
  const normalized = String(value || '').trim()
  return CONTACT_METHODS.includes(normalized) ? normalized : ''
}

export const getDefaultContactMethod = (customer) => {
  const preferred = normalizePreferredContact(customer?.PrefferedContact)
  if (preferred) return preferred
  return 'Text'
}

export const formatPhoneForWhatsApp = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('0')) return `44${digits.slice(1)}`
  return digits
}

export const formatPhoneForTel = (raw) => {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('+')) return value.replace(/\s+/g, '')
  const digits = value.replace(/\D/g, '')
  return digits || value
}

export const formatPhoneForTwilio = (raw) => {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('+')) return value.replace(/\s+/g, '')
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('0')) return `+44${digits.slice(1)}`
  if (digits.startsWith('44')) return `+${digits}`
  return `+${digits}`
}

const downloadAttachment = (attachment) => {
  if (!attachment?.blob || !attachment?.filename) return false
  const url = URL.createObjectURL(attachment.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = attachment.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return true
}

export const openMessageViaMethod = async ({ method, customer, subject, body, attachment, user }) => {
  if (method === 'E-Mail') {
    const email = String(customer?.EmailAddress || '').trim()
    if (!email) {
      return { ok: false, error: 'This customer does not have an email address.' }
    }

    const downloaded = downloadAttachment(attachment)
    const emailBody = downloaded
      ? `${body || ''}\n\nInvoice downloaded: please attach the PDF to this email before sending.`
      : (body || '')

    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject || 'Message')}&body=${encodeURIComponent(emailBody)}`
    window.open(mailto, '_self')
    return { ok: true }
  }

  if (method === 'Text') {
    const downloaded = downloadAttachment(attachment)
    const textBody = downloaded
      ? `${body || ''}\n\nInvoice downloaded: attach the PDF in WhatsApp before sending.`
      : (body || '')

    if (user?.TwilioConnected) {
      if (!user?.id || !customer?.id) {
        return { ok: false, error: 'Missing user or customer details for Twilio messaging.' }
      }

      const result = await sendTwilioMessage({
        userId: user.id,
        customerId: customer.id,
        subject,
        body: textBody,
      })

      return { ok: true, channel: result?.channel || 'Twilio', result }
    }

    const phone = formatPhoneForWhatsApp(customer?.PhoneNumber)
    if (!phone) {
      return { ok: false, error: 'This customer does not have a valid phone number.' }
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(textBody)}`
    window.open(url, '_blank')
    return { ok: true, channel: 'WhatsApp' }
  }

  if (method === 'Phone') {
    const phone = formatPhoneForTel(customer?.PhoneNumber)
    if (!phone) {
      return { ok: false, error: 'This customer does not have a phone number.' }
    }

    window.open(`tel:${phone}`, '_self')
    return { ok: true }
  }

  return { ok: false, error: 'Please choose how to send the message.' }
}