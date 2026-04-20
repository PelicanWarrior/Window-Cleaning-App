import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatDateByCountry, formatCurrency, getCurrencyConfig } from '../lib/format'
import { openMessageViaMethod } from '../lib/contactDelivery'
import { createInvoiceAttachment } from '../lib/invoiceAttachment'
import SendMessageMethodModal from './SendMessageMethodModal'
import './Quotes.css'

function Quotes({ user }) {
  const createEmptyBookJobModal = () => ({
    show: false,
    customer: null,
    selectedDate: '',
    services: [],
    selectedServices: [],
    routeSelection: '',
    newRoute: '',
    oneOff: false,
    weeks: 4
  })

  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [isEditingModal, setIsEditingModal] = useState(false)
  const [modalEditData, setModalEditData] = useState({})
  const [showServices, setShowServices] = useState(false)
  const [customerServices, setCustomerServices] = useState([])
  const [isAddingService, setIsAddingService] = useState(false)
  const [newServiceData, setNewServiceData] = useState({ Service: '', Price: '', Description: '' })
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(null)
  const serviceDropdownRefs = useRef({})
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [editServiceData, setEditServiceData] = useState({})
  const [showHistory, setShowHistory] = useState(false)
  const [customerHistory, setCustomerHistory] = useState([])
  const [bookJobModal, setBookJobModal] = useState(createEmptyBookJobModal())
  const [bookJobServiceData, setBookJobServiceData] = useState({ Service: '', Price: '', Description: '' })
  const [bookJobSavingService, setBookJobSavingService] = useState(false)
  const [routeOptions, setRouteOptions] = useState([])
  const [messages, setMessages] = useState([])
  const [quoteBookedInLetter, setQuoteBookedInLetter] = useState('')
  const [quoteTurnedIntoJobLetter, setQuoteTurnedIntoJobLetter] = useState('')
  const [quoteTurnedIntoJobIncludeBookedServices, setQuoteTurnedIntoJobIncludeBookedServices] = useState(false)
  const [messageFooter, setMessageFooter] = useState('')
  const [messageFooterIncludeEmployee, setMessageFooterIncludeEmployee] = useState(false)
  const [sendMessageModal, setSendMessageModal] = useState({ show: false, customer: null, subject: '', body: '', historyMessage: '' })

  useEffect(() => {
    if (!serviceDropdownOpen) return

    const dropdownElement = serviceDropdownRefs.current[serviceDropdownOpen]
    if (!dropdownElement) return

    requestAnimationFrame(() => {
      dropdownElement.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' })
    })
  }, [serviceDropdownOpen])
  const [quoteData, setQuoteData] = useState({
    CustomerName: '',
    Address: '',
    Address2: '',
    Address3: '',
    Postcode: '',
    PhoneNumber: '',
    EmailAddress: '',
    PrefferedContact: '',
    Notes: '',
    QuoteDate: ''
  })

  useEffect(() => {
    if (user?.id) fetchQuotes()
  }, [user])

  useEffect(() => {
    if (user?.id) fetchRouteOptions()
  }, [user])

  useEffect(() => {
    if (user?.id) fetchMessagingDefaults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const fetchRouteOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('Customers')
        .select('Route')
        .eq('UserId', user.id)

      if (error) throw error

      const routes = [...new Set((data || [])
        .map((row) => String(row.Route || '').trim())
        .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

      setRouteOptions(routes)
    } catch (err) {
      console.error('Error fetching routes:', err.message)
    }
  }

  const fetchQuotes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('Customers')
        .select('id, CustomerName, Address, Address2, Address3, Postcode, PhoneNumber, EmailAddress, PrefferedContact, Notes, NextClean, Price, Weeks, Route, Outstanding')
        .eq('UserId', user.id)
        .eq('Quote', true)
        .order('CustomerName', { ascending: true })

      if (error) throw error
      setQuotes(data || [])
    } catch (err) {
      console.error('Error fetching quotes:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchMessagingDefaults = async () => {
    const ownerUserId = user?.ParentUserId || user?.id
    if (!ownerUserId) return

    try {
      const { data: messagesData, error: messagesError } = await supabase
        .from('Messages')
        .select('*')
        .eq('UserId', ownerUserId)
        .order('MessageTitle', { ascending: true })

      if (messagesError) throw messagesError
      setMessages(messagesData || [])

      // Try new columns first. If migration is not yet applied, fall back gracefully.
      const { data: userData, error: userError } = await supabase
        .from('Users')
        .select('QuoteBookedInLetter, QuoteTurnedIntoJobLetter, QuoteTurnedIntoJobIncludeBookedServices, MessageFooter, MessageFooterIncludeEmployee')
        .eq('id', ownerUserId)
        .single()

      if (userError) {
        const { data: fallbackUserData, error: fallbackUserError } = await supabase
          .from('Users')
          .select('MessageFooter, MessageFooterIncludeEmployee')
          .eq('id', ownerUserId)
          .single()

        if (fallbackUserError) throw fallbackUserError

        setQuoteBookedInLetter('')
        setQuoteTurnedIntoJobLetter('')
        setQuoteTurnedIntoJobIncludeBookedServices(false)
        setMessageFooter(fallbackUserData?.MessageFooter || '')
        setMessageFooterIncludeEmployee(Boolean(fallbackUserData?.MessageFooterIncludeEmployee))
        return
      }

      setQuoteBookedInLetter(userData?.QuoteBookedInLetter || '')
      setQuoteTurnedIntoJobLetter(userData?.QuoteTurnedIntoJobLetter || '')
      setQuoteTurnedIntoJobIncludeBookedServices(Boolean(userData?.QuoteTurnedIntoJobIncludeBookedServices))
      setMessageFooter(userData?.MessageFooter || '')
      setMessageFooterIncludeEmployee(Boolean(userData?.MessageFooterIncludeEmployee))
    } catch (err) {
      console.error('Error fetching quote message defaults:', err.message)
    }
  }

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 11 && digits.startsWith('0')) return `44${digits.slice(1)}`
    return digits
  }

  const getFormalCustomerName = (rawName) => {
    const name = (rawName || '').trim()
    if (!name) return 'Customer'

    const connectorMatch = name.match(/^(\S+)\s*(&|and)\s+(\S+)/i)
    if (connectorMatch) {
      const [, first, connector, second] = connectorMatch
      return `${first} ${connector.trim()} ${second}`
    }

    const firstToken = name.split(/\s+/)[0]
    return firstToken || 'Customer'
  }

  const formatDateShort = (dateValue) => {
    if (!dateValue) return ''
    const source = String(dateValue).includes('T') ? String(dateValue).split('T')[0] : String(dateValue)
    const match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return ''

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  const buildBookedServicesTableLines = (services = []) => {
    if (!services.length) return []

    const rows = services.map((service) => ({
      name: String(service?.Service || '').trim() || 'Service',
      price: formatCurrency(parseFloat(service?.Price) || 0, user.SettingsCountry || 'United Kingdom')
    }))

    const nameWidth = Math.max(...rows.map((row) => row.name.length))
    const priceWidth = Math.max(...rows.map((row) => row.price.length))

    return rows.map((row) => `${row.name.padEnd(nameWidth)} | ${row.price.padStart(priceWidth)}`)
  }

  const findMessageTemplate = (preferredId, fallbackTitles = []) => {
    if (!messages.length) return null

    if (preferredId) {
      const preferred = messages.find((m) => String(m.id) === String(preferredId))
      if (preferred) return preferred
    }

    const normalizedTitles = fallbackTitles
      .map((title) => String(title || '').trim().toLowerCase())
      .filter(Boolean)

    if (!normalizedTitles.length) return null

    return messages.find((m) => normalizedTitles.includes(String(m.MessageTitle || '').trim().toLowerCase())) || null
  }

  const buildTemplateMessageBody = (customer, messageTemplate, options = {}) => {
    const {
      includePriceAmount = null,
      quoteDateValue = '',
      jobDateValue = '',
      jobIsOneOff = false,
      recurrenceWeeks = null,
      includeBookedServices = false,
      bookedServices = [],
      totalPrice = null
    } = options

    const formalName = getFormalCustomerName(customer?.CustomerName)
    const bodyParts = [`Dear ${formalName}`]

    if (messageTemplate?.Message) {
      let messageContent = messageTemplate.Message

      if (messageTemplate.IncludePrice) {
        const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
        const amount = includePriceAmount == null
          ? (parseFloat(customer?.Outstanding) || 0)
          : (parseFloat(includePriceAmount) || 0)
        if (messageContent.includes(symbol)) {
          messageContent = messageContent.replaceAll(symbol, `${symbol}${amount}`)
        }
      }

      bodyParts.push(messageContent)
    }

    if (includeBookedServices && bookedServices.length > 0) {
      bodyParts.push('Booked Services:')
      const tableLines = buildBookedServicesTableLines(bookedServices)
      tableLines.forEach((line) => bodyParts.push(line))
      const computedTotal = totalPrice == null
        ? bookedServices.reduce((sum, service) => sum + (parseFloat(service?.Price) || 0), 0)
        : totalPrice
      bodyParts.push(`TOTAL: ${formatCurrency(computedTotal, user.SettingsCountry || 'United Kingdom')}`)
    }

    const quoteDateText = formatDateShort(quoteDateValue)
    if (quoteDateText) {
      bodyParts.push(`The quote is booked in for ${quoteDateText}`)
    }

    const jobDateText = formatDateShort(jobDateValue)
    if (jobDateText) {
      let bookingPhrase = `The job is booked for ${jobDateText}`
      if (jobIsOneOff) {
        bookingPhrase += ' and is a one off clean'
      } else {
        const weeksValue = parseInt(recurrenceWeeks, 10)
        if (Number.isFinite(weeksValue) && weeksValue > 0) {
          bookingPhrase += ` and will continue every ${weeksValue} weeks`
        }
      }
      bodyParts.push(bookingPhrase)
    }

    if (messageFooterIncludeEmployee && user?.ParentUserId && user?.UserName) bodyParts.push(user.UserName)
    if (messageFooter) bodyParts.push(messageFooter)

    return bodyParts.join('\n')
  }

  const createCustomerHistoryEntry = async (customerId, historyMessage) => {
    try {
      await supabase.from('CustomerHistory').insert({ CustomerID: customerId, Message: historyMessage })
    } catch (historyError) {
      console.error('Error writing WhatsApp message history:', historyError.message)
    }
  }

  const buildQuoteBookedInFallbackBody = (customer, quoteDateValue = '') => {
    const formalName = getFormalCustomerName(customer?.CustomerName)
    const bodyParts = [`Dear ${formalName}`]
    const quoteDateText = formatDateShort(quoteDateValue)
    if (quoteDateText) {
      bodyParts.push(`The quote is booked in for ${quoteDateText}`)
    } else {
      bodyParts.push('The quote is booked in.')
    }

    if (messageFooterIncludeEmployee && user?.ParentUserId && user?.UserName) bodyParts.push(user.UserName)
    if (messageFooter) bodyParts.push(messageFooter)

    return bodyParts.join('\n')
  }

  const closeSendMessageModal = () => {
    setSendMessageModal({ show: false, customer: null, subject: '', body: '', historyMessage: '' })
  }

  const openSendMethodModal = ({ customer, subject, body, historyMessage }) => {
    setSendMessageModal({
      show: true,
      customer,
      subject: subject || 'Message',
      body: body || '',
      historyMessage: historyMessage || 'Message sent'
    })
  }

  const handleSendMessageModalConfirm = async (method, selectedInvoice) => {
    let attachment = null
    if (selectedInvoice) {
      const attachmentResult = await createInvoiceAttachment({
        invoice: selectedInvoice,
        customer: sendMessageModal.customer,
        user
      })

      if (!attachmentResult.ok) {
        alert(attachmentResult.error || 'Unable to prepare invoice attachment.')
        return
      }

      attachment = {
        blob: attachmentResult.blob,
        filename: attachmentResult.filename
      }
    }

    const result = await openMessageViaMethod({
      method,
      customer: sendMessageModal.customer,
      subject: sendMessageModal.subject,
      body: sendMessageModal.body,
      attachment
    })

    if (!result.ok) {
      alert(result.error)
      return
    }

    if (sendMessageModal.customer?.id) {
      await createCustomerHistoryEntry(sendMessageModal.customer.id, `${sendMessageModal.historyMessage} via ${method}`)
    }

    closeSendMessageModal()
  }

  const closeBookJobModal = () => {
    setBookJobModal(createEmptyBookJobModal())
    setBookJobServiceData({ Service: '', Price: '', Description: '' })
    setBookJobSavingService(false)
  }

  const handleBookJobAddService = async () => {
    if (!bookJobModal.customer?.id) return

    const serviceName = String(bookJobServiceData.Service || '').trim()
    if (!serviceName) {
      alert('Please enter a service name')
      return
    }

    setBookJobSavingService(true)
    try {
      const { data: insertedService, error } = await supabase
        .from('CustomerPrices')
        .insert({
          CustomerID: bookJobModal.customer.id,
          Service: serviceName,
          Price: parseFloat(bookJobServiceData.Price) || 0,
          Description: String(bookJobServiceData.Description || '').trim()
        })
        .select('*')
        .single()

      if (error) throw error

      setBookJobModal((prev) => {
        const nextServices = [...prev.services, insertedService]
        const nextSelected = insertedService?.id
          ? [...new Set([...prev.selectedServices, insertedService.id])]
          : prev.selectedServices

        return {
          ...prev,
          services: nextServices,
          selectedServices: nextSelected
        }
      })

      setBookJobServiceData({ Service: '', Price: '', Description: '' })
    } catch (error) {
      console.error('Error adding service in book job modal:', error.message)
      alert('Failed to add service. Please try again.')
    } finally {
      setBookJobSavingService(false)
    }
  }

  const fetchCustomerServices = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customerId)

      if (error) throw error
      setCustomerServices(data || [])
    } catch (err) {
      console.error('Error fetching customer services:', err.message)
    }
  }

  const fetchCustomerHistory = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('CustomerHistory')
        .select('*')
        .eq('CustomerID', customerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCustomerHistory(data || [])
    } catch (err) {
      console.error('Error fetching customer history:', err.message)
    }
  }

  const handleModalSave = async () => {
    if (!selectedQuote) return
    try {
      const { error } = await supabase
        .from('Customers')
        .update({
          CustomerName: modalEditData.CustomerName,
          Address: modalEditData.Address,
          Address2: modalEditData.Address2,
          Address3: modalEditData.Address3,
          Postcode: modalEditData.Postcode,
          PhoneNumber: modalEditData.PhoneNumber,
          EmailAddress: modalEditData.EmailAddress,
          PrefferedContact: modalEditData.PrefferedContact,
          Price: modalEditData.Price,
          Weeks: modalEditData.Weeks,
          NextClean: modalEditData.NextClean,
          Outstanding: modalEditData.Outstanding,
          Route: modalEditData.Route,
          Notes: modalEditData.Notes
        })
        .eq('id', selectedQuote.id)

      if (error) throw error

      setIsEditingModal(false)
      await fetchQuotes()
      setSelectedQuote((prev) => prev ? { ...prev, ...modalEditData } : prev)
    } catch (err) {
      console.error('Error updating quote:', err.message)
      alert('Failed to update quote. Please try again.')
    }
  }

  const handleAddService = async () => {
    if (!selectedQuote) return
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .insert({
          CustomerID: selectedQuote.id,
          Service: newServiceData.Service,
          Price: parseFloat(newServiceData.Price) || 0,
          Description: newServiceData.Description
        })

      if (error) throw error

      setIsAddingService(false)
      setNewServiceData({ Service: '', Price: '', Description: '' })
      fetchCustomerServices(selectedQuote.id)
    } catch (err) {
      console.error('Error adding service:', err.message)
      alert('Failed to add service. Please try again.')
    }
  }

  const handleEditService = async (serviceId) => {
    if (!selectedQuote) return
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .update({
          Service: editServiceData.Service,
          Price: parseFloat(editServiceData.Price) || 0,
          Description: editServiceData.Description
        })
        .eq('id', serviceId)

      if (error) throw error

      setEditingServiceId(null)
      setEditServiceData({})
      fetchCustomerServices(selectedQuote.id)
    } catch (err) {
      console.error('Error updating service:', err.message)
      alert('Failed to update service. Please try again.')
    }
  }

  const handleDeleteService = async (serviceId) => {
    if (!selectedQuote) return
    if (!confirm('Are you sure you want to delete this service?')) return
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .delete()
        .eq('id', serviceId)

      if (error) throw error
      fetchCustomerServices(selectedQuote.id)
    } catch (err) {
      console.error('Error deleting service:', err.message)
      alert('Failed to delete service. Please try again.')
    }
  }

  const handleChange = (field, value) => {
    setQuoteData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        UserId: user.id,
        CustomerName: quoteData.CustomerName,
        Address: quoteData.Address,
        Address2: quoteData.Address2,
        Address3: quoteData.Address3,
        Postcode: quoteData.Postcode,
        PhoneNumber: quoteData.PhoneNumber,
        EmailAddress: quoteData.EmailAddress,
        PrefferedContact: quoteData.PrefferedContact || null,
        Notes: quoteData.Notes,
        NextClean: quoteData.QuoteDate || null,
        Price: 0,
        Weeks: 4,
        Route: '',
        Outstanding: 0,
        Quote: true
      }

      const { data: insertData, error: insertError } = await supabase
        .from('Customers')
        .insert([payload])
        .select()
        .single()

      if (insertError) throw insertError

      // Add history entry for the quote booking
      if (payload.NextClean && insertData?.id) {
        const formattedDate = formatDateByCountry(payload.NextClean, user.SettingsCountry || 'United Kingdom')
        await supabase
          .from('CustomerHistory')
          .insert({
            CustomerID: insertData.id,
            Message: `Quote booked for ${formattedDate}`
          })
      }

      if (insertData) {
        const bookedInTemplate = findMessageTemplate(quoteBookedInLetter, [
          'When a Quote is booked in',
          'Quote booked in'
        ])

        openSendMethodModal({
          customer: insertData,
          subject: bookedInTemplate?.MessageTitle || 'Quote booked in',
          body: bookedInTemplate
            ? buildTemplateMessageBody(insertData, bookedInTemplate, { quoteDateValue: payload.NextClean })
            : buildQuoteBookedInFallbackBody(insertData, payload.NextClean),
          historyMessage: bookedInTemplate
            ? `Message ${bookedInTemplate.MessageTitle} sent`
            : 'Quote booked in message sent'
        })
      }

      await fetchQuotes()
      setQuoteData({
        CustomerName: '',
        Address: '',
        Address2: '',
        Address3: '',
        Postcode: '',
        PhoneNumber: '',
        EmailAddress: '',
        PrefferedContact: '',
        Notes: '',
        QuoteDate: ''
      })
      setShowAddForm(false)
    } catch (err) {
      setError(err.message || 'Error saving quote')
    } finally {
      setSaving(false)
    }
  }

  async function handleBookJob(customer) {
    // Fetch customer services first
    try {
      const { data: services, error } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customer.id)
      
      if (error) throw error
      
      // Show date and service picker modal
      const customerRoute = String(customer.Route || '').trim()
      const customerWeeks = Number.isFinite(parseInt(customer.Weeks, 10)) ? parseInt(customer.Weeks, 10) : 4

      setBookJobModal({
        show: true,
        customer,
        selectedDate: '',
        services: services || [],
        selectedServices: [],
        routeSelection: customerRoute || '',
        newRoute: '',
        oneOff: customerWeeks === 0,
        weeks: customerWeeks === 0 ? 4 : customerWeeks
      })
      setBookJobServiceData({ Service: '', Price: '', Description: '' })
      setBookJobSavingService(false)
    } catch (error) {
      console.error('Error checking services:', error.message)
      alert('Error checking services: ' + error.message)
    }
  }

  async function handleBookJobSave() {
    if (!bookJobModal.customer || !bookJobModal.selectedDate || bookJobModal.selectedServices.length === 0) {
      alert('Please select a date and at least one service')
      return
    }
    
    try {
      const selectedServiceObjects = bookJobModal.services.filter(s => bookJobModal.selectedServices.includes(s.id))
      const totalPrice = selectedServiceObjects.reduce((sum, s) => sum + (parseFloat(s.Price) || 0), 0)
      const serviceNames = selectedServiceObjects.map(s => s.Service).join(', ')
      const isNewRoute = bookJobModal.routeSelection === '__new__'
      const resolvedRoute = isNewRoute ? String(bookJobModal.newRoute || '').trim() : String(bookJobModal.routeSelection || '').trim()
      const resolvedWeeks = bookJobModal.oneOff ? 0 : (parseInt(bookJobModal.weeks, 10) || 4)

      if (!bookJobModal.oneOff && resolvedWeeks <= 0) {
        alert('Weeks must be greater than 0 unless One Off is selected')
        return
      }

      if (isNewRoute && !resolvedRoute) {
        alert('Please enter a new round name')
        return
      }
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: bookJobModal.selectedDate,
          Price: totalPrice,
          NextServices: serviceNames,
          Route: resolvedRoute,
          Weeks: resolvedWeeks,
          Quote: false 
        })
        .eq('id', bookJobModal.customer.id)
      
      if (error) throw error
      
      // Create history record
      const { error: historyError } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: bookJobModal.customer.id,
          Message: 'Quote converted to job, scheduled for ' + formatDateByCountry(bookJobModal.selectedDate, user.SettingsCountry || 'United Kingdom') + ', Services: ' + serviceNames
        })
      
      if (historyError) throw historyError

      const turnedTemplate = findMessageTemplate(quoteTurnedIntoJobLetter, [
        'When a Quote is Turned into a Job',
        'Quote turned into a job'
      ])

      openSendMethodModal({
        customer: bookJobModal.customer,
        subject: turnedTemplate?.MessageTitle || 'Quote turned into a job',
        body: buildTemplateMessageBody(bookJobModal.customer, turnedTemplate || null, {
          includePriceAmount: totalPrice,
          jobDateValue: bookJobModal.selectedDate,
          jobIsOneOff: bookJobModal.oneOff,
          recurrenceWeeks: resolvedWeeks,
          includeBookedServices: quoteTurnedIntoJobIncludeBookedServices,
          bookedServices: selectedServiceObjects,
          totalPrice
        }),
        historyMessage: turnedTemplate
          ? `Message ${turnedTemplate.MessageTitle} sent`
          : 'Quote turned into a job message sent'
      })
      
      closeBookJobModal()
      setShowQuoteModal(false)
      fetchRouteOptions()
      fetchQuotes()
    } catch (error) {
      console.error('Error booking job:', error.message)
      alert('Error booking job: ' + error.message)
    }
  }

  return (
    <div className="quotes-page">
      <div className="quotes-header">
        <h2>Quotes</h2>
      </div>

      <div className="quotes-actions">
        <button className="add-quote-btn" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Close' : 'Add Quote'}
        </button>
      </div>

      {showAddForm && (
        <form className="quote-form" onSubmit={handleSave}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <label>Name</label>
            <input
              type="text"
              value={quoteData.CustomerName}
              onChange={(e) => handleChange('CustomerName', e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <label>Address</label>
            <input
              type="text"
              value={quoteData.Address}
              onChange={(e) => handleChange('Address', e.target.value)}
              required
            />
          </div>

          <div className="form-row three-col">
            <div>
              <label>Address 2</label>
              <input
                type="text"
                value={quoteData.Address2}
                onChange={(e) => handleChange('Address2', e.target.value)}
              />
            </div>
            <div>
              <label>Address 3</label>
              <input
                type="text"
                value={quoteData.Address3}
                onChange={(e) => handleChange('Address3', e.target.value)}
              />
            </div>
            <div>
              <label>Postcode</label>
              <input
                type="text"
                value={quoteData.Postcode}
                onChange={(e) => handleChange('Postcode', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row two-col">
            <div>
              <label>Phone</label>
              <input
                type="tel"
                value={quoteData.PhoneNumber}
                onChange={(e) => handleChange('PhoneNumber', e.target.value)}
              />
            </div>
            <div>
              <label>Email</label>
              <input
                type="email"
                value={quoteData.EmailAddress}
                onChange={(e) => handleChange('EmailAddress', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <label>Preferred Contact</label>
            <select
              value={quoteData.PrefferedContact}
              onChange={(e) => handleChange('PrefferedContact', e.target.value)}
            >
              <option value="">Select preferred contact</option>
              <option value="E-Mail">E-Mail</option>
              <option value="Text">Text</option>
              <option value="Phone">Phone</option>
            </select>
          </div>

          <div className="form-row">
            <label>Quote Date</label>
            <input
              type="date"
              value={quoteData.QuoteDate}
              onChange={(e) => handleChange('QuoteDate', e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Notes</label>
            <textarea
              value={quoteData.Notes}
              onChange={(e) => handleChange('Notes', e.target.value)}
              rows="3"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={() => { setShowAddForm(false); setError('') }}>Cancel</button>
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      )}

      <div className="quotes-list">
        {loading ? (
          <p className="placeholder-text">Loading quotes...</p>
        ) : quotes.length === 0 ? (
          <p className="placeholder-text">No quotes yet.</p>
        ) : (
          quotes.map((q) => (
            <div key={q.id} className="quote-item-with-button">
              <div
                className="quote-item"
                onClick={() => {
                  setSelectedQuote(q)
                  setModalEditData({ ...q })
                  setShowQuoteModal(true)
                  setIsEditingModal(false)
                  setShowServices(false)
                  setShowHistory(false)
                  setServiceDropdownOpen(null)
                  setEditingServiceId(null)
                  setIsAddingService(false)
                }}
              >
                <div className="quote-name">{q.CustomerName}</div>
                <div className="quote-address">{[q.Address, q.Address2, q.Address3, q.Postcode].filter(Boolean).join(', ')}</div>
              </div>
              <button 
                className="quote-book-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  handleBookJob(q)
                }}
              >
                Book Job
              </button>
            </div>
          ))
        )}
      </div>

      {showQuoteModal && selectedQuote && (
        <div className="modal-overlay" onClick={() => { setShowQuoteModal(false); setIsEditingModal(false); setShowServices(false); setShowHistory(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowQuoteModal(false); setIsEditingModal(false); setShowServices(false); setShowHistory(false); }}>×</button>
            <h3>{showHistory ? 'Customer History' : showServices ? 'Customer Services' : 'Customer Details'}</h3>

            <div className="modal-actions">
              {isEditingModal ? (
                <>
                  <button className="modal-save-btn" onClick={handleModalSave}>Save</button>
                  <button className="modal-cancel-btn" onClick={() => setIsEditingModal(false)}>Cancel</button>
                </>
              ) : (
                <>
                  {!showServices && !showHistory && <button className="modal-edit-btn" onClick={() => { setIsEditingModal(true); setModalEditData({ ...selectedQuote }); }}>Edit</button>}
                  <button className="modal-services-btn" onClick={() => { setShowServices(!showServices); setShowHistory(false); if (!showServices) fetchCustomerServices(selectedQuote.id); }}>{showServices ? 'Customer Details' : 'Services'}</button>
                  <button className="modal-history-btn" onClick={() => { setShowHistory(!showHistory); setShowServices(false); if (!showHistory) fetchCustomerHistory(selectedQuote.id); }}>{showHistory ? 'Customer Details' : 'History'}</button>
                </>
              )}
            </div>

            {!showServices && !showHistory ? (
              isEditingModal ? (
                <div className="details-grid">
                  <div><strong>Name:</strong> <input type="text" value={modalEditData.CustomerName} onChange={(e) => setModalEditData({...modalEditData, CustomerName: e.target.value})} className="modal-input" /></div>
                  <div><strong>Address:</strong> <input type="text" value={modalEditData.Address} onChange={(e) => setModalEditData({...modalEditData, Address: e.target.value})} className="modal-input" /></div>
                  <div><strong>Address 2:</strong> <input type="text" value={modalEditData.Address2} onChange={(e) => setModalEditData({...modalEditData, Address2: e.target.value})} className="modal-input" /></div>
                  <div><strong>Address 3:</strong> <input type="text" value={modalEditData.Address3} onChange={(e) => setModalEditData({...modalEditData, Address3: e.target.value})} className="modal-input" /></div>
                  <div><strong>Postcode:</strong> <input type="text" value={modalEditData.Postcode} onChange={(e) => setModalEditData({...modalEditData, Postcode: e.target.value})} className="modal-input" /></div>
                  <div><strong>Phone:</strong> <input type="tel" value={modalEditData.PhoneNumber} onChange={(e) => setModalEditData({...modalEditData, PhoneNumber: e.target.value})} className="modal-input" /></div>
                  <div><strong>Email:</strong> <input type="email" value={modalEditData.EmailAddress} onChange={(e) => setModalEditData({...modalEditData, EmailAddress: e.target.value})} className="modal-input" /></div>
                  <div><strong>Preferred Contact:</strong> <select value={modalEditData.PrefferedContact || ''} onChange={(e) => setModalEditData({...modalEditData, PrefferedContact: e.target.value})} className="modal-input"><option value="">Select preferred contact</option><option value="E-Mail">E-Mail</option><option value="Text">Text</option><option value="Phone">Phone</option></select></div>
                  <div><strong>Price:</strong> <input type="number" value={modalEditData.Price} onChange={(e) => setModalEditData({...modalEditData, Price: e.target.value})} className="modal-input" /></div>
                  <div><strong>Weeks:</strong> <input type="number" value={modalEditData.Weeks} onChange={(e) => setModalEditData({...modalEditData, Weeks: e.target.value})} className="modal-input" /></div>
                  <div><strong>Quote Date:</strong> <input type="date" value={modalEditData.NextClean || ''} onChange={(e) => setModalEditData({...modalEditData, NextClean: e.target.value})} className="modal-input" /></div>
                  <div><strong>Outstanding:</strong> <input type="number" value={modalEditData.Outstanding} onChange={(e) => setModalEditData({...modalEditData, Outstanding: e.target.value})} className="modal-input" /></div>
                  <div><strong>Route:</strong> <input type="text" value={modalEditData.Route} onChange={(e) => setModalEditData({...modalEditData, Route: e.target.value})} className="modal-input" /></div>
                  <div style={{gridColumn: '1 / -1'}}><strong>Notes:</strong> <textarea value={modalEditData.Notes} onChange={(e) => setModalEditData({...modalEditData, Notes: e.target.value})} className="modal-input" rows="3" /></div>
                </div>
              ) : (
                <>
                <div className="details-grid">
                  <div><strong>Name:</strong> {selectedQuote.CustomerName}</div>
                  <div><strong>Address:</strong> {[selectedQuote.Address, selectedQuote.Address2, selectedQuote.Address3, selectedQuote.Postcode].filter(Boolean).join(', ')}</div>
                  <div><strong>Phone:</strong> {selectedQuote.PhoneNumber || '—'}</div>
                  <div><strong>Email:</strong> {selectedQuote.EmailAddress || '—'}</div>
                  <div><strong>Preferred Contact:</strong> {selectedQuote.PrefferedContact || '—'}</div>
                  <div><strong>Price:</strong> {formatCurrency(selectedQuote.Price || 0, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Weeks:</strong> {selectedQuote.Weeks || '—'}</div>
                  <div><strong>Quote Date:</strong> {selectedQuote.NextClean ? formatDateByCountry(selectedQuote.NextClean, user.SettingsCountry || 'United Kingdom') : '—'}</div>
                  <div><strong>Outstanding:</strong> {formatCurrency(selectedQuote.Outstanding || 0, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Route:</strong> {selectedQuote.Route || '—'}</div>
                  <div className="notes-cell"><strong>Notes:</strong> {selectedQuote.Notes || '—'}</div>
                </div>
                <button 
                  className="book-job-btn"
                  onClick={() => handleBookJob(selectedQuote)}
                  title="Convert quote to job"
                >
                  Book Job
                </button>
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
                          onChange={(e) => setNewServiceData({...newServiceData, Service: e.target.value})} 
                          className="modal-input"
                          placeholder="e.g., Windows, Gutters"
                        />
                      </div>
                      <div>
                        <label><strong>Price:</strong></label>
                        <input 
                          type="number" 
                          value={newServiceData.Price} 
                          onChange={(e) => setNewServiceData({...newServiceData, Price: e.target.value})} 
                          className="modal-input"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label><strong>Description:</strong></label>
                        <input 
                          type="text" 
                          value={newServiceData.Description} 
                          onChange={(e) => setNewServiceData({...newServiceData, Description: e.target.value})} 
                          className="modal-input"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <div className="service-form-actions">
                      <button className="modal-save-btn" onClick={handleAddService}>Save</button>
                      <button className="modal-cancel-btn" onClick={() => { setIsAddingService(false); setNewServiceData({ Service: '', Price: '', Description: '' }); }}>Cancel</button>
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
                            <td><input type="text" value={editServiceData.Service} onChange={(e) => setEditServiceData({...editServiceData, Service: e.target.value})} className="modal-input" /></td>
                            <td><input type="number" value={editServiceData.Price} onChange={(e) => setEditServiceData({...editServiceData, Price: e.target.value})} className="modal-input" /></td>
                            <td><input type="text" value={editServiceData.Description} onChange={(e) => setEditServiceData({...editServiceData, Description: e.target.value})} className="modal-input" /></td>
                            <td>
                              <button className="service-save-btn" onClick={() => handleEditService(service.id)}>✓</button>
                              <button className="service-cancel-btn" onClick={() => { setEditingServiceId(null); setEditServiceData({}); }}>✕</button>
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
                                <div
                                  className="service-actions-dropdown"
                                  ref={(element) => {
                                    if (element) {
                                      serviceDropdownRefs.current[service.id] = element
                                    } else {
                                      delete serviceDropdownRefs.current[service.id]
                                    }
                                  }}
                                >
                                  <button onClick={() => { setEditingServiceId(service.id); setEditServiceData({...service}); setServiceDropdownOpen(null); }}>Edit</button>
                                  <button onClick={() => { handleDeleteService(service.id); setServiceDropdownOpen(null); }}>Delete</button>
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
      )}

      {bookJobModal.show && bookJobModal.customer && (
        <div className="modal-overlay" onClick={closeBookJobModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Book Job for {bookJobModal.customer.CustomerName}</h3>
            <div className="modal-form">
              <label htmlFor="jobDate">Select Job Date:</label>
              <input
                id="jobDate"
                type="date"
                value={bookJobModal.selectedDate}
                onChange={(e) => setBookJobModal(prev => ({ ...prev, selectedDate: e.target.value }))}
                className="modal-input"
              />

              <label htmlFor="jobRound" style={{ marginTop: '1rem' }}>Round:</label>
              <select
                id="jobRound"
                value={bookJobModal.routeSelection}
                onChange={(e) => setBookJobModal(prev => ({ ...prev, routeSelection: e.target.value }))}
                className="modal-input"
              >
                <option value="">Select round</option>
                {routeOptions.map((route) => (
                  <option key={route} value={route}>{route}</option>
                ))}
                <option value="__new__">+ Create new round</option>
              </select>

              {bookJobModal.routeSelection === '__new__' && (
                <input
                  type="text"
                  value={bookJobModal.newRoute}
                  onChange={(e) => setBookJobModal(prev => ({ ...prev, newRoute: e.target.value }))}
                  className="modal-input"
                  placeholder="Enter new round name"
                  style={{ marginTop: '0.5rem' }}
                />
              )}

              <div className="book-job-frequency-row">
                <label className="book-job-oneoff-toggle">
                  <input
                    type="checkbox"
                    checked={bookJobModal.oneOff}
                    onChange={(e) => setBookJobModal(prev => ({ ...prev, oneOff: e.target.checked }))}
                  />
                  One Off
                </label>
                <div className="book-job-weeks-input-wrap">
                  <label htmlFor="jobWeeks">Weeks</label>
                  <input
                    id="jobWeeks"
                    type="number"
                    min="1"
                    value={bookJobModal.weeks}
                    onChange={(e) => setBookJobModal(prev => ({ ...prev, weeks: e.target.value }))}
                    className="modal-input"
                    disabled={bookJobModal.oneOff}
                  />
                </div>
              </div>

              <label style={{ marginTop: '1rem' }}>Add Service:</label>
              <div className="book-job-add-service-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={bookJobServiceData.Service}
                  onChange={(e) => setBookJobServiceData((prev) => ({ ...prev, Service: e.target.value }))}
                  className="modal-input"
                  placeholder="Service name"
                />
                <input
                  type="number"
                  value={bookJobServiceData.Price}
                  onChange={(e) => setBookJobServiceData((prev) => ({ ...prev, Price: e.target.value }))}
                  className="modal-input"
                  placeholder="Price"
                />
              </div>
              <input
                type="text"
                value={bookJobServiceData.Description}
                onChange={(e) => setBookJobServiceData((prev) => ({ ...prev, Description: e.target.value }))}
                className="modal-input"
                placeholder="Description (optional)"
                style={{ marginTop: '0.5rem' }}
              />
              <button
                type="button"
                onClick={handleBookJobAddService}
                className="modal-ok-btn"
                style={{ marginTop: '0.5rem', width: 'fit-content' }}
                disabled={bookJobSavingService}
              >
                {bookJobSavingService ? 'Adding...' : 'Add Service'}
              </button>
              
              {bookJobModal.services.length > 0 && (
                <>
                  <label style={{ marginTop: '1rem' }}>Select Services:</label>
                  <div className="services-checklist">
                    {bookJobModal.services.map((service) => (
                      <div key={service.id} className="service-checkbox-item">
                        <input
                          type="checkbox"
                          id={`service-${service.id}`}
                          checked={bookJobModal.selectedServices.includes(service.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBookJobModal(prev => ({
                                ...prev,
                                selectedServices: [...prev.selectedServices, service.id]
                              }))
                            } else {
                              setBookJobModal(prev => ({
                                ...prev,
                                selectedServices: prev.selectedServices.filter(id => id !== service.id)
                              }))
                            }
                          }}
                        />
                        <label htmlFor={`service-${service.id}`} className="service-label">
                          {service.Service} - {formatCurrency(service.Price, user.SettingsCountry || 'United Kingdom')}
                        </label>
                      </div>
                    ))}
                  </div>
                  
                  {bookJobModal.selectedServices.length > 0 && (
                    <div className="service-total">
                      Total Price: {formatCurrency(
                        bookJobModal.services
                          .filter(s => bookJobModal.selectedServices.includes(s.id))
                          .reduce((sum, s) => sum + (parseFloat(s.Price) || 0), 0),
                        user.SettingsCountry || 'United Kingdom'
                      )}
                    </div>
                  )}
                </>
              )}

              {bookJobModal.services.length === 0 && (
                <p style={{ marginTop: '1rem' }}>Add at least one service, then select it to continue.</p>
              )}
            </div>
            <div className="modal-buttons">
              <button 
                onClick={() => handleBookJobSave()}
                className="modal-ok-btn"
              >
                Save
              </button>
              <button 
                onClick={closeBookJobModal}
                className="modal-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <SendMessageMethodModal
        isOpen={sendMessageModal.show}
        customer={sendMessageModal.customer}
        onCancel={closeSendMessageModal}
        onSend={handleSendMessageModalConfirm}
      />
    </div>
  )
}

export default Quotes
