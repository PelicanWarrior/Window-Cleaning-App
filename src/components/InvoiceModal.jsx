import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getCurrencyConfig, formatDateByCountry } from '../lib/format'
import { sendInvoiceWhatsApp } from '../lib/whatsappCloud'
// jsPDF loaded via CDN script; fallback avoids bundler import issues
const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null
import './Invoice.css'

function InvoiceModal({ user, customer, onClose, onSaved }) {
  const [invoiceIdText, setInvoiceIdText] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [services, setServices] = useState([])
  const [items, setItems] = useState([{ mode: 'select', ServiceId: '', Service: '', Price: 0 }])
  const [messageFooter, setMessageFooter] = useState('')
  const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol

  useEffect(() => {
    async function init() {
      // Fetch selectable services for this customer
      const { data: svc, error: svcErr } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customer.id)
      if (!svcErr) setServices(svc || [])

      // Fetch message footer
      const { data: udata, error: uerr } = await supabase
        .from('Users')
        .select('MessageFooter')
        .eq('id', user.id)
        .single()
      if (!uerr) setMessageFooter(udata?.MessageFooter || '')

      // Determine next InvoiceID based on user's previous invoices
      try {
        const { data: custIdsData, error: custErr } = await supabase
          .from('Customers')
          .select('id')
          .eq('UserId', user.id)
        if (custErr) throw custErr

        const ids = (custIdsData || []).map((c) => c.id)
        let nextIdText = '1'
        if (ids.length > 0) {
          const { data: invs, error: invErr } = await supabase
            .from('CustomerInvoices')
            .select('InvoiceID')
            .in('CustomerID', ids)
            .order('id', { ascending: false })
            .limit(200)
          if (invErr) throw invErr

          const parseNum = (str) => {
            if (!str) return null
            // Extract last continuous digit sequence
            const match = String(str).match(/(\d+)/g)
            if (!match || match.length === 0) return null
            const last = match[match.length - 1]
            const n = parseInt(last, 10)
            return Number.isNaN(n) ? null : n
          }

          let maxNum = null
          for (const r of invs || []) {
            const n = parseNum(r.InvoiceID)
            if (n !== null) {
              if (maxNum === null || n > maxNum) maxNum = n
            }
          }
          if (maxNum !== null) nextIdText = String(maxNum + 1)
        }
        setInvoiceIdText(nextIdText)
      } catch (e) {
        // fallback
        setInvoiceIdText('1')
      }
    }
    init()
  }, [customer.id, user.id])

  const total = useMemo(() => {
    return items.reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)
  }, [items])

  const updateItem = (index, patch) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const addItemRow = () => {
    setItems((prev) => [...prev, { mode: 'select', ServiceId: '', Service: '', Price: 0 }])
  }

  const removeItemRow = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async (sendMode) => {
    if (!invoiceIdText || items.length === 0) {
      alert('Please add an Invoice ID and at least one item')
      return
    }

    // If sending, generate and share the PDF first to preserve user gesture
    let shared = false
    let apiSent = false
    if (sendMode === 'text' || sendMode === 'email') {
      const preItemsPayload = items.map((it) => ({
        InvoiceID: null,
        Service: it.Service,
        Price: parseInt(it.Price) || 0,
      }))
      const pdfBlob = await generateInvoicePdf(null, preItemsPayload)
      const filename = `Invoice-${invoiceIdText}.pdf`
      const bodyText = `Invoice ${invoiceIdText} for ${customer.CustomerName}\n${formatLines()}`

      shared = await attemptShareWithPdf(pdfBlob, filename, bodyText, customer.PhoneNumber)
      if (!shared) {
        // Fallback: download PDF and open WhatsApp/email directly
        downloadBlob(pdfBlob, filename)
        if (sendMode === 'text') {
          sendWhatsApp()
        } else if (sendMode === 'email') {
          sendEmail()
        }
      }
    }

    // Proceed to save after sharing attempt
    const { data: invData, error: invErr } = await supabase
      .from('CustomerInvoices')
      .insert({ CustomerID: customer.id, InvoiceID: invoiceIdText, InvoiceDate: invoiceDate })
      .select()

    if (invErr) {
      alert('Failed to save invoice: ' + invErr.message)
      return
    }

    const invoiceRow = Array.isArray(invData) ? invData[0] : invData
    const invoicePk = invoiceRow?.id

    const itemsPayload = items.map((it) => ({
      InvoiceID: invoicePk,
      Service: it.Service,
      Price: parseInt(it.Price) || 0,
    }))
    const { error: jobsErr } = await supabase
      .from('CustomerInvoiceJobs')
      .insert(itemsPayload)
    if (jobsErr) {
      alert('Failed to save invoice items: ' + jobsErr.message)
      return
    }

    if (onSaved) onSaved({ invoice: invoiceRow, items: itemsPayload })

    onClose()
  }

  const formatLines = () => {
    const lines = items.map((it) => `${it.Service} - ${currencySymbol}${parseFloat(it.Price || 0).toFixed(2)}`)
    lines.push(`Total: ${currencySymbol}${parseFloat(total).toFixed(2)}`)
    if (messageFooter) lines.push(messageFooter)
    return lines.join('\n')
  }

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 11 && digits.startsWith('0')) return `44${digits.slice(1)}`
    return digits
  }

  const sendWhatsApp = () => {
    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    if (!phone) {
      alert('This customer does not have a valid phone number.')
      return
    }
    const body = `Invoice ${invoiceIdText} for ${customer.CustomerName}\n${formatLines()}`
    // Prefer opening WhatsApp app directly when available
    const appUrl = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(body)}`
    const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`
    // Try app scheme first
    const opened = window.open(appUrl, '_blank')
    if (!opened) {
      // Fallback to WhatsApp Web
      window.open(webUrl, '_blank')
    }
  }

  const sendEmail = (invoiceRow) => {
    const email = customer.EmailAddress
    if (!email) {
      alert('This customer does not have an email address.')
      return
    }
    const subject = `Invoice ${invoiceIdText}`
    const body = `Hello ${customer.CustomerName},\n\n${formatLines()}`
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  const generateInvoicePdf = async (invoiceRow, itemsPayload) => {
    if (!jsPDFRef) throw new Error('PDF library not loaded')
    const doc = new jsPDFRef()
    const lineHeight = 8
    let y = 15

    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

    doc.setFontSize(16)
    doc.text(`Invoice ${invoiceIdText}`, 15, y)
    y += lineHeight
    doc.setFontSize(12)
    doc.text(`Date: ${formatDateByCountry(invoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
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
    itemsPayload.forEach((it) => {
      const line = `${it.Service} - ${currencySymbol}${parseFloat(it.Price || 0).toFixed(2)}`
      doc.text(line, 15, y)
      y += lineHeight
    })

    y += 4
    const totalVal = itemsPayload.reduce((s, it) => s + (parseFloat(it.Price) || 0), 0)
    doc.setFontSize(14)
    doc.text(`Total: ${currencySymbol}${parseFloat(totalVal).toFixed(2)}`, 15, y)
    y += lineHeight

    if (messageFooter) {
      y += 4
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(messageFooter, 180)
      doc.text(lines, 15, y)
    }

    return doc.output('blob')
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const attemptShareWithPdf = async (blob, filename, text, phoneNumber) => {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' })
      
      // Prefer sharing only on mobile devices that support file sharing
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        // On mobile, this will show share sheet including WhatsApp
        await navigator.share({ 
          files: [file], 
          title: `Invoice ${invoiceIdText}`,
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
      <div className="modal-content invoice-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Create Invoice</h3>

        <div className="invoice-customer">
          <div><strong>Name:</strong> {customer.CustomerName}</div>
          <div><strong>Address:</strong> {[customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean).join(', ')}</div>
          <div><strong>Phone:</strong> {customer.PhoneNumber || '—'}</div>
          <div><strong>Email:</strong> {customer.EmailAddress || '—'}</div>
        </div>

        <div className="invoice-header-row">
          <div className="invoice-field">
            <label>Invoice ID</label>
            <input type="text" value={invoiceIdText} onChange={(e) => setInvoiceIdText(e.target.value)} />
          </div>
          <div className="invoice-field">
            <label>Invoice Date</label>
            <div>{formatDateByCountry(invoiceDate, user.SettingsCountry || 'United Kingdom')}</div>
          </div>
        </div>

        <div className="invoice-items">
          {items.map((it, idx) => (
            <div className="invoice-item-row" key={idx}>
              <div className="invoice-field">
                <label>Service</label>
                {it.mode === 'select' ? (
                  <select
                    value={it.ServiceId || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '__custom__') {
                        updateItem(idx, { mode: 'custom', ServiceId: '', Service: '', Price: 0 })
                        return
                      }
                      const svc = services.find((s) => String(s.id) === String(val))
                      updateItem(idx, {
                        ServiceId: val,
                        Service: svc?.Service || '',
                        Price: svc ? parseFloat(svc.Price) || 0 : 0,
                      })
                    }}
                  >
                    <option value="">Select service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.Service}</option>
                    ))}
                    <option value="__custom__">Custom item…</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Custom description"
                    value={it.Service}
                    onChange={(e) => updateItem(idx, { Service: e.target.value })}
                  />
                )}
              </div>
              <div className="invoice-field">
                <label>Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={it.Price}
                  onChange={(e) => updateItem(idx, { Price: e.target.value })}
                />
              </div>
              <button className="remove-item-btn" onClick={() => removeItemRow(idx)}>✕</button>
            </div>
          ))}
          <button className="add-item-btn" onClick={addItemRow}>+ Add Item</button>
        </div>

        <div className="invoice-total-row">
          <strong>Total:</strong> {formatCurrency(total, user.SettingsCountry || 'United Kingdom')}
        </div>

        {messageFooter && (
          <div className="invoice-footer-note">{messageFooter}</div>
        )}

        <div className="modal-buttons">
          <button className="modal-ok-btn" onClick={() => handleSave()}>Save</button>
          <button className="modal-ok-btn" onClick={() => handleSave('text')}>Save & Send Text</button>
          <button className="modal-ok-btn" onClick={() => handleSave('email')}>Save & Send Email</button>
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default InvoiceModal
