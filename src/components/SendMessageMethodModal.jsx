import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CONTACT_METHODS, getDefaultContactMethod } from '../lib/contactDelivery'
import './SendMessageMethodModal.css'

function SendMessageMethodModal({ isOpen, customer, onCancel, onSend }) {
  const [selectedMethod, setSelectedMethod] = useState('')
  const [invoices, setInvoices] = useState([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSelectedMethod(getDefaultContactMethod(customer))
  }, [isOpen, customer])

  useEffect(() => {
    if (!isOpen || !customer?.id) {
      setInvoices([])
      setSelectedInvoiceId('')
      return
    }

    let cancelled = false

    const fetchInvoices = async () => {
      setLoadingInvoices(true)
      try {
        const { data, error } = await supabase
          .from('CustomerInvoices')
          .select('id, InvoiceID, InvoiceDate')
          .eq('CustomerID', customer.id)
          .order('id', { ascending: false })

        if (error) throw error
        if (cancelled) return
        setInvoices(data || [])
        setSelectedInvoiceId('')
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching customer invoices for send modal:', error.message)
          setInvoices([])
          setSelectedInvoiceId('')
        }
      } finally {
        if (!cancelled) setLoadingInvoices(false)
      }
    }

    fetchInvoices()

    return () => {
      cancelled = true
    }
  }, [isOpen, customer?.id])

  if (!isOpen) return null

  const selectedInvoice = invoices.find((invoice) => String(invoice.id) === String(selectedInvoiceId)) || null

  return (
    <div className="send-message-modal-overlay" onClick={onCancel}>
      <div className="send-message-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Send message via</h3>
        <select
          value={selectedMethod}
          onChange={(event) => setSelectedMethod(event.target.value)}
          className="send-message-method-select"
        >
          {CONTACT_METHODS.map((method) => (
            <option key={method} value={method}>{method}</option>
          ))}
        </select>
        {!loadingInvoices && invoices.length > 0 && (
          <>
            <label className="send-message-invoice-label" htmlFor="send-message-invoice-select">
              Attach invoice
            </label>
            <select
              id="send-message-invoice-select"
              value={selectedInvoiceId}
              onChange={(event) => setSelectedInvoiceId(event.target.value)}
              className="send-message-method-select"
            >
              <option value="">No invoice</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  Invoice {invoice.InvoiceID || invoice.id}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="send-message-modal-buttons">
          <button type="button" className="modal-cancel-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="modal-ok-btn" onClick={() => onSend(selectedMethod, selectedInvoice)}>Send</button>
        </div>
      </div>
    </div>
  )
}

export default SendMessageMethodModal