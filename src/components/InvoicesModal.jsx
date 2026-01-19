import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getCurrencyConfig, formatDateByCountry } from '../lib/format'
import './Invoice.css'
import InvoiceItemsModal from './InvoiceItemsModal'
// jsPDF loaded via CDN script; fallback avoids bundler import issues
const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null

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
    // Save PDF locally first
    await downloadPdf(inv)
    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    if (!phone) {
      alert('This customer does not have a valid phone number.')
      return
    }
    const body = await buildBody(inv)
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`
    window.open(url, '_blank')
  }

  const sendEmail = async (inv) => {
    // Save PDF locally first
    await downloadPdf(inv)
    const email = customer.EmailAddress
    if (!email) {
      alert('This customer does not have an email address.')
      return
    }
    const subject = `Invoice ${inv.InvoiceID}`
    const body = await buildBody(inv)
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  const downloadPdf = async (inv) => {
    // Build items content
    const { data: items, error: itemsErr } = await supabase
      .from('CustomerInvoiceJobs')
      .select('*')
      .eq('InvoiceID', inv.id)
    if (itemsErr) return
    const total = (items || []).reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)

    if (!jsPDFRef) return
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
    doc.save(`Invoice-${inv.InvoiceID}.pdf`)
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
                    <button onClick={() => downloadPdf(inv)} style={{ marginLeft: '8px' }}>Download PDF</button>
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
