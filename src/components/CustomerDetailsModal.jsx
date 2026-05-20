import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'
import {
  cancelGoCardlessSubscription,
  createGoCardlessFlow,
  createGoCardlessSubscription,
  refundGoCardlessPayment,
  syncGoCardlessMandateStatus,
  syncGoCardlessBillingRequest,
  updateGoCardlessSubscription,
} from '../lib/gocardless'
import './CustomerList.css'

function CustomerDetailsModal({
  isOpen,
  customer,
  user,
  onClose,
  onCustomerUpdated,
  onRequestCancelService,
  onRequestBookJob,
  isQuote = false,
}) {
  const [isEditingModal, setIsEditingModal] = useState(false)
  const [modalEditData, setModalEditData] = useState({})
  const [showServices, setShowServices] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showInvoices, setShowInvoices] = useState(false)
  const [customerServices, setCustomerServices] = useState([])
  const [isAddingService, setIsAddingService] = useState(false)
  const [newServiceData, setNewServiceData] = useState({ Service: '', Price: '', Description: '' })
  const [customerHistory, setCustomerHistory] = useState([])
  const [customerInvoices, setCustomerInvoices] = useState([])
  const [invoiceActionMenuId, setInvoiceActionMenuId] = useState(null)
  const [invoiceDetailsModal, setInvoiceDetailsModal] = useState({ show: false, invoice: null, items: [] })
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [editServiceData, setEditServiceData] = useState({})
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(null)
  const [preferredDaysSelected, setPreferredDaysSelected] = useState({})
  const [goCardlessLoading, setGoCardlessLoading] = useState(false)
  const [subscriptionModal, setSubscriptionModal] = useState({
    show: false,
    mode: 'create',
    amount: String(parseFloat(customer?.GoCardlessSubscriptionAmount ?? customer?.Price ?? 0) || ''),
    date: customer?.GoCardlessSubscriptionStartDate || new Date().toISOString().slice(0, 10),
  })
  const ownerUserId = user?.ParentUserId || user?.id

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const dayShortcuts = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']

  useEffect(() => {
    if (!isOpen || !customer) return

    setIsEditingModal(false)
    setModalEditData({ ...customer })
    setShowServices(false)
    setShowHistory(false)
    setShowInvoices(false)
    setCustomerServices([])
    setCustomerHistory([])
    setCustomerInvoices([])
    setInvoiceActionMenuId(null)
    setInvoiceDetailsModal({ show: false, invoice: null, items: [] })
    setIsAddingService(false)
    setNewServiceData({ Service: '', Price: '', Description: '' })
    setEditingServiceId(null)
    setEditServiceData({})
    setServiceDropdownOpen(null)
    setSubscriptionModal({
      show: false,
      mode: 'create',
      amount: String(parseFloat(customer?.GoCardlessSubscriptionAmount ?? customer?.Price ?? 0) || ''),
      date: customer?.GoCardlessSubscriptionStartDate || new Date().toISOString().slice(0, 10),
    })
    setPreferredDaysSelected(parsePreferredDays(customer.PrefferedDays))
  }, [isOpen, customer])

  useEffect(() => {
    if (!isOpen || !customer?.id) return
    if (!(user?.GoCardlessConnected && customer?.GoCardlessMandateId)) return

    fetchCustomerInvoices(customer.id, { silent: true })
  }, [isOpen, customer?.id, user?.GoCardlessConnected, customer?.GoCardlessMandateId])

  useEffect(() => {
    if (!isOpen || !customer?.id || !user?.id || !user?.GoCardlessConnected) return
    if (customer?.GoCardlessMandateId || !customer?.GoCardlessBillingRequestId) return

    let cancelled = false
    const runAutoSync = async () => {
      try {
        const result = await syncGoCardlessBillingRequest({
          userId: user.id,
          billingRequestId: customer.GoCardlessBillingRequestId,
        })

        let finalMandateStatus = result?.mandateStatus || 'pending_submission'
        const finalMandateId = result?.mandateId || null

        if (finalMandateId) {
          try {
            const statusResult = await syncGoCardlessMandateStatus({
              userId: user.id,
              customerId: customer.id,
            })
            finalMandateStatus = statusResult?.mandateStatus || finalMandateStatus
          } catch {
            // Keep status returned by billing request sync.
          }
        }

        if (cancelled) return
        onCustomerUpdated?.({
          ...customer,
          GoCardlessMandateId: finalMandateId,
          GoCardlessMandateStatus: finalMandateStatus,
        })
      } catch (error) {
        console.error('Automatic GoCardless billing request sync failed:', error)
      }
    }

    runAutoSync()
    return () => {
      cancelled = true
    }
  }, [
    isOpen,
    customer?.id,
    customer?.GoCardlessBillingRequestId,
    customer?.GoCardlessMandateId,
    user?.id,
    user?.GoCardlessConnected,
    onCustomerUpdated,
  ])

  if (!isOpen || !customer) return null

  const fullAddress = [customer.Address, customer.Address2, customer.Address3, customer.Postcode]
    .filter((part) => part && String(part).trim())
    .join(', ') || '—'
  const normalizedMandateStatus = String(customer?.GoCardlessMandateStatus || '').trim().toLowerCase()
  const isGoCardlessLinked = Boolean(
    customer?.GoCardlessMandateId && ['submitted', 'active'].includes(normalizedMandateStatus)
  )

  const invoiceDetailsTotal = invoiceDetailsModal.items.reduce((sum, item) => sum + (parseFloat(item.Price) || 0), 0)
  const hasCustomerGoCardlessConnection = Boolean(user?.GoCardlessConnected && customer?.GoCardlessMandateId)
  const hasActiveGoCardlessSubscription = Boolean(
    customer?.GoCardlessSubscriptionId && String(customer?.GoCardlessSubscriptionStatus || '').toLowerCase() !== 'cancelled'
  )
  const subscriptionAmountValue = parseFloat(customer?.GoCardlessSubscriptionAmount)
  const subscriptionChargeDay = Number(customer?.GoCardlessSubscriptionChargeDay)
  const outstandingGoCardlessPayments = customerInvoices.filter((invoice) => {
    if (!invoice?.GoCardlessPaymentId) return false
    const status = String(invoice.GoCardlessPaymentStatus || '').trim().toLowerCase()
    return status !== 'paid_out' && status !== 'cancelled'
  })
  const totalOutstandingGoCardlessAmount = outstandingGoCardlessPayments.reduce(
    (sum, invoice) => sum + (parseFloat(invoice.totalAmount) || 0),
    0
  )
  const outstandingGoCardlessStatus = outstandingGoCardlessPayments.length > 0
    ? outstandingGoCardlessPayments[0].GoCardlessPaymentStatus
    : null

  const formatOrdinalDay = (day) => {
    const numericDay = Number(day)
    if (!Number.isFinite(numericDay) || numericDay <= 0) return null

    const mod100 = numericDay % 100
    if (mod100 >= 11 && mod100 <= 13) return `${numericDay}th`

    const mod10 = numericDay % 10
    if (mod10 === 1) return `${numericDay}st`
    if (mod10 === 2) return `${numericDay}nd`
    if (mod10 === 3) return `${numericDay}rd`
    return `${numericDay}th`
  }

  const openSubscriptionModal = (mode = 'create') => {
    setSubscriptionModal({
      show: true,
      mode,
      amount: String(parseFloat(customer?.GoCardlessSubscriptionAmount ?? customer?.Price ?? 0) || ''),
      date: customer?.GoCardlessSubscriptionStartDate || new Date().toISOString().slice(0, 10),
    })
  }

  const formatGoCardlessStatusLabel = (status, hasMandate, hasBillingRequest = false) => {
    const normalized = String(status || '').trim().toLowerCase()
    if (hasMandate && ['submitted', 'active'].includes(normalized)) return 'Linked'
    if (hasMandate && (!normalized || normalized === 'pending_submission' || normalized === 'created')) return 'Pending setup'
    if (!hasMandate && normalized === 'pending_submission') return 'Pending setup'
    if (!hasMandate && hasBillingRequest && !normalized) return 'Pending setup'
    if (!normalized) return 'Not set up'
    return normalized
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const formatPaymentStatusLabel = (status) => {
    const normalized = String(status || '').trim().toLowerCase()
    if (!normalized) return 'Pending'
    if (normalized === 'confirmed') return 'Confirmed'
    return normalized
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const isRefundablePaymentStatus = (status) => {
    const normalized = String(status || '').trim().toLowerCase()
    return normalized === 'confirmed' || normalized === 'paid'
  }

  function parsePreferredDays(preferredDaysString) {
    if (!preferredDaysString) return {}
    const days = preferredDaysString.split(',').map((d) => d.trim())
    const parsed = {}
    daysOfWeek.forEach((day) => {
      parsed[day] = days.includes(day)
    })
    return parsed
  }

  function formatPreferredDays(daysObject) {
    const selected = daysOfWeek.filter((day) => daysObject[day])
    return selected.length > 0 ? selected.join(', ') : ''
  }

  async function fetchCustomerServices(customerId) {
    try {
      const { data, error } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customerId)

      if (error) throw error
      setCustomerServices(data || [])
    } catch (error) {
      console.error('Error fetching customer services:', error.message)
    }
  }

  async function fetchCustomerHistory(customerId) {
    try {
      const { data, error } = await supabase
        .from('CustomerHistory')
        .select('*')
        .eq('CustomerID', customerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCustomerHistory(data || [])
    } catch (error) {
      console.error('Error fetching customer history:', error.message)
    }
  }

  async function fetchCustomerInvoices(customerId, options = {}) {
    const { silent = false } = options
    try {
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('CustomerInvoices')
        .select('*')
        .eq('CustomerID', customerId)
        .order('InvoiceDate', { ascending: false })

      if (invoicesError) throw invoicesError

      const invoicesList = invoicesData || []
      if (invoicesList.length === 0) {
        setCustomerInvoices([])
        return
      }

      const invoiceIds = invoicesList.map((inv) => inv.id)
      const { data: invoiceItems, error: itemsError } = await supabase
        .from('CustomerInvoiceJobs')
        .select('InvoiceID, Price')
        .in('InvoiceID', invoiceIds)

      if (itemsError) throw itemsError

      const totalsByInvoiceId = (invoiceItems || []).reduce((acc, row) => {
        const key = row.InvoiceID
        acc[key] = (acc[key] || 0) + (parseFloat(row.Price) || 0)
        return acc
      }, {})

      setCustomerInvoices(
        invoicesList.map((inv) => ({
          ...inv,
          totalAmount: totalsByInvoiceId[inv.id] || 0,
        }))
      )
    } catch (error) {
      console.error('Error fetching customer invoices:', error.message)
      if (!silent) {
        alert('Failed to load invoices for this customer.')
      }
    }
  }

  async function fetchInvoiceItems(invoiceId) {
    const { data, error } = await supabase
      .from('CustomerInvoiceJobs')
      .select('*')
      .eq('InvoiceID', invoiceId)
      .order('id', { ascending: true })

    if (error) throw error
    return data || []
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

  const buildCustomerInvoicePdfBlob = (invoiceRecord, invoiceItems) => {
    const jsPDF = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null
    if (!jsPDF) {
      throw new Error('PDF generation library not loaded')
    }

    const doc = new jsPDF()
    const lineHeight = 8
    let y = 15
    const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol
    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

    if (user.CompanyName) {
      doc.setFontSize(18)
      const pageWidth = doc.internal.pageSize.getWidth()
      const companyNameWidth = doc.getTextWidth(user.CompanyName)
      const centerX = (pageWidth - companyNameWidth) / 2
      doc.text(user.CompanyName, centerX, y)
      y += lineHeight + 4
    }

    doc.setFontSize(14)
    doc.text(customer.CustomerName || 'Customer', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    addressLines.forEach((line) => {
      doc.text(line, 15, y)
      y += lineHeight
    })

    y += 4
    doc.text(`Invoice Number: ${invoiceRecord.InvoiceID}`, 15, y)
    y += lineHeight
    doc.text(`Invoice Date: ${formatDateByCountry(invoiceRecord.InvoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight + 4

    doc.setFontSize(14)
    doc.text('For the following Services:', 15, y)
    y += lineHeight
    doc.setFontSize(12)

    let maxServiceWidth = doc.getTextWidth('Total Amount:')
    invoiceItems.forEach((item) => {
      const width = doc.getTextWidth(item.Service || '')
      if (width > maxServiceWidth) maxServiceWidth = width
    })

    const leftX = 15
    const rightX = leftX + maxServiceWidth + 10
    let total = 0
    invoiceItems.forEach((item) => {
      const price = parseFloat(item.Price) || 0
      total += price
      doc.text(item.Service || 'Service', leftX, y)
      doc.text(`${currencySymbol}${price.toFixed(2)}`, rightX, y)
      y += lineHeight
    })

    y += 4
    doc.setFontSize(14)
    doc.text('Total Amount:', leftX, y)
    doc.text(`${currencySymbol}${total.toFixed(2)}`, rightX, y)

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

  async function handleDownloadCustomerInvoice(invoiceRecord) {
    try {
      const invoiceItems = await fetchInvoiceItems(invoiceRecord.id)
      const blob = buildCustomerInvoicePdfBlob(invoiceRecord, invoiceItems)
      downloadBlob(blob, `Invoice-${invoiceRecord.InvoiceID}.pdf`)
    } catch (error) {
      console.error('Error downloading invoice:', error.message)
      alert('Failed to download invoice.')
    }
  }

  async function handleViewCustomerInvoice(invoiceRecord) {
    try {
      const invoiceItems = await fetchInvoiceItems(invoiceRecord.id)
      setInvoiceDetailsModal({ show: true, invoice: invoiceRecord, items: invoiceItems })
    } catch (error) {
      console.error('Error loading invoice details:', error.message)
      alert('Failed to load invoice details.')
    }
  }

  async function handleModalSave() {
    const updatePayload = {
      CustomerName: modalEditData.CustomerName,
      Address: modalEditData.Address,
      Address2: modalEditData.Address2,
      Address3: modalEditData.Address3,
      Postcode: modalEditData.Postcode,
      PhoneNumber: modalEditData.PhoneNumber,
      EmailAddress: modalEditData.EmailAddress,
      PrefferedContact: modalEditData.PrefferedContact || null,
      Price: modalEditData.Price,
      Weeks: modalEditData.Weeks,
      NextClean: modalEditData.NextClean,
      Outstanding: modalEditData.Outstanding,
      Route: modalEditData.Route,
      VAT: modalEditData.VAT,
      PrefferedDays: formatPreferredDays(preferredDaysSelected),
      Notes: modalEditData.Notes,
    }

    try {
      const { error } = await supabase
        .from('Customers')
        .update(updatePayload)
        .eq('id', customer.id)

      if (error) throw error

      const updatedCustomer = { ...customer, ...updatePayload }
      setModalEditData(updatedCustomer)
      setIsEditingModal(false)
      onCustomerUpdated?.(updatedCustomer)
    } catch (error) {
      console.error('Error updating customer:', error.message)
      alert('Failed to update customer. Please try again.')
    }
  }

  async function handleAddService() {
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .insert({
          CustomerID: customer.id,
          Service: newServiceData.Service,
          Price: parseFloat(newServiceData.Price) || 0,
          Description: newServiceData.Description,
        })

      if (error) throw error

      setIsAddingService(false)
      setNewServiceData({ Service: '', Price: '', Description: '' })
      fetchCustomerServices(customer.id)
    } catch (error) {
      console.error('Error adding service:', error.message)
      alert('Failed to add service. Please try again.')
    }
  }

  async function handleEditService(serviceId) {
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .update({
          Service: editServiceData.Service,
          Price: parseFloat(editServiceData.Price) || 0,
          Description: editServiceData.Description,
        })
        .eq('id', serviceId)

      if (error) throw error

      setEditingServiceId(null)
      setEditServiceData({})
      fetchCustomerServices(customer.id)
    } catch (error) {
      console.error('Error updating service:', error.message)
      alert('Failed to update service. Please try again.')
    }
  }

  async function handleDeleteService(serviceId) {
    if (!confirm('Are you sure you want to delete this service?')) return

    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .delete()
        .eq('id', serviceId)

      if (error) throw error
      fetchCustomerServices(customer.id)
    } catch (error) {
      console.error('Error deleting service:', error.message)
      alert('Failed to delete service. Please try again.')
    }
  }

  async function handleAddToNextClean(service) {
    try {
      const { data: customerData, error: fetchError } = await supabase
        .from('Customers')
        .select('NextServices, Price')
        .eq('id', customer.id)
        .single()

      if (fetchError) throw fetchError

      const currentServices = customerData.NextServices
        ? customerData.NextServices.split(',').map((s) => s.trim())
        : []

      if (currentServices.includes(service.Service)) {
        alert('Service already added')
        return
      }

      currentServices.push(service.Service)
      const newNextServices = currentServices.join(', ')
      const newPrice = (customerData.Price || 0) + (parseFloat(service.Price) || 0)

      const { error: updateError } = await supabase
        .from('Customers')
        .update({
          NextServices: newNextServices,
          Price: newPrice,
        })
        .eq('id', customer.id)

      if (updateError) throw updateError

      alert(`${service.Service} added to next clean!`)
      onCustomerUpdated?.({ ...customer, NextServices: newNextServices, Price: newPrice })
    } catch (error) {
      console.error('Error adding service to next clean:', error.message)
      alert('Failed to add service to next clean. Please try again.')
    }
  }

  const handleSetupGoCardlessMandate = async () => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }

    try {
      setGoCardlessLoading(true)
      const data = await createGoCardlessFlow({
        userId: user.id,
        customerId: customer.id,
        amount: null,
      })
      window.location.assign(data.url)
    } catch (error) {
      alert(error.message || 'Unable to start GoCardless mandate setup.')
    } finally {
      setGoCardlessLoading(false)
    }
  }

  const handleCreateGoCardlessSubscription = async () => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }
    if (!customer?.GoCardlessMandateId) {
      alert('Set up a mandate first before creating a subscription.')
      return
    }

    const amount = parseFloat(subscriptionModal.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid recurring amount greater than 0.')
      return
    }

    if (!subscriptionModal.date) {
      alert('Choose a subscription date.')
      return
    }

    const dayOfMonth = Number(subscriptionModal.date.split('-')[2])
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      alert('Choose a valid subscription date.')
      return
    }

    try {
      setGoCardlessLoading(true)
      const result = subscriptionModal.mode === 'edit'
        ? await updateGoCardlessSubscription({
          userId: ownerUserId,
          customerId: customer.id,
          amount,
          startDate: subscriptionModal.date,
          interval: 1,
          intervalUnit: 'monthly',
        })
        : await createGoCardlessSubscription({
          userId: ownerUserId,
          customerId: customer.id,
          amount,
          startDate: subscriptionModal.date,
          interval: 1,
          intervalUnit: 'monthly',
        })

      alert(`Subscription ${subscriptionModal.mode === 'edit' ? 'updated' : 'created'}. Status: ${formatPaymentStatusLabel(result.status)}`)
      onCustomerUpdated?.({
        ...customer,
        GoCardlessSubscriptionId: result.subscriptionId,
        GoCardlessSubscriptionStatus: result.status,
        GoCardlessSubscriptionAmount: amount,
        GoCardlessSubscriptionChargeDay: dayOfMonth,
        GoCardlessSubscriptionStartDate: subscriptionModal.date,
      })
      setSubscriptionModal((prev) => ({ ...prev, show: false, mode: 'create', amount: String(amount), date: subscriptionModal.date }))
    } catch (error) {
      alert(error.message || 'Unable to create subscription')
    } finally {
      setGoCardlessLoading(false)
    }
  }

  const handleCancelGoCardlessSubscription = async () => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }
    if (!customer?.GoCardlessSubscriptionId) {
      alert('No active subscription found for this customer.')
      return
    }

    const confirmed = window.confirm('Cancel this GoCardless subscription?')
    if (!confirmed) return

    try {
      setGoCardlessLoading(true)
      await cancelGoCardlessSubscription({
        userId: ownerUserId,
        customerId: customer.id,
      })

      alert('Subscription cancelled.')
      onCustomerUpdated?.({
        ...customer,
        GoCardlessSubscriptionId: null,
        GoCardlessSubscriptionStatus: 'cancelled',
        GoCardlessSubscriptionAmount: null,
        GoCardlessSubscriptionChargeDay: null,
        GoCardlessSubscriptionStartDate: null,
      })
    } catch (error) {
      alert(error.message || 'Unable to cancel subscription')
    } finally {
      setGoCardlessLoading(false)
    }
  }

  const handleRefundInvoice = async (invoice) => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }
    if (!invoice?.GoCardlessPaymentId) {
      alert('This invoice has no GoCardless payment id to refund.')
      return
    }
    if (!isRefundablePaymentStatus(invoice?.GoCardlessPaymentStatus)) {
      alert(`Payment status ${formatPaymentStatusLabel(invoice?.GoCardlessPaymentStatus)} cannot be refunded yet.`)
      return
    }

    const entered = window.prompt('Refund amount (leave blank for full amount):', String(invoice.totalAmount || ''))
    if (entered === null) return
    const amount = String(entered).trim() === '' ? null : parseFloat(entered)
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      alert('Enter a valid refund amount.')
      return
    }

    try {
      setGoCardlessLoading(true)
      await refundGoCardlessPayment({
        userId: ownerUserId,
        invoiceId: invoice.id,
        amount,
      })
      alert('Refund submitted to GoCardless.')
      await fetchCustomerInvoices(customer.id)
    } catch (error) {
      alert(error.message || 'Unable to refund payment')
    } finally {
      setGoCardlessLoading(false)
    }
  }

  const handleSyncGoCardlessStatus = async () => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }

    if (!customer?.GoCardlessMandateId) {
      alert('Customer does not have a mandate to sync.')
      return
    }

    try {
      setGoCardlessLoading(true)
      const result = await syncGoCardlessMandateStatus({
        userId: user.id,
        customerId: customer.id,
      })
      alert(`Mandate status: ${formatGoCardlessStatusLabel(result.mandateStatus, true)}`)
      // Update customer object with synced status
      const updatedCustomer = {
        ...customer,
        GoCardlessMandateStatus: result.mandateStatus,
      }
      if (onCustomerUpdated) {
        onCustomerUpdated(updatedCustomer)
      }
    } catch (error) {
      alert(error.message || 'Unable to sync mandate status.')
    } finally {
      setGoCardlessLoading(false)
    }
  }

  const handleSyncGoCardlessBillingRequest = async () => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }

    const billingRequestId = customer?.GoCardlessBillingRequestId
    if (!billingRequestId) {
      alert('Customer does not have a billing request ID to sync.')
      return
    }

    try {
      setGoCardlessLoading(true)
      const result = await syncGoCardlessBillingRequest({
        userId: user.id,
        billingRequestId: billingRequestId,
      })

      let finalMandateStatus = result.mandateStatus || 'pending_submission'
      let finalMandateId = result.mandateId

      // If we got a mandate ID, do a direct mandate status check to get the real live status
      if (result.mandateId) {
        try {
          const statusResult = await syncGoCardlessMandateStatus({
            userId: user.id,
            customerId: customer.id,
          })
          finalMandateStatus = statusResult.mandateStatus || finalMandateStatus
        } catch {
          // use status from billing request sync as fallback
        }
      }

      alert(`Sync complete. Mandate status: ${formatGoCardlessStatusLabel(finalMandateStatus, Boolean(finalMandateId))}`)
      const updatedCustomer = {
        ...customer,
        GoCardlessMandateId: finalMandateId,
        GoCardlessMandateStatus: finalMandateStatus,
      }
      if (onCustomerUpdated) {
        onCustomerUpdated(updatedCustomer)
      }
    } catch (error) {
      alert(error.message || 'Unable to sync billing request.')
    } finally {
      setGoCardlessLoading(false)
    }
  }

  const closeModal = () => {
    setIsEditingModal(false)
    setShowServices(false)
    setShowHistory(false)
    setShowInvoices(false)
    setInvoiceActionMenuId(null)
    setInvoiceDetailsModal({ show: false, invoice: null, items: [] })
    onClose?.()
  }

  return (
    <>
      <div className="modal-overlay customer-details-overlay" onClick={closeModal}>
        <div
          className="modal-content customer-modal-main"
          style={{
            width: 'min(96vw, 820px)',
            maxWidth: '820px',
            maxHeight: '88vh',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '1rem 1.25rem',
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="modal-close" onClick={closeModal}>×</button>
          <h3>{showHistory ? 'Customer History' : showServices ? 'Customer Services' : showInvoices ? 'Customer Invoices' : 'Customer Details'}</h3>

          <div
            className="modal-actions customer-modal-actions"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
              paddingBottom: '0.9rem',
              borderBottom: '1px solid rgba(21, 101, 192, 0.2)',
            }}
          >
            {isEditingModal ? (
              <>
                <button className="modal-save-btn customer-modal-action-btn" style={{ minWidth: '88px' }} onClick={handleModalSave}>Save</button>
                <button className="modal-cancel-btn customer-modal-action-btn" style={{ minWidth: '88px' }} onClick={() => setIsEditingModal(false)}>Cancel</button>
              </>
            ) : (
              <>
                {!showServices && !showHistory && !showInvoices && (
                  <button
                    className="modal-edit-btn customer-modal-action-btn"
                    style={{ minWidth: '88px' }}
                    onClick={() => {
                      setIsEditingModal(true)
                      setModalEditData({ ...customer })
                      setPreferredDaysSelected(parsePreferredDays(customer.PrefferedDays))
                    }}
                  >
                    Edit
                  </button>
                )}
                <button
                  className="modal-services-btn customer-modal-action-btn"
                  style={{ minWidth: '96px' }}
                  onClick={() => {
                    setShowServices(!showServices)
                    setShowHistory(false)
                    setShowInvoices(false)
                    setInvoiceActionMenuId(null)
                    if (!showServices) fetchCustomerServices(customer.id)
                  }}
                >
                  {showServices ? 'Customer Details' : 'Services'}
                </button>
                <button
                  className="modal-history-btn customer-modal-action-btn"
                  style={{ minWidth: '96px' }}
                  onClick={() => {
                    setShowHistory(!showHistory)
                    setShowServices(false)
                    setShowInvoices(false)
                    setInvoiceActionMenuId(null)
                    if (!showHistory) fetchCustomerHistory(customer.id)
                  }}
                >
                  {showHistory ? 'Customer Details' : 'History'}
                </button>
                <button
                  className="modal-history-btn customer-modal-action-btn"
                  style={{ minWidth: '96px' }}
                  onClick={() => {
                    setShowInvoices(!showInvoices)
                    setShowServices(false)
                    setShowHistory(false)
                    setInvoiceActionMenuId(null)
                    if (!showInvoices) fetchCustomerInvoices(customer.id)
                  }}
                >
                  {showInvoices ? 'Customer Details' : 'Invoices'}
                </button>
              </>
            )}
          </div>

          {!showServices && !showHistory && !showInvoices ? (
            isEditingModal ? (
              <div className="details-grid-edit customer-edit-form">
                <div className="full-width customer-edit-field">
                  <label className="customer-edit-label">Name</label>
                  <input type="text" value={modalEditData.CustomerName || ''} onChange={(e) => setModalEditData({ ...modalEditData, CustomerName: e.target.value })} className="modal-input" />
                </div>
                <div className="full-width address-section customer-edit-field">
                  <label className="customer-edit-label">Address</label>
                  <input type="text" value={modalEditData.Address || ''} onChange={(e) => setModalEditData({ ...modalEditData, Address: e.target.value })} className="modal-input" placeholder="Address Line 1" />
                  <input type="text" value={modalEditData.Address2 || ''} onChange={(e) => setModalEditData({ ...modalEditData, Address2: e.target.value })} className="modal-input" placeholder="Address Line 2" />
                  <input type="text" value={modalEditData.Address3 || ''} onChange={(e) => setModalEditData({ ...modalEditData, Address3: e.target.value })} className="modal-input" placeholder="Address Line 3" />
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Postcode</label>
                  <input type="text" value={modalEditData.Postcode || ''} onChange={(e) => setModalEditData({ ...modalEditData, Postcode: e.target.value })} className="modal-input" />
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Phone</label>
                  <input type="tel" value={modalEditData.PhoneNumber || ''} onChange={(e) => setModalEditData({ ...modalEditData, PhoneNumber: e.target.value })} className="modal-input" />
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Email</label>
                  <input type="email" value={modalEditData.EmailAddress || ''} onChange={(e) => setModalEditData({ ...modalEditData, EmailAddress: e.target.value })} className="modal-input" />
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Preferred Contact</label>
                  <select value={modalEditData.PrefferedContact || ''} onChange={(e) => setModalEditData({ ...modalEditData, PrefferedContact: e.target.value })} className="modal-input">
                    <option value="">Select preferred contact</option>
                    <option value="E-Mail">E-Mail</option>
                    <option value="Text">Text</option>
                    <option value="Phone">Phone</option>
                  </select>
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Route</label>
                  <input type="text" value={modalEditData.Route || ''} onChange={(e) => setModalEditData({ ...modalEditData, Route: e.target.value })} className="modal-input" />
                </div>
                <div className="inline-fields full-width">
                  <div className="inline-field customer-edit-field">
                    <label className="customer-edit-label">Price</label>
                    <input type="number" value={modalEditData.Price ?? ''} onChange={(e) => setModalEditData({ ...modalEditData, Price: e.target.value })} className="modal-input" />
                  </div>
                  <div className="inline-field customer-edit-field">
                    <label className="customer-edit-label">Weeks</label>
                    <input type="number" value={modalEditData.Weeks ?? ''} onChange={(e) => setModalEditData({ ...modalEditData, Weeks: e.target.value })} className="modal-input" />
                  </div>
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Next Clean</label>
                  <input type="date" value={modalEditData.NextClean || ''} onChange={(e) => setModalEditData({ ...modalEditData, NextClean: e.target.value })} className="modal-input" />
                </div>
                <div className="customer-edit-field">
                  <label className="customer-edit-label">Outstanding</label>
                  <input type="number" value={modalEditData.Outstanding ?? ''} onChange={(e) => setModalEditData({ ...modalEditData, Outstanding: e.target.value })} className="modal-input" />
                </div>
                <div className="customer-edit-field customer-edit-checkbox full-width">
                  <label className="customer-edit-label">VAT Registered</label>
                  <input type="checkbox" checked={Boolean(modalEditData.VAT)} onChange={(e) => setModalEditData({ ...modalEditData, VAT: e.target.checked })} />
                </div>
                <div className="full-width customer-edit-field">
                  <label className="customer-edit-label">Preferred Days</label>
                  <div className="days-checkboxes">
                    {daysOfWeek.map((day, index) => (
                      <label key={day} className="day-checkbox-item">
                        <input
                          type="checkbox"
                          checked={preferredDaysSelected[day] || false}
                          onChange={(e) => setPreferredDaysSelected({ ...preferredDaysSelected, [day]: e.target.checked })}
                          style={{ cursor: 'pointer' }}
                        />
                        {dayShortcuts[index]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="full-width customer-edit-field">
                  <label className="customer-edit-label">Notes</label>
                  <textarea
                    value={modalEditData.Notes || ''}
                    onChange={(e) => {
                      setModalEditData({ ...modalEditData, Notes: e.target.value })
                      e.target.style.height = 'auto'
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
                    }}
                    className="modal-input"
                    style={{ minHeight: '40px', maxHeight: '200px', overflow: 'hidden', resize: 'none' }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="details-grid">
                  <div><strong>Name:</strong> {customer.CustomerName}</div>
                  <div><strong>Address:</strong> {fullAddress}</div>
                  <div><strong>Phone:</strong> {customer.PhoneNumber || '—'}</div>
                  <div><strong>Email:</strong> {customer.EmailAddress || '—'}</div>
                  <div><strong>Preferred Contact:</strong> {customer.PrefferedContact || '—'}</div>
                  <div><strong>Price:</strong> {formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Weeks:</strong> {customer.Weeks}</div>
                  <div><strong>{isQuote ? 'Quotation Booked:' : 'Next Clean:'}</strong> {formatDateByCountry(customer.NextClean, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Outstanding:</strong> {formatCurrency(customer.Outstanding, user.SettingsCountry || 'United Kingdom')}
                    {outstandingGoCardlessPayments.length > 0 && (
                      <>
                        {totalOutstandingGoCardlessAmount !== parseFloat(customer.Outstanding) && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.9rem', color: '#555' }}>
                            (GoCardless: {formatCurrency(totalOutstandingGoCardlessAmount, user.SettingsCountry || 'United Kingdom')} - {formatPaymentStatusLabel(outstandingGoCardlessStatus)})
                          </div>
                        )}
                        {totalOutstandingGoCardlessAmount === parseFloat(customer.Outstanding) && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.9rem', color: '#555' }}>
                            ({formatPaymentStatusLabel(outstandingGoCardlessStatus)})
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div><strong>Route:</strong> {customer.Route || '—'}</div>
                  <div><strong>VAT Registered:</strong> {customer.VAT ? 'Yes' : 'No'}</div>
                  <div>
                    <strong>GoCardless:</strong> {formatGoCardlessStatusLabel(customer.GoCardlessMandateStatus, Boolean(customer.GoCardlessMandateId), Boolean(customer.GoCardlessBillingRequestId))}
                    {hasActiveGoCardlessSubscription && Number.isFinite(subscriptionAmountValue) && Number.isFinite(subscriptionChargeDay) && (
                      <> {`Subscription for ${formatCurrency(subscriptionAmountValue, user.SettingsCountry || 'United Kingdom')}, taken on the ${formatOrdinalDay(subscriptionChargeDay)} of each month`}</>
                    )}
                    {hasCustomerGoCardlessConnection && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>GoCardless Payments:</strong>
                        {outstandingGoCardlessPayments.length > 0 ? (
                          <table className="services-table" style={{ marginTop: '0.4rem' }}>
                            <thead>
                              <tr>
                                <th>Invoice</th>
                                <th>Amount</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {outstandingGoCardlessPayments.map((invoice) => (
                                <tr key={invoice.id}>
                                  <td>{invoice.InvoiceID || '—'}</td>
                                  <td>{formatCurrency(invoice.totalAmount || 0, user.SettingsCountry || 'United Kingdom')}</td>
                                  <td>{formatPaymentStatusLabel(invoice.GoCardlessPaymentStatus)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ marginTop: '0.3rem' }}>No outstanding GoCardless payments.</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="full-width"><strong>Preferred Days:</strong> {customer.PrefferedDays || '—'}</div>
                  <div className="full-width"><strong>Notes:</strong> <div className="notes-display">{customer.Notes || '—'}</div></div>
                </div>

                <button
                  className="modal-save-btn customer-modal-action-btn"
                  onClick={handleSetupGoCardlessMandate}
                  disabled={goCardlessLoading}
                  style={{ marginTop: '0.85rem', minWidth: '180px' }}
                >
                  {goCardlessLoading ? 'Opening GoCardless...' : isGoCardlessLinked ? 'Refresh Direct Debit Setup' : 'Link to GoCardless'}
                </button>

                {customer.GoCardlessBillingRequestId && !customer.GoCardlessMandateId && (
                  <button
                    className="modal-save-btn customer-modal-action-btn"
                    onClick={handleSyncGoCardlessBillingRequest}
                    disabled={goCardlessLoading}
                    style={{ marginTop: '0.85rem', minWidth: '180px', marginLeft: '0.5rem' }}
                    title="Sync billing request to extract mandate details"
                  >
                    {goCardlessLoading ? 'Syncing...' : 'Sync Billing Request'}
                  </button>
                )}

                {customer.GoCardlessMandateId && (
                  <button
                    className="modal-save-btn customer-modal-action-btn"
                    onClick={handleSyncGoCardlessStatus}
                    disabled={goCardlessLoading}
                    style={{ marginTop: '0.85rem', minWidth: '180px', marginLeft: '0.5rem' }}
                    title="Check GoCardless for latest mandate status"
                  >
                    {goCardlessLoading ? 'Syncing...' : 'Sync Mandate Status'}
                  </button>
                )}

                {onRequestCancelService && (
                  <button
                    className="cancel-service-btn"
                    onClick={onRequestCancelService}
                    title={isQuote ? 'Cancel this quote' : "Cancel this customer's service"}
                  >
                    {isQuote ? 'Cancel Quote' : 'Cancel Service'}
                  </button>
                )}

                {isQuote && onRequestBookJob && (
                  <button className="book-job-btn" onClick={onRequestBookJob} title="Convert quote to job">Book Job</button>
                )}
                {user?.GoCardlessConnected && customer?.GoCardlessMandateId && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', alignItems: 'center' }}>
                    {hasActiveGoCardlessSubscription ? (
                      <>
                        <button
                          className="book-job-btn"
                          onClick={handleCancelGoCardlessSubscription}
                          disabled={goCardlessLoading}
                          title="Cancel the recurring GoCardless subscription"
                          style={{ marginTop: 0, flex: 1 }}
                        >
                          {goCardlessLoading ? 'Please wait...' : 'Cancel Subscription'}
                        </button>
                        <button
                          className="book-job-btn"
                          onClick={() => openSubscriptionModal('edit')}
                          disabled={goCardlessLoading}
                          title="Edit the recurring GoCardless subscription"
                          style={{ marginTop: 0, flex: 1 }}
                        >
                          {goCardlessLoading ? 'Please wait...' : 'Edit GoCardless'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="book-job-btn"
                        onClick={() => openSubscriptionModal('create')}
                        disabled={goCardlessLoading}
                        title="Create a recurring GoCardless subscription"
                        style={{ marginTop: 0, flex: 1 }}
                      >
                        {goCardlessLoading ? 'Please wait...' : 'Set up Direct Debit'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )
          ) : showHistory ? (
            <div className="history-list">
              {customerHistory.length > 0 ? (
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerHistory.map((entry, index) => (
                      <tr key={index}>
                        <td>{formatDateByCountry(entry.created_at, user.SettingsCountry || 'United Kingdom')}</td>
                        <td>{entry.Message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No history found for this customer.</p>
              )}
            </div>
          ) : showInvoices ? (
            <div className="services-list">
              {customerInvoices.length > 0 ? (
                <table className="services-table">
                  <thead>
                    <tr>
                      <th>Invoice Number</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Payment Status</th>
                      <th>Refund Status</th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.InvoiceID || '—'}</td>
                        <td>{formatDateByCountry(invoice.InvoiceDate, user.SettingsCountry || 'United Kingdom')}</td>
                        <td>{formatCurrency(invoice.totalAmount || 0, user.SettingsCountry || 'United Kingdom')}</td>
                        <td>{formatPaymentStatusLabel(invoice.GoCardlessPaymentStatus)}</td>
                        <td>{formatPaymentStatusLabel(invoice.GoCardlessRefundStatus)}</td>
                        <td className="actions-col" style={{ position: 'relative' }}>
                          <button
                            className="service-actions-btn"
                            onClick={() => setInvoiceActionMenuId(invoiceActionMenuId === invoice.id ? null : invoice.id)}
                            title="Invoice actions"
                          >
                            ⋮
                          </button>
                          {invoiceActionMenuId === invoice.id && (
                            <div className="service-actions-dropdown">
                              <button onClick={async () => { await handleDownloadCustomerInvoice(invoice); setInvoiceActionMenuId(null) }}>Download</button>
                              <button onClick={async () => { await handleViewCustomerInvoice(invoice); setInvoiceActionMenuId(null) }}>View Invoice</button>
                              {invoice.GoCardlessPaymentId && isRefundablePaymentStatus(invoice.GoCardlessPaymentStatus) && (
                                <button onClick={async () => { await handleRefundInvoice(invoice); setInvoiceActionMenuId(null) }}>Refund</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No invoices found for this customer.</p>
              )}
            </div>
          ) : (
            <div className="services-list">
              {!isAddingService ? (
                <button className="add-service-btn" onClick={() => setIsAddingService(true)}>+ Add Service</button>
              ) : (
                <div className="new-service-form">
                  <div className="service-form-row">
                    <div>
                      <label><strong>Service:</strong></label>
                      <input
                        type="text"
                        value={newServiceData.Service}
                        onChange={(e) => setNewServiceData({ ...newServiceData, Service: e.target.value })}
                        className="modal-input"
                        placeholder="e.g., Windows, Gutters"
                      />
                    </div>
                    <div>
                      <label><strong>Price:</strong></label>
                      <input
                        type="number"
                        value={newServiceData.Price}
                        onChange={(e) => setNewServiceData({ ...newServiceData, Price: e.target.value })}
                        className="modal-input"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label><strong>Description:</strong></label>
                      <input
                        type="text"
                        value={newServiceData.Description}
                        onChange={(e) => setNewServiceData({ ...newServiceData, Description: e.target.value })}
                        className="modal-input"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="service-form-actions">
                    <button className="modal-save-btn" onClick={handleAddService}>Save</button>
                    <button className="modal-cancel-btn" onClick={() => { setIsAddingService(false); setNewServiceData({ Service: '', Price: '', Description: '' }) }}>Cancel</button>
                  </div>
                </div>
              )}

              {customerServices.length > 0 && (
                <table className="services-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Price</th>
                      <th>Description</th>
                      <th className="actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerServices.map((service) => (
                      editingServiceId === service.id ? (
                        <tr key={service.id} className="editing-row">
                          <td><input type="text" value={editServiceData.Service || ''} onChange={(e) => setEditServiceData({ ...editServiceData, Service: e.target.value })} className="modal-input" /></td>
                          <td><input type="number" value={editServiceData.Price ?? ''} onChange={(e) => setEditServiceData({ ...editServiceData, Price: e.target.value })} className="modal-input" /></td>
                          <td><input type="text" value={editServiceData.Description || ''} onChange={(e) => setEditServiceData({ ...editServiceData, Description: e.target.value })} className="modal-input" /></td>
                          <td>
                            <button className="service-save-btn" onClick={() => handleEditService(service.id)}>✓</button>
                            <button className="service-cancel-btn" onClick={() => { setEditingServiceId(null); setEditServiceData({}) }}>✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={service.id}>
                          <td>{service.Service}</td>
                          <td>{formatCurrency(service.Price, user.SettingsCountry || 'United Kingdom')}</td>
                          <td>{service.Description || '—'}</td>
                          <td className="actions-col">
                            <button className="service-actions-btn" onClick={() => setServiceDropdownOpen(serviceDropdownOpen === service.id ? null : service.id)}>⋮</button>
                            {serviceDropdownOpen === service.id && (
                              <div className="service-actions-dropdown">
                                <button onClick={() => { setEditingServiceId(service.id); setEditServiceData({ ...service }); setServiceDropdownOpen(null) }}>Edit</button>
                                <button onClick={() => { handleDeleteService(service.id); setServiceDropdownOpen(null) }}>Delete</button>
                                <button onClick={() => { handleAddToNextClean(service); setServiceDropdownOpen(null) }}>Add to Next Clean</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}

              {customerServices.length === 0 && !isAddingService && (
                <p>No services found for this customer.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {invoiceDetailsModal.show && invoiceDetailsModal.invoice && (
        <div className="modal-overlay" onClick={() => setInvoiceDetailsModal({ show: false, invoice: null, items: [] })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setInvoiceDetailsModal({ show: false, invoice: null, items: [] })}>×</button>
            <h3>Invoice {invoiceDetailsModal.invoice.InvoiceID}</h3>
            <div style={{ marginBottom: '12px' }}>
              <div><strong>Date:</strong> {formatDateByCountry(invoiceDetailsModal.invoice.InvoiceDate, user.SettingsCountry || 'United Kingdom')}</div>
              <div><strong>Customer:</strong> {customer.CustomerName || '—'}</div>
            </div>

            {invoiceDetailsModal.items.length > 0 ? (
              <table className="services-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDetailsModal.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.Service || '—'}</td>
                      <td>{formatCurrency(item.Price || 0, user.SettingsCountry || 'United Kingdom')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No line items found for this invoice.</p>
            )}

            <div className="invoice-total-row" style={{ marginTop: '14px' }}>
              <strong>Total:</strong> {formatCurrency(invoiceDetailsTotal, user.SettingsCountry || 'United Kingdom')}
            </div>

            <div className="modal-buttons">
              <button className="modal-ok-btn" onClick={async () => { await handleDownloadCustomerInvoice(invoiceDetailsModal.invoice) }}>Download</button>
              <button className="modal-cancel-btn" onClick={() => setInvoiceDetailsModal({ show: false, invoice: null, items: [] })}>Close</button>
            </div>
          </div>
        </div>
      )}

      {subscriptionModal.show && (
        <div className="modal-overlay" onClick={() => setSubscriptionModal((prev) => ({ ...prev, show: false }))}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSubscriptionModal((prev) => ({ ...prev, show: false }))}>×</button>
            <h3>{subscriptionModal.mode === 'edit' ? 'Edit GoCardless Subscription' : 'Set up Direct Debit via GoCardless'}</h3>
            <p style={{ marginBottom: '0.75rem' }}>
              {subscriptionModal.mode === 'edit'
                ? 'Update the monthly recurring payment details for this mandate.'
                : 'This creates a monthly recurring payment using the existing mandate.'}
            </p>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Monthly amount</label>
            <input
              type="number"
              step="0.01"
              value={subscriptionModal.amount}
              onChange={(e) => setSubscriptionModal((prev) => ({ ...prev, amount: e.target.value }))}
              className="modal-input"
            />
            <label style={{ display: 'block', marginTop: '0.75rem', marginBottom: '0.25rem' }}>First collection date</label>
            <input
              type="date"
              value={subscriptionModal.date}
              onChange={(e) => setSubscriptionModal((prev) => ({ ...prev, date: e.target.value }))}
              className="modal-input"
            />
            {subscriptionModal.date && (() => {
              const selectedDay = Number(subscriptionModal.date.split('-')[2])
              const ordinalDay = formatOrdinalDay(selectedDay)
              if (!ordinalDay) return null

              return (
                <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', color: '#333' }}>
                  Subsequent payments will be taken on the {ordinalDay} of every month.
                </p>
              )
            })()}
            <div className="modal-buttons" style={{ marginTop: '1rem' }}>
              <button className="modal-ok-btn" onClick={handleCreateGoCardlessSubscription} disabled={goCardlessLoading}>
                {goCardlessLoading ? (subscriptionModal.mode === 'edit' ? 'Updating...' : 'Creating...') : (subscriptionModal.mode === 'edit' ? 'Update' : 'Create Subscription')}
              </button>
              <button className="modal-cancel-btn" onClick={() => setSubscriptionModal((prev) => ({ ...prev, show: false }))}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default CustomerDetailsModal
