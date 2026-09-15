import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'
import { getOwnerUserId, isOwnerUser } from '../lib/team'
import './Invoice.css'

function getPropertyAddress(customer) {
  if (!customer) return '—'
  return [customer.Address, customer.Address2, customer.Address3, customer.Postcode]
    .filter(Boolean)
    .join(', ') || '—'
}

const inputStyle = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '0.5rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.9rem'
}

// Fetches an image (any format the browser supports) and normalizes it to a PNG data URL for jsPDF
async function loadImageAsPngDataUrl(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Unable to fetch logo image')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Unable to load logo image'))
      image.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function CreateInvoiceModal({ user, ownerUserId, isOwner, onClose, onSaved }) {
  const [mode, setMode] = useState('property') // 'property' | 'external'
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOptions, setCustomerOptions] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [externalName, setExternalName] = useState('')
  const [externalAddress, setExternalAddress] = useState('')
  const [externalClientOptions, setExternalClientOptions] = useState([])
  const [showExternalOptions, setShowExternalOptions] = useState(false)
  const [invoiceIdText, setInvoiceIdText] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState([{ Service: '', Price: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function computeNextInvoiceId() {
      try {
        let custQuery = supabase.from('Customers').select('id').eq('UserId', ownerUserId)
        if (!isOwner && user?.id) custQuery = custQuery.eq('AssignedUserId', user.id)
        const { data: custIdsData } = await custQuery
        const ids = (custIdsData || []).map((c) => c.id)

        let invQuery = supabase.from('CustomerInvoices').select('InvoiceID').order('id', { ascending: false }).limit(200)
        if (ids.length > 0) {
          invQuery = invQuery.or(`CustomerID.in.(${ids.join(',')}),UserId.eq.${ownerUserId}`)
        } else {
          invQuery = invQuery.eq('UserId', ownerUserId)
        }
        const { data: invs } = await invQuery

        const parseNum = (str) => {
          if (!str) return null
          const match = String(str).match(/(\d+)/g)
          if (!match || match.length === 0) return null
          const n = parseInt(match[match.length - 1], 10)
          return Number.isNaN(n) ? null : n
        }

        let maxNum = null
        for (const r of invs || []) {
          const n = parseNum(r.InvoiceID)
          if (n !== null && (maxNum === null || n > maxNum)) maxNum = n
        }
        setInvoiceIdText(maxNum !== null ? String(maxNum + 1) : '1')
      } catch (e) {
        setInvoiceIdText('1')
      }
    }
    computeNextInvoiceId()
  }, [ownerUserId, isOwner, user?.id])

  useEffect(() => {
    async function searchCustomers() {
      if (!customerQuery.trim()) {
        setCustomerOptions([])
        return
      }
      let query = supabase
        .from('Customers')
        .select('id, CustomerName, Address, Address2, Address3, Postcode, AssignedUserId')
        .eq('UserId', ownerUserId)
        .ilike('CustomerName', `%${customerQuery.trim()}%`)
        .limit(20)
      if (!isOwner && user?.id) query = query.eq('AssignedUserId', user.id)
      const { data, error: searchError } = await query
      if (!searchError) setCustomerOptions(data || [])
    }
    const timeout = setTimeout(searchCustomers, 250)
    return () => clearTimeout(timeout)
  }, [customerQuery, ownerUserId, isOwner, user?.id])

  useEffect(() => {
    async function searchExternalClients() {
      if (mode !== 'external') {
        setExternalClientOptions([])
        return
      }
      let query = supabase
        .from('ExternalClients')
        .select('id, ClientName, ClientAddress')
        .eq('UserId', ownerUserId)
        .order('ClientName', { ascending: true })
        .limit(50)
      if (externalName.trim()) {
        query = query.ilike('ClientName', `%${externalName.trim()}%`)
      }
      const { data, error: searchError } = await query
      if (!searchError) setExternalClientOptions(data || [])
    }
    const timeout = setTimeout(searchExternalClients, 250)
    return () => clearTimeout(timeout)
  }, [externalName, mode, ownerUserId])

  const updateItem = (index, patch) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const addItemRow = () => setItems((prev) => [...prev, { Service: '', Price: '' }])
  const removeItemRow = (index) => setItems((prev) => prev.filter((_, i) => i !== index))

  const total = items.reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)

  const handleSave = async () => {
    setError('')

    if (mode === 'property' && !selectedCustomer) {
      setError('Please select a property.')
      return
    }
    if (mode === 'external' && !externalName.trim()) {
      setError('Please enter a client name.')
      return
    }
    if (!invoiceIdText.trim()) {
      setError('Please enter an invoice number.')
      return
    }
    const validItems = items.filter((it) => it.Service && it.Price)
    if (validItems.length === 0) {
      setError('Please add at least one service and price.')
      return
    }

    try {
      setSaving(true)

      const invoicePayload = {
        InvoiceID: invoiceIdText.trim(),
        InvoiceDate: invoiceDate,
        UserId: ownerUserId,
        CustomerID: mode === 'property' ? selectedCustomer.id : null,
        ExternalClientName: mode === 'external' ? externalName.trim() : null,
        ExternalClientAddress: mode === 'external' ? externalAddress.trim() || null : null,
      }

      const { data: invData, error: invErr } = await supabase
        .from('CustomerInvoices')
        .insert(invoicePayload)
        .select()

      if (invErr) throw new Error(invErr.message || 'Failed to create invoice')

      const invoiceRow = Array.isArray(invData) ? invData[0] : invData

      const itemsPayload = validItems.map((it) => ({
        InvoiceID: invoiceRow.id,
        Service: it.Service,
        Price: parseFloat(it.Price) || 0,
      }))

      const { error: jobsErr } = await supabase.from('CustomerInvoiceJobs').insert(itemsPayload)
      if (jobsErr) throw new Error(jobsErr.message || 'Failed to save invoice items')

      if (mode === 'external') {
        const { error: clientErr } = await supabase
          .from('ExternalClients')
          .upsert(
            {
              UserId: ownerUserId,
              ClientName: externalName.trim(),
              ClientAddress: externalAddress.trim() || null,
              UpdatedAt: new Date().toISOString(),
            },
            { onConflict: 'UserId,ClientName' }
          )
        if (clientErr) console.error('Failed to save external client details:', clientErr.message)
      }

      if (onSaved) onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Unable to save invoice')
    } finally {
      setSaving(false)
    }
  }

  const addressLines = selectedCustomer
    ? [selectedCustomer.Address, selectedCustomer.Address2, selectedCustomer.Address3, selectedCustomer.Postcode].filter(Boolean)
    : []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content invoice-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Create Invoice</h3>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setMode('property')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #3498db',
              backgroundColor: mode === 'property' ? '#3498db' : 'white',
              color: mode === 'property' ? 'white' : '#3498db',
              cursor: 'pointer'
            }}
          >
            Existing Property
          </button>
          <button
            onClick={() => setMode('external')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #3498db',
              backgroundColor: mode === 'external' ? '#3498db' : 'white',
              color: mode === 'external' ? 'white' : '#3498db',
              cursor: 'pointer'
            }}
          >
            External Client
          </button>
        </div>

        {mode === 'property' ? (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Search Property</label>
            <input
              type="text"
              placeholder="Search by customer name..."
              value={selectedCustomer ? selectedCustomer.CustomerName : customerQuery}
              onChange={(e) => {
                setSelectedCustomer(null)
                setCustomerQuery(e.target.value)
              }}
              style={inputStyle}
            />
            {!selectedCustomer && customerOptions.length > 0 && (
              <div style={{ border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto' }}>
                {customerOptions.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c)
                      setCustomerOptions([])
                    }}
                    style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                  >
                    <div style={{ fontWeight: 600 }}>{c.CustomerName}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{getPropertyAddress(c)}</div>
                  </div>
                ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="invoice-customer" style={{ marginTop: '12px' }}>
                <div><strong>Name:</strong> {selectedCustomer.CustomerName}</div>
                <div><strong>Address:</strong> {addressLines.join(', ') || '—'}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="invoice-header-row" style={{ marginBottom: '16px' }}>
            <div className="invoice-field" style={{ position: 'relative' }}>
              <label>Client Name</label>
              <input
                type="text"
                placeholder="Select or type a new client name"
                value={externalName}
                onChange={(e) => {
                  setExternalName(e.target.value)
                  setExternalAddress('')
                  setShowExternalOptions(true)
                }}
                onFocus={() => setShowExternalOptions(true)}
                onBlur={() => setTimeout(() => setShowExternalOptions(false), 150)}
                style={inputStyle}
              />
              {showExternalOptions && (externalClientOptions.length > 0 || externalName.trim()) && (
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', position: 'absolute', background: 'white', width: '100%', zIndex: 5 }}>
                  {externalClientOptions.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={() => {
                        setExternalName(c.ClientName)
                        setExternalAddress(c.ClientAddress || '')
                        setShowExternalOptions(false)
                      }}
                      style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                    >
                      <div style={{ fontWeight: 600 }}>{c.ClientName}</div>
                      {c.ClientAddress && <div style={{ fontSize: '0.85rem', color: '#666' }}>{c.ClientAddress}</div>}
                    </div>
                  ))}
                  {externalName.trim() && !externalClientOptions.some((c) => c.ClientName.toLowerCase() === externalName.trim().toLowerCase()) && (
                    <div
                      onMouseDown={() => setShowExternalOptions(false)}
                      style={{ padding: '0.5rem', cursor: 'pointer', color: '#3498db' }}
                    >
                      + Create new client "{externalName.trim()}"
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="invoice-field">
              <label>Address (optional)</label>
              <input type="text" value={externalAddress} onChange={(e) => setExternalAddress(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        <div className="invoice-header-row">
          <div className="invoice-field">
            <label>Invoice ID</label>
            <input type="text" value={invoiceIdText} onChange={(e) => setInvoiceIdText(e.target.value)} style={inputStyle} />
          </div>
          <div className="invoice-field">
            <label>Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div className="invoice-items" style={{ marginTop: '16px' }}>
          {items.map((it, idx) => (
            <div className="invoice-item-row" key={idx}>
              <div className="invoice-field">
                {idx === 0 && <label>Service</label>}
                <input
                  type="text"
                  placeholder="Service"
                  value={it.Service}
                  onChange={(e) => updateItem(idx, { Service: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div className="invoice-field">
                {idx === 0 && <label>Price</label>}
                <input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={it.Price}
                  onChange={(e) => updateItem(idx, { Price: e.target.value })}
                  style={inputStyle}
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

        {error && <div style={{ color: '#b42318', marginTop: '8px' }}>{error}</div>}

        <div className="modal-buttons">
          <button className="modal-ok-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function InvoiceDetailsModal({ user, invoice, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    async function loadItems() {
      setLoading(true)
      const { data, error } = await supabase
        .from('CustomerInvoiceJobs')
        .select('*')
        .eq('InvoiceID', invoice.id)
        .order('id', { ascending: true })
      if (!error) setItems(data || [])
      setLoading(false)
    }
    loadItems()
  }, [invoice.id])

  const total = items.reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol
      const doc = new jsPDF()
      const lineHeight = 8
      let y = 15
      const pageWidth = doc.internal.pageSize.getWidth()

      if (user.LogoUrl) {
        try {
          const logo = await loadImageAsPngDataUrl(user.LogoUrl)
          const maxWidth = 60
          const maxHeight = 25
          const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1)
          const w = logo.width * scale
          const h = logo.height * scale
          doc.addImage(logo.dataUrl, 'PNG', (pageWidth - w) / 2, y, w, h)
          y += h + 6

          if (user.IncludeCompanyNameUnderLogo && user.CompanyName) {
            doc.setFontSize(14)
            const companyNameWidth = doc.getTextWidth(user.CompanyName)
            doc.text(user.CompanyName, (pageWidth - companyNameWidth) / 2, y)
            y += lineHeight + 4
          }
        } catch (e) {
          console.error('Failed to load invoice logo:', e)
        }
      } else if (user.CompanyName) {
        doc.setFontSize(18)
        const companyNameWidth = doc.getTextWidth(user.CompanyName)
        doc.text(user.CompanyName, (pageWidth - companyNameWidth) / 2, y)
        y += lineHeight + 4
      }

      doc.setFontSize(14)
      doc.text(invoice.customerName || 'Client', 15, y)
      y += lineHeight
      doc.setFontSize(12)
      const secondLine = invoice.CustomerID ? invoice.property : (invoice.ExternalClientAddress || '')
      if (secondLine) {
        doc.text(secondLine, 15, y)
        y += lineHeight
      }
      y += 4

      doc.text(`Invoice Number: ${invoice.InvoiceID}`, 15, y)
      y += lineHeight
      doc.text(`Invoice Date: ${formatDateByCountry(invoice.InvoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
      y += lineHeight + 4

      doc.setFontSize(14)
      doc.text('Items', 15, y)
      y += lineHeight
      doc.setFontSize(12)
      items.forEach((it) => {
        doc.text(it.Service || '', 15, y)
        doc.text(`${currencySymbol}${(parseFloat(it.Price) || 0).toFixed(2)}`, 150, y)
        y += lineHeight
      })

      y += 4
      doc.setFontSize(14)
      doc.text('Total:', 15, y)
      doc.text(`${currencySymbol}${total.toFixed(2)}`, 150, y)

      if (user.InvoiceFooter) {
        y += lineHeight + 4
        doc.setFontSize(11)
        doc.setTextColor(100, 100, 100)
        const footerLines = doc.splitTextToSize(user.InvoiceFooter, 170)
        doc.text(footerLines, 15, y)
        doc.setTextColor(0, 0, 0)
      }

      doc.save(`Invoice-${invoice.InvoiceID}.pdf`)
    } catch (e) {
      alert(e.message || 'Unable to generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content invoice-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Invoice {invoice.InvoiceID}</h3>
        <div className="invoice-customer">
          <div><strong>Customer:</strong> {invoice.customerName}</div>
          <div><strong>{invoice.CustomerID ? 'Property' : 'Address'}:</strong> {invoice.CustomerID ? invoice.property : (invoice.ExternalClientAddress || '—')}</div>
          <div><strong>Date:</strong> {formatDateByCountry(invoice.InvoiceDate, user.SettingsCountry || 'United Kingdom')}</div>
          <div><strong>Status:</strong> {invoice.GoCardlessPaymentStatus || 'N/A'}</div>
        </div>

        {loading ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>Loading items...</div>
        ) : (
          <div className="invoice-items">
            {items.length === 0 ? (
              <div style={{ color: '#666' }}>No line items for this invoice.</div>
            ) : (
              items.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                  <span>{it.Service}</span>
                  <span>{formatCurrency(parseFloat(it.Price) || 0, user.SettingsCountry || 'United Kingdom')}</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="invoice-total-row">
          <strong>Total:</strong> {formatCurrency(total, user.SettingsCountry || 'United Kingdom')}
        </div>

        <div className="modal-buttons">
          <button className="modal-ok-btn" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Preparing...' : 'Download'}
          </button>
          <button className="modal-cancel-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Invoices({ user }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const ownerUserId = getOwnerUserId(user)
  const isOwner = isOwnerUser(user)

  useEffect(() => {
    fetchInvoices()
  }, [ownerUserId, isOwner, user?.id])

  async function fetchInvoices() {
    if (!ownerUserId) return

    try {
      setLoading(true)

      let customerQuery = supabase
        .from('Customers')
        .select('id, CustomerName, Address, Address2, Address3, Postcode, AssignedUserId')
        .eq('UserId', ownerUserId)

      if (!isOwner && user?.id) {
        customerQuery = customerQuery.eq('AssignedUserId', user.id)
      }

      const { data: customers, error: customersError } = await customerQuery
      if (customersError) throw customersError

      const customerMap = new Map((customers || []).map((c) => [c.id, c]))
      const customerIds = (customers || []).map((c) => c.id)

      let invoiceRows = []
      if (customerIds.length > 0) {
        const { data, error: invoicesError } = await supabase
          .from('CustomerInvoices')
          .select('*')
          .in('CustomerID', customerIds)
          .order('id', { ascending: false })
        if (invoicesError) throw invoicesError
        invoiceRows = data || []
      }

      // Invoices for external clients (no property) are scoped by account owner, visible to the whole team
      const { data: externalRows, error: externalError } = await supabase
        .from('CustomerInvoices')
        .select('*')
        .is('CustomerID', null)
        .eq('UserId', ownerUserId)
        .order('id', { ascending: false })
      if (externalError) throw externalError

      const enriched = [...invoiceRows, ...(externalRows || [])].map((inv) => {
        if (!inv.CustomerID) {
          return {
            ...inv,
            customerName: inv.ExternalClientName || 'External Client',
            property: inv.ExternalClientName || 'External Client',
          }
        }
        const customer = customerMap.get(inv.CustomerID)
        return {
          ...inv,
          customerName: customer?.CustomerName || 'Unknown Customer',
          property: getPropertyAddress(customer),
        }
      }).sort((a, b) => b.id - a.id)

      setInvoices(enriched)
    } catch (error) {
      console.error('Error fetching invoices:', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', border: '1px solid #d6e4ff', borderRadius: '10px', padding: '1rem', background: '#f8fbff', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>Invoices ({invoices.length})</strong>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            + Create
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>No invoices yet.</div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '320px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #d6e4ff' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Invoice Number</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Property</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 'bold' }}></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '0.75rem 0.5rem', wordBreak: 'break-word' }}>{invoice.InvoiceID}</td>
                    <td style={{ padding: '0.75rem 0.5rem', wordBreak: 'break-word' }}>{invoice.property}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <button
                        onClick={() => setSelectedInvoice(invoice)}
                        style={{
                          padding: '0.4rem 0.9rem',
                          backgroundColor: '#3498db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedInvoice && (
        <InvoiceDetailsModal
          user={user}
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {showCreateModal && (
        <CreateInvoiceModal
          user={user}
          ownerUserId={ownerUserId}
          isOwner={isOwner}
          onClose={() => setShowCreateModal(false)}
          onSaved={fetchInvoices}
        />
      )}
    </div>
  )
}

export default Invoices
