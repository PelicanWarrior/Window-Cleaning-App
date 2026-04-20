import { supabase } from './supabase'
import { formatDateByCountry, getCurrencyConfig } from './format'

const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null

export const downloadBlobToDevice = (blob, filename) => {
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const createInvoiceAttachment = async ({ invoice, customer, user }) => {
  if (!invoice?.id) return { ok: false, error: 'Invalid invoice selected.' }
  if (!jsPDFRef) return { ok: false, error: 'PDF generator is not loaded.' }

  const { data: jobs, error: jobsError } = await supabase
    .from('CustomerInvoiceJobs')
    .select('Service, Price')
    .eq('InvoiceID', invoice.id)
    .order('id', { ascending: true })

  if (jobsError) return { ok: false, error: jobsError.message }

  const rows = (jobs || []).filter((row) => row?.Service)
  if (!rows.length) return { ok: false, error: 'This invoice has no line items.' }

  const doc = new jsPDFRef()
  const lineHeight = 8
  let y = 15

  const companyName = String(user?.CompanyName || '').trim()
  if (companyName) {
    doc.setFontSize(18)
    const pageWidth = doc.internal.pageSize.getWidth()
    const titleWidth = doc.getTextWidth(companyName)
    doc.text(companyName, (pageWidth - titleWidth) / 2, y)
    y += lineHeight + 4
  }

  doc.setFontSize(14)
  doc.text(customer?.CustomerName || 'Customer', 15, y)
  y += lineHeight

  doc.setFontSize(12)
  const addressLines = [customer?.Address, customer?.Address2, customer?.Address3, customer?.Postcode].filter(Boolean)
  addressLines.forEach((line) => {
    doc.text(String(line), 15, y)
    y += lineHeight
  })

  y += 2
  doc.text(`Invoice Number: ${invoice.InvoiceID || invoice.id}`, 15, y)
  y += lineHeight
  doc.text(`Invoice Date: ${formatDateByCountry(invoice.InvoiceDate, user?.SettingsCountry || 'United Kingdom')}`, 15, y)
  y += lineHeight + 2

  doc.setFontSize(14)
  doc.text('Items', 15, y)
  y += lineHeight

  doc.setFontSize(12)
  const { symbol } = getCurrencyConfig(user?.SettingsCountry || 'United Kingdom')
  let total = 0
  rows.forEach((row) => {
    const value = parseFloat(row.Price) || 0
    total += value
    doc.text(String(row.Service), 15, y)
    doc.text(`${symbol}${value.toFixed(2)}`, 160, y, { align: 'right' })
    y += lineHeight
  })

  y += 3
  doc.setFontSize(14)
  doc.text('TOTAL', 15, y)
  doc.text(`${symbol}${total.toFixed(2)}`, 160, y, { align: 'right' })

  if (user?.InvoiceFooter) {
    y += lineHeight + 4
    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    const footerLines = doc.splitTextToSize(String(user.InvoiceFooter), 170)
    doc.text(footerLines, 15, y)
    doc.setTextColor(0, 0, 0)
  }

  const filename = `Invoice-${invoice.InvoiceID || invoice.id}.pdf`
  return { ok: true, blob: doc.output('blob'), filename }
}
