import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getCurrencyConfig, formatDateByCountry } from '../lib/format'
import './Invoice.css'

function InvoiceItemsModal({ user, customer, invoice, onClose, onSaved }) {
  const [items, setItems] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol

  useEffect(() => {
    async function init() {
      const { data, error } = await supabase
        .from('CustomerInvoiceJobs')
        .select('*')
        .eq('InvoiceID', invoice.id)
        .order('id', { ascending: true })
      if (!error) setItems((data || []).map((d) => ({ id: d.id, Service: d.Service || '', Price: parseFloat(d.Price) || 0 })))
    }
    init()
  }, [invoice.id])

  const total = useMemo(() => items.reduce((s, it) => s + (parseFloat(it.Price) || 0), 0), [items])

  const updateItem = (index, patch) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const addItemRow = () => {
    setItems((prev) => [...prev, { Service: '', Price: 0 }])
  }

  const removeItemRow = (index) => {
    setItems((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed?.id) setDeletedIds((d) => [...d, removed.id])
      return next
    })
  }

  const handleSave = async () => {
    // Update existing
    const updates = items.filter((it) => it.id).map((it) => (
      supabase
        .from('CustomerInvoiceJobs')
        .update({ Service: it.Service, Price: parseInt(it.Price) || 0 })
        .eq('id', it.id)
    ))

    // Insert new
    const insertsData = items.filter((it) => !it.id).map((it) => ({ InvoiceID: invoice.id, Service: it.Service, Price: parseInt(it.Price) || 0 }))
    let inserts = []
    if (insertsData.length) {
      inserts = [supabase.from('CustomerInvoiceJobs').insert(insertsData)]
    }

    // Delete removed
    let deletes = []
    if (deletedIds.length) {
      deletes = [supabase.from('CustomerInvoiceJobs').delete().in('id', deletedIds)]
    }

    try {
      await Promise.all([...updates, ...inserts, ...deletes])
      if (onSaved) onSaved()
      onClose()
    } catch (e) {
      alert('Failed to save invoice items: ' + e.message)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Invoice {invoice.InvoiceID}</h3>
        <div style={{ marginBottom: '8px' }}>
          <div><strong>Customer:</strong> {customer.CustomerName}</div>
          <div><strong>Date:</strong> {formatDateByCountry(invoice.InvoiceDate, user.SettingsCountry || 'United Kingdom')}</div>
        </div>

        <div className="invoice-items">
          {items.map((it, idx) => (
            <div className="invoice-item-row" key={it.id ?? idx}>
              <div className="invoice-field">
                <label>Service</label>
                <input type="text" value={it.Service} onChange={(e) => updateItem(idx, { Service: e.target.value })} />
              </div>
              <div className="invoice-field">
                <label>Price</label>
                <input type="number" step="0.01" value={it.Price} onChange={(e) => updateItem(idx, { Price: e.target.value })} />
              </div>
              <button className="remove-item-btn" onClick={() => removeItemRow(idx)}>✕</button>
            </div>
          ))}
          <button className="add-item-btn" onClick={addItemRow}>+ Add Item</button>
        </div>

        <div className="invoice-total-row">
          <strong>Total:</strong> {formatCurrency(total, user.SettingsCountry || 'United Kingdom')}
        </div>

        <div className="modal-buttons">
          <button className="modal-ok-btn" onClick={handleSave}>Save</button>
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default InvoiceItemsModal
