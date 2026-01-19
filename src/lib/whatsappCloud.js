import { supabase } from './supabase'

export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result
      if (typeof dataUrl === 'string') {
        const base64 = dataUrl.split(',')[1] || ''
        resolve(base64)
      } else {
        reject(new Error('Failed to read blob'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function sendInvoiceWhatsApp({ phoneE164, filename, pdfBlob, messageText }) {
  const pdfBase64 = await blobToBase64(pdfBlob)
  const { data, error } = await supabase.functions.invoke('send_invoice_whatsapp', {
    body: { phoneE164, filename, pdfBase64, messageText },
  })
  if (error) throw error
  return data
}
