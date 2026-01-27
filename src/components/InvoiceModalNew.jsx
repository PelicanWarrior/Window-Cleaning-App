import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getCurrencyConfig, formatDateByCountry } from '../lib/format'
import { sendInvoiceWhatsApp } from '../lib/whatsappCloud'
// jsPDF loaded via CDN script; fallback avoids bundler import issues
const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null
import './Invoice.css'

function InvoiceModalContent({ user, customer, onClose }) {
  const [invoiceIdText, setInvoiceIdText] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [services, setServices] = useState([])
  const [items, setItems] = useState([{ mode: 'select', ServiceId: '', Service: '', Price: 0 }])
  const [showSendOptions, setShowSendOptions] = useState(false)
  const [savedInvoiceData, setSavedInvoiceData] = useState(null)
  const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol
  const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null

  useEffect(() => {
    async function init() {
      // Fetch services for this customer
      const { data: svc, error: svcErr } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customer.id)
      if (!svcErr) setServices(svc || [])

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
        setInvoiceIdText('1')
      }
    }
    init()
  }, [customer.id, user.id])

  const updateItem = (index, patch) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
    
    // Auto-add new row when user selects/enters a service
    const updatedItem = { ...items[index], ...patch }
    if ((updatedItem.ServiceId || updatedItem.Service) && index === items.length - 1) {
      setItems((prev) => [...prev, { mode: 'select', ServiceId: '', Service: '', Price: 0 }])
    }
  }

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 11 && digits.startsWith('0')) return `44${digits.slice(1)}`
    return digits
  }

  const generateInvoicePdf = () => {
    if (!jsPDFRef || !savedInvoiceData) return null
    
    const doc = new jsPDFRef()
    const lineHeight = 8
    let y = 15

    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

    // Company name at the top, centered and larger
    if (user.CompanyName) {
      doc.setFontSize(18)
      const pageWidth = doc.internal.pageSize.getWidth()
      const companyNameWidth = doc.getTextWidth(user.CompanyName)
      const centerX = (pageWidth - companyNameWidth) / 2
      doc.text(user.CompanyName, centerX, y)
      y += lineHeight + 4
    }

    // Customer name and address
    doc.setFontSize(14)
    doc.text(customer.CustomerName, 15, y)
    y += lineHeight
    doc.setFontSize(12)
    if (addressLines.length) {
      addressLines.forEach(line => {
        doc.text(line, 15, y)
        y += lineHeight
      })
    }

    y += 4
    // Invoice ID
    doc.text(`Invoice Number: ${savedInvoiceData.invoiceId}`, 15, y)
    y += lineHeight
    
    // Invoice Date
    doc.text(`Invoice Date: ${formatDateByCountry(savedInvoiceData.invoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight

    y += 4
    // Services list
    doc.setFontSize(14)
    doc.text('For the following Services:', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    
    // Calculate the width needed for the longest service name
    let maxServiceWidth = 0
    savedInvoiceData.items.forEach((it) => {
      const serviceWidth = doc.getTextWidth(it.Service)
      if (serviceWidth > maxServiceWidth) {
        maxServiceWidth = serviceWidth
      }
    })
    // Also check "Total Amount" width
    const totalLabelWidth = doc.getTextWidth('Total Amount:')
    if (totalLabelWidth > maxServiceWidth) {
      maxServiceWidth = totalLabelWidth
    }
    
    const leftX = 15
    const rightX = leftX + maxServiceWidth + 10 // 10px gap between columns
    
    let total = 0
    savedInvoiceData.items.forEach((it) => {
      const price = parseFloat(it.Price) || 0
      total += price
      doc.text(it.Service, leftX, y)
      doc.text(`${currencySymbol}${price.toFixed(2)}`, rightX, y)
      y += lineHeight
    })

    y += 4
    // Total
    doc.setFontSize(14)
    doc.text('Total Amount:', leftX, y)
    doc.text(`${currencySymbol}${total.toFixed(2)}`, rightX, y)

    // Invoice Footer
    if (user.InvoiceFooter) {
      y += lineHeight + 4
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      const footerLines = doc.splitTextToSize(user.InvoiceFooter, 170)
      doc.text(footerLines, 15, y)
      doc.setTextColor(0, 0, 0)
    }

    return doc.output('blob')
  }

  const generateAndDownloadPDF = (invoiceData) => {
    if (!jsPDFRef) {
      alert('PDF generation library not loaded')
      return
    }
    
    const doc = new jsPDFRef()
    const lineHeight = 8
    let y = 15

    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

    // Company name at the top, centered and larger
    if (user.CompanyName) {
      doc.setFontSize(18)
      const pageWidth = doc.internal.pageSize.getWidth()
      const companyNameWidth = doc.getTextWidth(user.CompanyName)
      const centerX = (pageWidth - companyNameWidth) / 2
      doc.text(user.CompanyName, centerX, y)
      y += lineHeight + 4
    }

    // Customer name and address
    doc.setFontSize(14)
    doc.text(customer.CustomerName, 15, y)
    y += lineHeight
    doc.setFontSize(12)
    if (addressLines.length) {
      addressLines.forEach(line => {
        doc.text(line, 15, y)
        y += lineHeight
      })
    }

    y += 4
    // Invoice ID
    doc.text(`Invoice Number: ${invoiceData.invoiceId}`, 15, y)
    y += lineHeight
    
    // Invoice Date
    doc.text(`Invoice Date: ${formatDateByCountry(invoiceData.invoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight

    y += 4
    // Services list
    doc.setFontSize(14)
    doc.text('For the following Services:', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    
    // Calculate the width needed for the longest service name
    let maxServiceWidth = 0
    invoiceData.items.forEach((it) => {
      const serviceWidth = doc.getTextWidth(it.Service)
      if (serviceWidth > maxServiceWidth) {
        maxServiceWidth = serviceWidth
      }
    })
    // Also check "Total Amount" width
    const totalLabelWidth = doc.getTextWidth('Total Amount:')
    if (totalLabelWidth > maxServiceWidth) {
      maxServiceWidth = totalLabelWidth
    }
    
    const leftX = 15
    const rightX = leftX + maxServiceWidth + 10 // 10px gap between columns
    
    let total = 0
    invoiceData.items.forEach((it) => {
      const price = parseFloat(it.Price) || 0
      total += price
      doc.text(it.Service, leftX, y)
      doc.text(`${currencySymbol}${price.toFixed(2)}`, rightX, y)
      y += lineHeight
    })

    y += 4
    // Total
    doc.setFontSize(14)
    doc.text('Total Amount:', leftX, y)
    doc.text(`${currencySymbol}${total.toFixed(2)}`, rightX, y)

    // Invoice Footer
    if (user.InvoiceFooter) {
      y += lineHeight + 4
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      const footerLines = doc.splitTextToSize(user.InvoiceFooter, 170)
      doc.text(footerLines, 15, y)
      doc.setTextColor(0, 0, 0)
    }

    // Download the PDF
    doc.save(`Invoice-${invoiceData.invoiceId}.pdf`)
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

  const sendViaText = async () => {
    const pdfBlob = generateInvoicePdf()
    if (!pdfBlob) {
      alert('Failed to generate PDF')
      return
    }

    const filename = `Invoice-${savedInvoiceData.invoiceId}.pdf`
    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    
    if (!phone) {
      alert('Invalid phone number')
      return
    }

    const message = `Invoice ${savedInvoiceData.invoiceId} for ${customer.CustomerName}`

    // Try Web Share API first (mobile - can attach files)
    try {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' })
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
      
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: message
        })
        onClose()
        return
      }
    } catch (err) {
      console.log('Share failed:', err)
    }

    // Desktop fallback: download PDF and open WhatsApp
    downloadBlob(pdfBlob, filename)
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`
    const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    
    const opened = window.open(appUrl, '_blank')
    if (!opened) {
      window.open(webUrl, '_blank')
    }
    
    onClose()
  }

  const sendViaEmail = async () => {
    const email = customer.EmailAddress
    if (!email) {
      alert('No email address for this customer')
      return
    }
    if (!savedInvoiceData) {
      alert('Invoice data missing')
      return
    }

    try {
      // Generate PDF blob
      const pdfBlob = generateInvoicePdf()
      if (!pdfBlob) {
        alert('Failed to generate PDF')
        return
      }

      // Create a unique filename for the invoice
      const timestamp = new Date().getTime()
      const filename = `invoice_${savedInvoiceData.invoiceId}_${timestamp}.pdf`
      const filepath = `invoices/${user.id}/${filename}`

      // Upload PDF to Supabase Storage bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filepath, pdfBlob, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        alert('Failed to upload PDF: ' + uploadError.message)
        return
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(filepath)
      
      const publicUrl = publicUrlData?.publicUrl

      // Build email body with PDF download link
      const total = savedInvoiceData.items.reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)
      const itemsLines = savedInvoiceData.items.map(
        (it) => `${it.Service} - ${currencySymbol}${(parseFloat(it.Price) || 0).toFixed(2)}`
      )
      const bodyLines = [
        `Invoice ${savedInvoiceData.invoiceId}`,
        `Customer: ${customer.CustomerName}`,
        `Invoice Date: ${formatDateByCountry(savedInvoiceData.invoiceDate, user.SettingsCountry || 'United Kingdom')}`,
        '',
        'Items:',
        ...itemsLines,
        `Total: ${currencySymbol}${total.toFixed(2)}`,
        '',
        '---',
        'Download Invoice PDF:',
        publicUrl || 'PDF link unavailable'
      ]

      const subject = `Invoice ${savedInvoiceData.invoiceId}`
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
      // Use same-tab navigation for better mobile handling
      window.location.assign(mailto)
      // Small delay before closing to avoid canceling navigation on some browsers
      setTimeout(() => onClose(), 400)
    } catch (err) {
      alert('Error sending email: ' + err.message)
    }
  }

  const handleSave = async () => {
    if (!invoiceIdText) {
      alert('Please enter an Invoice ID')
      return
    }

    // Filter out empty items (like the last "select service" row)
    const validItems = items.filter(it => it.Service && it.Price)
    
    if (validItems.length === 0) {
      alert('Please add at least one service')
      return
    }

    // Create invoice header
    const { data: invData, error: invErr } = await supabase
      .from('CustomerInvoices')
      .insert({
        CustomerID: customer.id,
        InvoiceID: invoiceIdText,
        InvoiceDate: invoiceDate
      })
      .select()

    if (invErr) {
      alert('Failed to create invoice: ' + invErr.message)
      return
    }

    const invoiceRow = Array.isArray(invData) ? invData[0] : invData
    const invoicePk = invoiceRow?.id

    // Save service items
    const itemsPayload = validItems.map((it) => ({
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

    // Save data for PDF generation
    setSavedInvoiceData({
      invoiceId: invoiceIdText,
      invoiceDate: invoiceDate,
      items: validItems
    })

    // Generate and download PDF directly
    setTimeout(() => {
      generateAndDownloadPDF({
        invoiceId: invoiceIdText,
        invoiceDate: invoiceDate,
        items: validItems
      })
      onClose()
    }, 100)
  }

  const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

  if (showSendOptions) {
    return (
      <div className="modal-overlay" onClick={() => onClose()}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => onClose()}>×</button>
          <h3>Send Invoice?</h3>
          
          <div className="modal-buttons" style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            {customer.PhoneNumber && (
              <button className="modal-ok-btn" onClick={sendViaText}>Send via Text</button>
            )}
            {customer.EmailAddress && (
              <>
                <button className="modal-ok-btn" onClick={sendViaEmail} disabled={false}>Send via Email</button>
                <button className="modal-ok-btn" onClick={() => {
                  const email = customer.EmailAddress
                  const total = savedInvoiceData?.items?.reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0) || 0
                  const itemsLines = (savedInvoiceData?.items || []).map(
                    (it) => `${it.Service} - ${currencySymbol}${(parseFloat(it.Price) || 0).toFixed(2)}`
                  )
                  const bodyLines = [
                    `Invoice ${savedInvoiceData?.invoiceId ?? ''}`,
                    `Customer: ${customer.CustomerName}`,
                    `Invoice Date: ${formatDateByCountry(savedInvoiceData?.invoiceDate ?? invoiceDate, user.SettingsCountry || 'United Kingdom')}`,
                    '',
                    'Items:',
                    ...itemsLines,
                    `Total: ${currencySymbol}${total.toFixed(2)}`,
                  ]
                  const subject = `Invoice ${savedInvoiceData?.invoiceId ?? invoiceIdText}`
                  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
                  navigator.clipboard?.writeText(mailto)
                  alert('Email link copied. If the app did not open, paste this into your browser.')
                }}>Copy Email Link</button>
              </>
            )}
            <button className="modal-cancel-btn" onClick={() => onClose()}>Do not Send</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Create Invoice</h3>

        <div className="invoice-customer">
          <div><strong>Name:</strong> {customer.CustomerName}</div>
          <div><strong>Address:</strong> {addressLines.join(', ')}</div>
        </div>

        <div className="invoice-header-row" style={{ marginTop: '16px' }}>
          <div className="invoice-field">
            <label>Invoice ID</label>
            <input 
              type="text" 
              value={invoiceIdText} 
              onChange={(e) => setInvoiceIdText(e.target.value)} 
            />
          </div>
          <div className="invoice-field">
            <label>Invoice Date</label>
            <input 
              type="date" 
              value={invoiceDate} 
              onChange={(e) => setInvoiceDate(e.target.value)} 
            />
          </div>
        </div>

        <div className="invoice-items" style={{ marginTop: '16px' }}>
          {items.map((it, idx) => (
            <div className="invoice-item-row" key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '4px', alignItems: 'flex-end' }}>
              <div className="invoice-field" style={{ flex: 2 }}>
                {idx === 0 && <label>Service</label>}
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
                    placeholder="Custom service"
                    value={it.Service}
                    onChange={(e) => updateItem(idx, { Service: e.target.value })}
                  />
                )}
              </div>
              <div className="invoice-field" style={{ flex: 1 }}>
                {idx === 0 && <label>Price</label>}
                <input
                  type="number"
                  step="0.01"
                  value={it.Price}
                  onChange={(e) => updateItem(idx, { Price: e.target.value })}
                />
              </div>
              <button 
                className="remove-item-btn" 
                onClick={() => removeItem(idx)}
                style={{ 
                  color: 'red', 
                  border: 'none', 
                  background: 'none', 
                  fontSize: '20px', 
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="modal-buttons">
          <button className="modal-ok-btn" onClick={handleSave}>Save</button>
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default InvoiceModalContent
