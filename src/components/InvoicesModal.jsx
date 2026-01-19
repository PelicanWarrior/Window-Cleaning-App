import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getCurrencyConfig, formatDateByCountry } from '../lib/format'
import './Invoice.css'
import InvoiceItemsModal from './InvoiceItemsModal'
// jsPDF loaded via CDN script; fallback avoids bundler import issues
const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null
import { sendInvoiceWhatsApp } from '../lib/whatsappCloud'

function InvoicesModal({ user, customer, onClose }) {
  const [invoices, setInvoices] = useState([])
  const [messageFooter, setMessageFooter] = useState('')
  const [itemsModal, setItemsModal] = useState({ show: false, invoice: null })
  const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol

  useEffect(() => {
    async function init() {
      const { data, error } = await supabase
        .from('CustomerInvoices')
        .select('*')
        .eq('CustomerID', customer.id)
        .order('id', { ascending: false })
      if (!error) setInvoices(data || [])

      const { data: udata, error: uerr } = await supabase
        .from('Users')
        .select('MessageFooter')
        .eq('id', user.id)
        .single()
      if (!uerr) setMessageFooter(udata?.MessageFooter || '')
    }
    init()
  }, [customer.id, user.id])

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 11 && digits.startsWith('0')) return `44${digits.slice(1)}`
    return digits
  }

  const buildBody = async (inv) => {
    const { data: items, error: itemsErr } = await supabase
      .from('CustomerInvoiceJobs')
      .select('*')
      .eq('InvoiceID', inv.id)
    if (itemsErr) return `Invoice ${inv.InvoiceID}`

    const lines = (items || []).map((it) => `${it.Service} - ${currencySymbol}${parseFloat(it.Price || 0).toFixed(2)}`)
    const total = (items || []).reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)
    lines.push(`Total: ${currencySymbol}${parseFloat(total).toFixed(2)}`)
    if (messageFooter) lines.push(messageFooter)
    return `Invoice ${inv.InvoiceID} for ${customer.CustomerName}\n${lines.join('\n')}`
  }

  const sendText = async (inv) => {
    // Generate PDF
    const pdfBlob = await generatePdfBlob(inv)
    if (!pdfBlob) {
      alert('Failed to generate PDF')
      return
    }
    const bodyText = await buildBody(inv)

    // Prefer sharing only on mobile devices that support file sharing
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
    let shared = false
    let apiSent = false

    // Try WhatsApp Cloud API first if configured
    try {
      const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
      if (phone && import.meta.env.VITE_WHATSAPP_ENABLED === 'true') {
        await sendInvoiceWhatsApp({ phoneE164: phone, filename: `Invoice-${inv.InvoiceID}.pdf`, pdfBlob, messageText: bodyText })
        apiSent = true
      }
    } catch (e) {
      console.log('WhatsApp API send failed, falling back:', e)
    }

    if (!apiSent && isMobile) {
      shared = await attemptShareWithPdf(pdfBlob, `Invoice-${inv.InvoiceID}.pdf`, bodyText)
    }

    if (!shared && !apiSent) {
      // Desktop or unsupported mobile: download PDF and open WhatsApp directly
      downloadBlobToDevice(pdfBlob, `Invoice-${inv.InvoiceID}.pdf`)
      const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
      if (!phone) {
        alert('This customer does not have a valid phone number.')
        return
      }
      const appUrl = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(bodyText)}`
      const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(bodyText)}`
      const opened = window.open(appUrl, '_blank')
      if (!opened) window.open(webUrl, '_blank')
    }
  }

  const sendEmail = async (inv) => {
    // Generate PDF
    const pdfBlob = await generatePdfBlob(inv)
    if (!pdfBlob) {
      alert('Failed to generate PDF')
      return
    }
    
    const bodyText = await buildBody(inv)
    
    // Try Web Share API
    const shared = await attemptShareWithPdf(pdfBlob, `Invoice-${inv.InvoiceID}.pdf`, bodyText)
    
    if (!shared) {
      // Fallback: download PDF and open email
      alert('PDF will be downloaded. Please attach it manually to your email.')
      downloadBlobToDevice(pdfBlob, `Invoice-${inv.InvoiceID}.pdf`)
      
      const email = customer.EmailAddress
      if (!email) {
        alert('This customer does not have an email address.')
        return
      }
      const subject = `Invoice ${inv.InvoiceID}`
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
      window.location.href = mailto
    }
  }

  const generatePdfBlob = async (inv) => {
    const { data: items, error: itemsErr } = await supabase
      .from('CustomerInvoiceJobs')
      .select('*')
      .eq('InvoiceID', inv.id)
    if (itemsErr) return null
    const total = (items || []).reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)

    if (!jsPDFRef) return null
    const doc = new jsPDFRef()
    const lineHeight = 8
    let y = 15
    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)
    doc.setFontSize(16)
    doc.text(`Invoice ${inv.InvoiceID}`, 15, y)
    y += lineHeight
    doc.setFontSize(12)
    doc.text(`Date: ${formatDateByCountry(inv.InvoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight
    doc.text(`Customer: ${customer.CustomerName}`, 15, y)
    y += lineHeight
    if (addressLines.length) {
      doc.text(`Address: ${addressLines.join(', ')}`, 15, y)
      y += lineHeight
    }
    y += 4
    doc.setFontSize(14)
    doc.text('Items', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    (items || []).forEach((it) => {
      doc.text(`${it.Service} - ${currencySymbol}${parseFloat(it.Price || 0).toFixed(2)}`, 15, y)
      y += lineHeight
    })
    y += 4
    doc.setFontSize(14)
    doc.text(`Total: ${currencySymbol}${parseFloat(total).toFixed(2)}`, 15, y)
    y += lineHeight
    if (messageFooter) {
      y += 4
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(messageFooter, 180)
      doc.text(lines, 15, y)
    }
    return doc.output('blob')
  }

  const downloadBlobToDevice = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const attemptShareWithPdf = async (blob, filename, text) => {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' })

      // Check if Web Share API with files is supported (assumed mobile)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // On mobile, this will show share sheet including WhatsApp
        await navigator.share({ 
          files: [file], 
          title: filename,
          text: text
        })
        return true
      }
    } catch (err) {
      // User cancelled or share failed
      console.log('Share cancelled or failed:', err)
    }
    return false
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Invoices for {customer.CustomerName}</h3>
        {invoices.length === 0 ? (
          <p>No invoices found for this customer.</p>
        ) : (
          <table className="services-table">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Date</th>
                <th>View</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.InvoiceID}</td>
                  <td>{formatDateByCountry(inv.InvoiceDate, user.SettingsCountry || 'United Kingdom')}</td>
                  <td>
                    <button onClick={() => setItemsModal({ show: true, invoice: inv })}>View</button>
                  </td>
                  <td>
                    <button onClick={() => sendText(inv)}>Send Text</button>
                    <button onClick={() => sendEmail(inv)} style={{ marginLeft: '8px' }}>Send Email</button>
                    <button onClick={async () => {
                      const blob = await generatePdfBlob(inv)
                      if (blob) downloadBlobToDevice(blob, `Invoice-${inv.InvoiceID}.pdf`)
                    }} style={{ marginLeft: '8px' }}>Download PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {itemsModal.show && itemsModal.invoice && (
          <InvoiceItemsModal
            user={user}
            customer={customer}
            invoice={itemsModal.invoice}
            onClose={() => setItemsModal({ show: false, invoice: null })}
            onSaved={() => {
              // Refresh list after saving items
              (async () => {
                const { data, error } = await supabase
                  .from('CustomerInvoices')
                  .select('*')
                  .eq('CustomerID', customer.id)
                  .order('id', { ascending: false })
                if (!error) setInvoices(data || [])
              })()
            }}
          />
        )}
      </div>
    </div>
  )
}

export default InvoicesModal
