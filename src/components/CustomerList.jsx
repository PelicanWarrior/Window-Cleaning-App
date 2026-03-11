import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import './CustomerList.css'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'
import InvoicesModal from './InvoicesModal'
import InvoiceModalContent from './InvoiceModalNew'

function CustomerList({ user, isGuest = false, onRequireAuth }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState(user.CustomerSort || 'Route')
  // Show the sorted column on initial load
  const [sortedColumn, setSortedColumn] = useState(user.CustomerSort || 'Route')
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedActionRows, setExpandedActionRows] = useState({})
  const [dropdownPositions, setDropdownPositions] = useState({})
  const dropdownRefs = useRef({})
  const [showFindForm, setShowFindForm] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [messages, setMessages] = useState([])
  const [reminderLetter, setReminderLetter] = useState(null)
  const [messageFooter, setMessageFooter] = useState('')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
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
  const [cancelServiceModal, setCancelServiceModal] = useState({ show: false, reason: '' })

  useEffect(() => {
    if (!serviceDropdownOpen) return

    const dropdownElement = serviceDropdownRefs.current[serviceDropdownOpen]
    if (!dropdownElement) return

    requestAnimationFrame(() => {
      dropdownElement.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' })
    })
  }, [serviceDropdownOpen])
  const [invoiceModal, setInvoiceModal] = useState({ show: false, customer: null })
  const [invoicesListModal, setInvoicesListModal] = useState({ show: false, customer: null })
  const [changePriceModal, setChangePriceModal] = useState({ show: false, price: '' })
  const [showCSVImportModal, setShowCSVImportModal] = useState(false)
  const [csvValidationError, setCSVValidationError] = useState('')
  const [preferredDaysSelected, setPreferredDaysSelected] = useState({})
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const dayShortcuts = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']
  const csvFileInputRef = useRef(null)
  const [filters, setFilters] = useState({
    CustomerName: '',
    Address: '',
    PhoneNumber: '',
    Route: ''
  })
  const [newCustomer, setNewCustomer] = useState({
    CustomerName: '',
    Address: '',
    Address2: '',
    Address3: '',
    Postcode: '',
    PhoneNumber: '',
    EmailAddress: '',
    Price: '',
    Weeks: '',
    Route: '',
    NextClean: '',
    Notes: ''
  })

  const parsePriceNumber = (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return 0

    let normalized = raw.replace(/[^0-9,.-]/g, '')
    if (normalized.includes(',') && !normalized.includes('.')) {
      normalized = normalized.replace(',', '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }

    const numeric = parseFloat(normalized)
    return Number.isFinite(numeric) ? numeric : 0
  }

  const requestAuthForWrite = () => {
    onRequireAuth?.()
  }

  const handleOpenAddForm = () => {
    if (isGuest) {
      requestAuthForWrite()
      return
    }

    setShowAddForm(true)
  }

  useEffect(() => {
    fetchCustomers()
  }, [sortBy, filters])

  useEffect(() => {
    fetchReminderLetterAndMessages()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if any dropdown is open
      const openDropdowns = Object.keys(expandedActionRows).filter(id => expandedActionRows[id])
      if (openDropdowns.length === 0) return

      // Check if click is outside all dropdowns
      const clickedOutside = !event.target.closest('.actions-dropdown') && 
                             !event.target.closest('.actions-dropdown-menu')
      
      if (clickedOutside) {
        setExpandedActionRows({})
        setDropdownPositions({})
      }

      // Close Sort dropdown when clicking outside
      const clickedOutsideSort = !event.target.closest('.sort-dropdown') &&
                                 !event.target.closest('.sort-dropdown-menu')
      if (clickedOutsideSort) {
        setShowSortDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [expandedActionRows])

  async function fetchReminderLetterAndMessages() {
    try {
      const [{ data: userData, error: userError }, { data: messagesData, error: messagesError }] = await Promise.all([
        supabase
          .from('Users')
          .select('CustomerReminderLetter, MessageFooter')
          .eq('id', user.id)
          .single(),
        supabase
          .from('Messages')
          .select('*')
          .eq('UserId', user.id)
      ])

      if (userError) throw userError
      if (messagesError) throw messagesError

      if (userData?.CustomerReminderLetter) {
        const reminder = messagesData?.find((m) => String(m.id) === String(userData.CustomerReminderLetter))
        setReminderLetter(reminder || null)
      }
      setMessages(messagesData || [])
      setMessageFooter(userData?.MessageFooter || '')
    } catch (error) {
      console.error('Error fetching reminder letter:', error.message)
    }
  }

  async function fetchCustomers() {
    try {
      let query = supabase
        .from('Customers')
        .select('*')
        .eq('UserId', user.id)
        .or('Quote.is.null,Quote.eq.false')

      // Apply filters
      if (filters.CustomerName) {
        query = query.ilike('CustomerName', `%${filters.CustomerName}%`)
      }
      if (filters.Address) {
        query = query.ilike('Address', `%${filters.Address}%`)
      }
      if (filters.PhoneNumber) {
        query = query.ilike('PhoneNumber', `%${filters.PhoneNumber}%`)
      }
      if (filters.Route) {
        query = query.ilike('Route', `%${filters.Route}%`)
      }

      // Sort based on current sort option
      switch(sortBy) {
        case 'Next Clean':
          query = query.order('NextClean', { ascending: true, nullsFirst: false })
          break
        case 'Route':
          query = query.order('Route', { ascending: true })
          break
        case 'Outstanding':
          query = query.order('Outstanding', { ascending: false })
          break
        case 'Customer Name':
          query = query.order('CustomerName', { ascending: true })
          break
        case 'Address':
          query = query.order('Address', { ascending: true })
          break
        default:
          query = query.order('Route', { ascending: true })
      }

      const { data, error } = await query
      
      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error.message)
    } finally {
      setLoading(false)
    }
  }

  function handleFilterChange(field, value) {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }))
  }

  function clearFilters() {
    setFilters({
      CustomerName: '',
      Address: '',
      PhoneNumber: '',
      Route: ''
    })
    setShowFindForm(false)
  }

  async function handleSortChange(newSortBy) {
    setSortBy(newSortBy)
    setSortedColumn(newSortBy)
    
    // Update the user's sort preference in the database
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CustomerSort: newSortBy })
        .eq('id', user.id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating sort preference:', error.message)
    }
  }

  // Column order: Actions first, then selected sort column (if any), then Name + Address only
  const getColumnOrder = () => {
    const base = ['Actions']
    const columnFieldMap = {
      'Next Clean': 'Next Clean',
      'Route': 'Route',
      'Outstanding': 'Outstanding',
      'Customer Name': 'Name',
      'Address': 'Address'
    }

    if (sortedColumn) {
      const sortedColumnDisplay = columnFieldMap[sortedColumn] || sortedColumn
      // Insert the selected sort column to the left of Name/Address
      if (sortedColumnDisplay === 'Name') {
        return [...base, 'Name', 'Address']
      }
      if (sortedColumnDisplay === 'Address') {
        return [...base, 'Address', 'Name']
      }
      return [...base, sortedColumnDisplay, 'Name', 'Address']
    }

    // Default view: only Name and Address
    return [...base, 'Name', 'Address']
  }

  const columnOrder = getColumnOrder()
  const routeOptions = [...new Set(
    customers
      .map(customer => (customer.Route || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    // If UK local (starts with 0 and length 11), convert to +44
    if (digits.length === 11 && digits.startsWith('0')) {
      return `44${digits.slice(1)}`
    }
    // If already starts with country code, use as-is
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

  const getFullAddress = (customer) => {
    const parts = [
      customer.Address || '',
      customer.Address2 || '',
      customer.Address3 || '',
      customer.Postcode || ''
    ].filter(Boolean)
    return parts.join(', ')
  }

  const parsePreferredDays = (preferredDaysString) => {
    if (!preferredDaysString) return {}
    const days = preferredDaysString.split(',').map(d => d.trim())
    const parsed = {}
    daysOfWeek.forEach(day => {
      parsed[day] = days.includes(day)
    })
    return parsed
  }

  const formatPreferredDays = (daysObject) => {
    const selected = daysOfWeek.filter(day => daysObject[day])
    return selected.length > 0 ? selected.join(', ') : ''
  }

  const sendReminderMessage = async (customer) => {
    if (!reminderLetter) {
      alert('No reminder message is configured.')
      return
    }

    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    if (!phone) {
      alert('This customer does not have a valid phone number.')
      return
    }

    const formalName = getFormalCustomerName(customer.CustomerName)
    const bodyParts = [`Dear ${formalName}`]
    
    if (reminderLetter?.Message) {
      let messageContent = reminderLetter.Message
      // Replace currency placeholder based on selected country
      if (reminderLetter.IncludePrice) {
        const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
        if (messageContent.includes(symbol)) {
          messageContent = messageContent.replaceAll(symbol, `${symbol}${customer.Outstanding}`)
        }
      }
      bodyParts.push(messageContent)
    }
    
    if (messageFooter) bodyParts.push(messageFooter)

    const text = bodyParts.join('\n')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    
    // Add to CustomerHistory
    try {
      const { error } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: customer.id,
          Message: 'Message Pay Reminder Sent'
        })
      
      if (error) throw error
    } catch (error) {
      console.error('Error adding to history:', error.message)
    }
    
    // Close the dropdown after sending
    setExpandedActionRows(prev => ({...prev, [customer.id]: false}))
  }

  const toggleActionDropdown = (customerId, buttonRef) => {
    if (expandedActionRows[customerId]) {
      // Closing the current dropdown
      setExpandedActionRows(prev => ({
        ...prev,
        [customerId]: false
      }))
    } else {
      // Opening a new dropdown - position to the right of the button
      if (buttonRef) {
        const rect = buttonRef.getBoundingClientRect()
        setDropdownPositions({
          [customerId]: {
            top: `${rect.top}px`,
            left: `${rect.right + 8}px`
          }
        })
      }
      setExpandedActionRows({
        [customerId]: true
      })
    }
  }

  async function addCustomer(e) {
    e.preventDefault()

    if (isGuest) {
      requestAuthForWrite()
      return
    }

    try {
      const defaultNextCleanDate = new Date(Date.now() + (parseInt(newCustomer.Weeks) || 4) * 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const customerData = {
        ...newCustomer,
        UserId: user.id,
        Price: parsePriceNumber(newCustomer.Price),
        Weeks: parseInt(newCustomer.Weeks) || 4,
        Outstanding: 0,
        NextClean: (newCustomer.NextClean || '').trim() || defaultNextCleanDate
      }

      const { data: insertData, error } = await supabase
        .from('Customers')
        .insert([customerData])
        .select()
      
      if (error) throw error
      
      // Append new customer ID to Users.RouteOrder
      if (insertData && insertData.length > 0) {
        const newCustomerId = insertData[0].id
        const { data: userData, error: userError } = await supabase
          .from('Users')
          .select('RouteOrder')
          .eq('id', user.id)
          .single()
        
        if (userError) throw userError
        
        const currentOrder = userData?.RouteOrder ? userData.RouteOrder.split(',').map(id => parseInt(id)) : []
        const updatedOrder = [...currentOrder, newCustomerId]
        const updatedOrderString = updatedOrder.join(',')
        
        const { error: updateError } = await supabase
          .from('Users')
          .update({ RouteOrder: updatedOrderString })
          .eq('id', user.id)
        
        if (updateError) throw updateError
        
        // Add entry to CustomerPrices table
        const { error: priceError } = await supabase
          .from('CustomerPrices')
          .insert([{
            CustomerID: newCustomerId,
            Price: parsePriceNumber(newCustomer.Price),
            Service: 'Windows'
          }])
        
        if (priceError) throw priceError
      }
      
      setNewCustomer({ 
        CustomerName: '', 
        Address: '', 
        Address2: '', 
        Address3: '', 
        Postcode: '',
        PhoneNumber: '', 
        EmailAddress: '',
        Price: '', 
        Weeks: '', 
        Route: '', 
        NextClean: '',
        Notes: '' 
      })
      setShowAddForm(false)
      fetchCustomers()
    } catch (error) {
      console.error('Error adding customer:', error.message)
    }
  }

  async function deleteCustomer(id) {
    if (!confirm('Are you sure you want to delete this customer?')) return
    
    try {
      const { error } = await supabase
        .from('Customers')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      fetchCustomers()
    } catch (error) {
      console.error('Error deleting customer:', error.message)
    }
  }

  function handleEditCustomer(customer) {
    setEditingCustomerId(customer.id)
    setEditFormData({
      CustomerName: customer.CustomerName,
      Address: customer.Address,
      Address2: customer.Address2 || '',
      Address3: customer.Address3 || '',
      Postcode: customer.Postcode || '',
      PhoneNumber: customer.PhoneNumber || '',
      EmailAddress: customer.EmailAddress || '',
      Price: customer.Price,
      Weeks: customer.Weeks,
      Route: customer.Route || '',
      Notes: customer.Notes || '',
      Outstanding: customer.Outstanding || 0,
      NextClean: customer.NextClean || ''
    })
  }

  function handleCancelEdit() {
    setEditingCustomerId(null)
    setEditFormData({})
  }

  async function handleSaveEdit(id) {
    try {
      const { error } = await supabase
        .from('Customers')
        .update({
          CustomerName: editFormData.CustomerName,
          Address: editFormData.Address,
          Address2: editFormData.Address2,
          Address3: editFormData.Address3,
          Postcode: editFormData.Postcode,
          PhoneNumber: editFormData.PhoneNumber,
          EmailAddress: editFormData.EmailAddress,
          Price: parsePriceNumber(editFormData.Price),
          Weeks: parseInt(editFormData.Weeks) || 4,
          Route: editFormData.Route,
          Notes: editFormData.Notes,
          Outstanding: parseFloat(editFormData.Outstanding) || 0,
          NextClean: editFormData.NextClean
        })
        .eq('id', id)
      
      if (error) throw error
      
      setEditingCustomerId(null)
      setEditFormData({})
      fetchCustomers()
    } catch (error) {
      console.error('Error updating customer:', error.message)
    }
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

  async function handleOpenChangePrice(customerId) {
    try {
      const { data, error } = await supabase
        .from('CustomerPrices')
        .select('Price')
        .eq('CustomerID', customerId)
        .eq('Service', 'Windows')
        .single()
      
      if (error) {
        // If no Windows service found, set price to empty
        setChangePriceModal({ show: true, price: '' })
      } else {
        setChangePriceModal({ show: true, price: data?.Price || '' })
      }
    } catch (error) {
      console.error('Error fetching Windows price:', error.message)
      setChangePriceModal({ show: true, price: '' })
    }
  }

  async function handleSaveChangePrice() {
    try {
      const newPrice = parseFloat(changePriceModal.price)
      if (isNaN(newPrice)) {
        alert('Please enter a valid price')
        return
      }

      // Get the original price from CustomerPrices
      const { data: originalData, error: fetchError } = await supabase
        .from('CustomerPrices')
        .select('Price')
        .eq('CustomerID', selectedCustomer.id)
        .eq('Service', 'Windows')
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError

      const originalPrice = originalData?.Price || 0
      const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol

      // Update Customers table
      const { error: customerError } = await supabase
        .from('Customers')
        .update({ Price: newPrice })
        .eq('id', selectedCustomer.id)

      if (customerError) throw customerError

      // Update or insert CustomerPrices table
      if (originalData) {
        const { error: priceError } = await supabase
          .from('CustomerPrices')
          .update({ Price: newPrice })
          .eq('CustomerID', selectedCustomer.id)
          .eq('Service', 'Windows')

        if (priceError) throw priceError
      } else {
        const { error: priceError } = await supabase
          .from('CustomerPrices')
          .insert({
            CustomerID: selectedCustomer.id,
            Service: 'Windows',
            Price: newPrice
          })

        if (priceError) throw priceError
      }

      // Add history entry
      let historyMessage = ''
      if (newPrice > originalPrice) {
        historyMessage = `Price increased to ${currencySymbol}${newPrice.toFixed(2)}`
      } else if (newPrice < originalPrice) {
        historyMessage = `Price decreased to ${currencySymbol}${newPrice.toFixed(2)}`
      }

      if (historyMessage) {
        const { error: historyError } = await supabase
          .from('CustomerHistory')
          .insert({
            CustomerID: selectedCustomer.id,
            Message: historyMessage
          })

        if (historyError) throw historyError
      }

      setChangePriceModal({ show: false, price: '' })
      
      // Ask if user wants to notify customer
      const notifyCustomer = window.confirm('Notify Customer of Price Change?')
      
      if (notifyCustomer) {
        await handleNotifyPriceChange(selectedCustomer.id, newPrice)
      }
      
      fetchCustomers() // Refresh the customer list
    } catch (error) {
      console.error('Error updating price:', error.message)
      alert('Failed to update price. Please try again.')
    }
  }

  async function handleNotifyPriceChange(customerId, newPrice) {
    try {
      // Get PayChangeLetter ID from Users table
      const { data: userData, error: userError } = await supabase
        .from('Users')
        .select('PayChangeLetter')
        .eq('id', user.id)
        .single()

      if (userError) throw userError

      if (!userData?.PayChangeLetter) {
        alert('No Pay Change Letter configured. Please set one in the Letters page.')
        return
      }

      // Get the message text from Messages table
      const { data: messageData, error: messageError } = await supabase
        .from('Messages')
        .select('Message')
        .eq('id', userData.PayChangeLetter)
        .single()

      if (messageError) throw messageError

      // Get customer details
      const { data: customerData, error: customerError } = await supabase
        .from('Customers')
        .select('PhoneNumber, CustomerName')
        .eq('id', customerId)
        .single()

      if (customerError) throw customerError

      if (!customerData?.PhoneNumber) {
        alert('Customer does not have a phone number.')
        return
      }

      // Replace currency symbol with currency symbol + new price
      const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol
      const currencyRegex = new RegExp(`[${currencySymbol}£$€¥]`, 'g')
      
      let messageText = messageData.Message
      messageText = messageText.replace(currencyRegex, `${currencySymbol}${newPrice.toFixed(2)}`)
      
      // Create personalized greeting based on customer name
      const createGreeting = (fullName) => {
        const titles = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Sir', 'Madam']
        const nameParts = fullName.trim().split(/\s+/)
        
        // Check if first part is a title
        if (titles.includes(nameParts[0])) {
          // Title present - use "Dear [Title] [Last Name]"
          const title = nameParts[0]
          const lastName = nameParts[nameParts.length - 1]
          return `Dear ${title} ${lastName}`
        } else {
          // No title - use "Dear [First Name]"
          const firstName = nameParts[0]
          return `Dear ${firstName}`
        }
      }
      
      const greeting = `${createGreeting(customerData.CustomerName)}\n\n`
      const footer = messageFooter ? `\n\n${messageFooter}` : ''
      const fullMessage = greeting + messageText + footer

      // Format phone number for WhatsApp (same method as WorkloadManager)
      const digits = (customerData.PhoneNumber || '').replace(/\D/g, '')
      let phoneNumber = digits
      // If UK local (starts with 0 and length 11), convert to +44
      if (digits.length === 11 && digits.startsWith('0')) {
        phoneNumber = `44${digits.slice(1)}`
      }
      
      const encodedMessage = encodeURIComponent(fullMessage)
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`
      
      window.open(whatsappUrl, '_blank')
    } catch (error) {
      console.error('Error sending price change notification:', error.message)
      alert('Failed to send notification. Please try again.')
    }
  }

  async function handleModalSave() {
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
          Price: modalEditData.Price,
          Weeks: modalEditData.Weeks,
          NextClean: modalEditData.NextClean,
          Outstanding: modalEditData.Outstanding,
          Route: modalEditData.Route,
          VAT: modalEditData.VAT,
          PrefferedDays: formatPreferredDays(preferredDaysSelected),
          Notes: modalEditData.Notes
        })
        .eq('id', selectedCustomer.id)
      
      if (error) throw error
      
      // Update the selectedCustomer immediately to show changes
      setSelectedCustomer(modalEditData)
      setIsEditingModal(false)
      fetchCustomers() // Refresh the customer list
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
          CustomerID: selectedCustomer.id,
          Service: newServiceData.Service,
          Price: parseFloat(newServiceData.Price) || 0,
          Description: newServiceData.Description
        })
      
      if (error) throw error
      
      setIsAddingService(false)
      setNewServiceData({ Service: '', Price: '', Description: '' })
      fetchCustomerServices(selectedCustomer.id) // Refresh the services list
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
          Description: editServiceData.Description
        })
        .eq('id', serviceId)
      
      if (error) throw error
      
      setEditingServiceId(null)
      setEditServiceData({})
      fetchCustomerServices(selectedCustomer.id)
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
      
      fetchCustomerServices(selectedCustomer.id)
    } catch (error) {
      console.error('Error deleting service:', error.message)
      alert('Failed to delete service. Please try again.')
    }
  }

  async function handleAddToNextClean(service) {
    try {
      // Get current customer data
      const { data: customer, error: fetchError } = await supabase
        .from('Customers')
        .select('NextServices, Price')
        .eq('id', selectedCustomer.id)
        .single()
      
      if (fetchError) throw fetchError
      
      // Check if service is already in NextServices
      const currentServices = customer.NextServices ? customer.NextServices.split(',').map(s => s.trim()) : []
      if (currentServices.includes(service.Service)) {
        alert('Service already added')
        return
      }
      
      // Add service to NextServices (comma-separated)
      currentServices.push(service.Service)
      const newNextServices = currentServices.join(', ')
      
      // Add price to existing price
      const newPrice = (customer.Price || 0) + service.Price
      
      // Update customer
      const { error: updateError } = await supabase
        .from('Customers')
        .update({
          NextServices: newNextServices,
          Price: newPrice
        })
        .eq('id', selectedCustomer.id)
      
      if (updateError) throw updateError
      
      alert(`${service.Service} added to next clean!`)
      fetchCustomers() // Refresh customer list
    } catch (error) {
      console.error('Error adding to next clean:', error.message)
      alert('Failed to add to next clean. Please try again.')
    }
  }

  async function handleMarkAsPaid(customerId) {
    try {
      // Get customer data first to access Outstanding amount
      const { data: customer, error: fetchError } = await supabase
        .from('Customers')
        .select('Outstanding')
        .eq('id', customerId)
        .single()
      
      if (fetchError) throw fetchError

      // Create history record
      const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const historyMessage = `${symbol}${customer.Outstanding} mark as paid`
      
      const { error: historyError } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: customerId,
          Message: historyMessage
        })
      
      if (historyError) throw historyError

      // Update customer outstanding to 0
      const { error } = await supabase
        .from('Customers')
        .update({ Outstanding: 0 })
        .eq('id', customerId)
      
      if (error) throw error
      
      setExpandedActionRows(prev => ({...prev, [customerId]: false}))
      fetchCustomers()
    } catch (error) {
      console.error('Error marking as paid:', error.message)
      alert('Error marking as paid: ' + error.message)
    }
  }

  async function handleCancelService(reason) {
    if (!selectedCustomer) return

    try {
      // Clear NextClean field
      const { error: updateError } = await supabase
        .from('Customers')
        .update({ NextClean: null })
        .eq('id', selectedCustomer.id)
      
      if (updateError) throw updateError
      
      // Add to CustomerHistory
      let historyMessage = 'Cancelled Service'
      if (reason && reason.trim()) {
        historyMessage += ` - ${reason.trim()}`
      }
      
      const { error: historyError } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: selectedCustomer.id,
          Message: historyMessage
        })
      
      if (historyError) throw historyError
      
      // Close modal and refresh
      setCancelServiceModal({ show: false, reason: '' })
      setShowCustomerModal(false)
      fetchCustomers()
    } catch (error) {
      console.error('Error cancelling service:', error.message)
      alert('Error cancelling service: ' + error.message)
    }
  }

  async function handleCSVImport(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      const lines = text.split('\n')
      
      // Parse CSV properly handling quoted fields with commas
      function parseCSVLine(line) {
        const result = []
        let current = ''
        let inQuotes = false
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }
      
      const headers = parseCSVLine(lines[0])
      const normalizeHeader = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const headerIndexMap = headers.reduce((acc, header, index) => {
        const normalized = normalizeHeader(header)
        if (normalized && acc[normalized] === undefined) {
          acc[normalized] = index
        }
        return acc
      }, {})

      const getValueByHeaders = (values, possibleHeaders) => {
        for (const headerName of possibleHeaders) {
          const index = headerIndexMap[normalizeHeader(headerName)]
          if (index !== undefined) {
            return (values[index] || '').trim()
          }
        }
        return ''
      }

      const getValueByHeadersOrIndex = (values, possibleHeaders, fallbackIndex) => {
        const fromHeader = getValueByHeaders(values, possibleHeaders)
        if (fromHeader) return fromHeader
        if (typeof fallbackIndex === 'number' && fallbackIndex >= 0 && fallbackIndex < values.length) {
          return (values[fallbackIndex] || '').trim()
        }
        return ''
      }

      const parseCurrencyNumber = (value) => parsePriceNumber(value)

      const parseServicesList = (servicesText) => {
        if (!servicesText) return []

        return String(servicesText)
          .split(';')
          .map((segment) => segment.trim())
          .filter(Boolean)
          .map((segment) => {
            let parsed = segment.match(/^(.+?)\s*(?:-|=)\s*£?\s*([0-9]+(?:\.[0-9]{1,2})?)$/)
            if (!parsed) {
              parsed = segment.match(/^(.+?)\s+£?\s*([0-9]+(?:\.[0-9]{1,2})?)$/)
            }
            if (!parsed) return null

            const serviceName = (parsed[1] || '').trim()
            const servicePrice = parseCurrencyNumber(parsed[2])
            if (!serviceName) return null

            return {
              Service: serviceName,
              Price: servicePrice
            }
          })
          .filter(Boolean)
      }

      const extractNotesAndServices = (notesText) => {
        const normalizedNotes = String(notesText || '').trim()
        if (!normalizedNotes) return { cleanNotes: '', services: [] }

        const servicesMatch = normalizedNotes.match(/\bservices\b\s*:?\s*(.+)$/i)
        if (!servicesMatch || !servicesMatch[1]) {
          return { cleanNotes: normalizedNotes, services: [] }
        }

        const cleanNotes = normalizedNotes
          .slice(0, servicesMatch.index)
          .replace(/[;,:\-\s]+$/, '')
          .trim()

        return {
          cleanNotes,
          services: parseServicesList(servicesMatch[1])
        }
      }

      const buildCustomerSignature = (customer) => {
        const name = String(customer?.CustomerName || '').trim().toLowerCase()
        const address = String(customer?.Address || '').trim().toLowerCase()
        const phone = String(customer?.PhoneNumber || '').trim()
        const email = String(customer?.EmailAddress || '').trim().toLowerCase()
        return `${name}|${address}|${phone}|${email}`
      }

      const hasCustomerNameHeader = headerIndexMap[normalizeHeader('CustomerName')] !== undefined || headerIndexMap[normalizeHeader('Customer Name')] !== undefined
      const hasAddressHeader = headerIndexMap[normalizeHeader('Address')] !== undefined
      const hasPriceHeader =
        headerIndexMap[normalizeHeader('Price')] !== undefined ||
        headerIndexMap[normalizeHeader('Customer Price')] !== undefined ||
        headerIndexMap[normalizeHeader('Service Price')] !== undefined

      if (!hasCustomerNameHeader || !hasAddressHeader || !hasPriceHeader) {
        alert('CSV must include Customer Name, Address, and Price columns.')
        event.target.value = ''
        return
      }

      const customersToImport = []
      const servicesByCustomerSignature = new Map()
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const values = parseCSVLine(line)
        
        const weeks = parseInt(getValueByHeadersOrIndex(values, ['Weeks', 'Weeks for clean', 'WeeksForClean', 'Weeks for clean (e.g., 4, 6, etc)'], 3)) || 4
        const nextCleanValue = getValueByHeadersOrIndex(values, ['NextClean', 'Next Clean', 'Next Clean date', 'Next Clean Date'], 4)
        const outstandingValue = getValueByHeadersOrIndex(values, ['Outstanding', 'Outstanding Amount', 'OutstandingAmount'], 5)
        const priceValue = getValueByHeadersOrIndex(values, ['Price', 'Customer Price', 'Service Price'], 9)
        const rawNotesValue = getValueByHeadersOrIndex(values, ['Notes'], 7)
        const { cleanNotes, services: notesServices } = extractNotesAndServices(rawNotesValue)
        
        // Parse UK date format (dd/mm/yyyy) to ISO format (yyyy-mm-dd)
        let nextCleanDate
        if (nextCleanValue && nextCleanValue.includes('/')) {
          const parts = nextCleanValue.split('/')
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0')
            const month = parts[1].padStart(2, '0')
            const year = parts[2]
            nextCleanDate = `${year}-${month}-${day}`
            
            // Validate the date
            const testDate = new Date(nextCleanDate)
            if (isNaN(testDate.getTime())) {
              nextCleanDate = null // Invalid date, will use default
            }
          }
        }
        
        // Default NextClean if not provided or invalid
        if (!nextCleanDate) {
          nextCleanDate = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
        
        const customer = {
          UserId: user.id,
          CustomerName: getValueByHeadersOrIndex(values, ['CustomerName', 'Customer Name'], 1),
          Address: getValueByHeadersOrIndex(values, ['Address'], 0),
          Address2: getValueByHeaders(values, ['Address2', 'Address 2']),
          Address3: getValueByHeaders(values, ['Address3', 'Address 3']),
          Postcode: getValueByHeaders(values, ['Postcode']),
          PhoneNumber: getValueByHeadersOrIndex(values, ['PhoneNumber', 'Phone Number', 'Phone'], 2),
          EmailAddress: getValueByHeadersOrIndex(values, ['EmailAddress', 'Email Address', 'Email'], 8),
          Price: parseCurrencyNumber(priceValue),
          Weeks: weeks,
          Route: getValueByHeadersOrIndex(values, ['Route'], 6),
          Notes: cleanNotes,
          Outstanding: parseCurrencyNumber(outstandingValue),
          NextClean: nextCleanDate
        }
        
        if (customer.Address) {
          customersToImport.push(customer)
          servicesByCustomerSignature.set(buildCustomerSignature(customer), notesServices)
        }
      }

      if (customersToImport.length === 0) {
        alert('No valid customers found in CSV file')
        return
      }

      // Validate against account level limits
      const { data: userLevelData, error: userLevelError } = await supabase
        .from('UserLevel')
        .select('Customers, RoundAmount')
        .eq('id', user.AccountLevel)
        .single()
      
      if (userLevelError) throw userLevelError

      const { data: existingCustomers, error: existingError } = await supabase
        .from('Customers')
        .select('id, Quote, NextClean, Price, Weeks')
        .eq('UserId', user.id)
      
      if (existingError) throw existingError

      // Count existing customers (excluding quotes)
      const activeExisting = existingCustomers.filter(c => {
        if (c.Quote === true) return false
        if (!c.NextClean) return false
        const nextCleanDate = new Date(c.NextClean)
        const cutoffDate = new Date('2024-01-01')
        if (nextCleanDate < cutoffDate) return false
        return true
      })

      // Calculate existing monthly round
      const existingMonthly = activeExisting.reduce((sum, customer) => {
        const price = parseFloat(customer.Price) || 0
        const weeks = parseInt(customer.Weeks) || 1
        const monthlyValue = (price / weeks) * 4
        return sum + monthlyValue
      }, 0)

      // Calculate import totals
      const importCount = customersToImport.length
      const importMonthly = customersToImport.reduce((sum, customer) => {
        const price = parseFloat(customer.Price) || 0
        const weeks = parseInt(customer.Weeks) || 1
        const monthlyValue = (price / weeks) * 4
        return sum + monthlyValue
      }, 0)

      const totalCustomers = activeExisting.length + importCount
      const totalMonthly = existingMonthly + importMonthly

      // Check limits (only if not unlimited tiers with all 9's)
      const customerLimit = userLevelData.Customers
      const roundLimit = userLevelData.RoundAmount
      const isUnlimitedCustomers = String(customerLimit).match(/^9+$/)
      const isUnlimitedRound = String(roundLimit).match(/^9+$/)

      if ((!isUnlimitedCustomers && totalCustomers > customerLimit) || 
          (!isUnlimitedRound && totalMonthly > roundLimit)) {
        setCSVValidationError('you are trying to import more than your Level will allow, upgrade your account if you wish to import your customers')
        event.target.value = ''
        return
      }

      setCSVValidationError('')

      const { data: insertedCustomers, error } = await supabase
        .from('Customers')
        .insert(customersToImport)
        .select()
      
      if (error) throw error

      // Ensure imported customers have a "Windows" service entry in CustomerPrices
      if (insertedCustomers && insertedCustomers.length > 0) {
        const importedCustomerIds = insertedCustomers.map((customer) => customer.id)

        const { data: existingPriceEntries, error: existingPriceError } = await supabase
          .from('CustomerPrices')
          .select('CustomerID, Service')
          .in('CustomerID', importedCustomerIds)

        if (existingPriceError) throw existingPriceError

        const existingServiceKeys = new Set(
          (existingPriceEntries || []).map((entry) => `${entry.CustomerID}|${String(entry.Service || '').trim().toLowerCase()}`)
        )
        const queuedServiceKeys = new Set()
        const priceRowsToInsert = []

        for (const customer of insertedCustomers) {
          if (customer.Quote === true) continue

          const windowsKey = `${customer.id}|windows`
          if (!existingServiceKeys.has(windowsKey) && !queuedServiceKeys.has(windowsKey)) {
            priceRowsToInsert.push({
              CustomerID: customer.id,
              Price: parseFloat(customer.Price) || 0,
              Service: 'Windows'
            })
            queuedServiceKeys.add(windowsKey)
          }

          const extraServices = servicesByCustomerSignature.get(buildCustomerSignature(customer)) || []
          for (const service of extraServices) {
            const serviceKey = `${customer.id}|${String(service.Service || '').trim().toLowerCase()}`
            if (existingServiceKeys.has(serviceKey) || queuedServiceKeys.has(serviceKey)) continue

            priceRowsToInsert.push({
              CustomerID: customer.id,
              Price: parseFloat(service.Price) || 0,
              Service: service.Service
            })
            queuedServiceKeys.add(serviceKey)
          }
        }

        if (priceRowsToInsert.length > 0) {
          const { error: insertWindowsError } = await supabase
            .from('CustomerPrices')
            .insert(priceRowsToInsert)

          if (insertWindowsError) throw insertWindowsError
        }
      }
      
      // Append new customer IDs to Users.RouteOrder
      if (insertedCustomers && insertedCustomers.length > 0) {
        const { data: userData, error: userError } = await supabase
          .from('Users')
          .select('RouteOrder')
          .eq('id', user.id)
          .single()
        
        if (userError) throw userError
        
        const currentOrder = userData?.RouteOrder ? userData.RouteOrder.split(',').map(id => parseInt(id)) : []
        const newCustomerIds = insertedCustomers.map(c => c.id)
        const updatedOrder = [...currentOrder, ...newCustomerIds]
        const updatedOrderString = updatedOrder.join(',')
        
        const { error: updateError } = await supabase
          .from('Users')
          .update({ RouteOrder: updatedOrderString })
          .eq('id', user.id)
        
        if (updateError) throw updateError
      }
      
      alert(`Successfully imported ${customersToImport.length} customers`)
      setShowAddForm(false)
      fetchCustomers()
    } catch (error) {
      console.error('Error importing CSV:', error.message)
      const rawMessage = String(error?.message || '')
      const normalizedMessage = rawMessage.toLowerCase()

      if (normalizedMessage.includes('invalid input syntax for type integer') || normalizedMessage.includes('type integer')) {
        alert('Error importing CSV: a price column in Supabase is still integer. Set both Customers.Price and CustomerPrices.Price to numeric(10,2), then try again.')
      } else {
        alert('Error importing CSV: ' + rawMessage)
      }
    }
    
    // Reset the file input
    event.target.value = ''
  }

  if (loading) return <div className="loading">Loading customers...</div>

  return (
    <div className="customer-list">
      <h2>Customer Management</h2>
      
      <div className="action-buttons">
        {!showAddForm && (
          <button className="add-customer-btn" onClick={handleOpenAddForm}>
            + Add Customer
          </button>
        )}
        {!showFindForm && (
          <button className="find-customer-btn" onClick={() => setShowFindForm(true)}>
            🔍 Find Customer
          </button>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={addCustomer} className="customer-form">
          <div className="form-header">
            <h3>Add New Customer</h3>
            <button
              type="button"
              className="csv-import-btn"
              onClick={() => setShowCSVImportModal(true)}
            >
              📄 Import via CSV
            </button>
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              style={{ display: 'none' }}
            />
          </div>
          {csvValidationError && (
            <div style={{ color: 'red', fontWeight: 'bold', marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#ffebee', borderRadius: '4px' }}>
              {csvValidationError}
            </div>
          )}
          <div className="form-grid">
            <input
              type="text"
              placeholder="Customer Name"
              value={newCustomer.CustomerName}
              onChange={(e) => setNewCustomer({...newCustomer, CustomerName: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Address"
              value={newCustomer.Address}
              onChange={(e) => setNewCustomer({...newCustomer, Address: e.target.value})}
              required
              style={{ gridColumn: '1 / -1' }}
            />
            <input
              type="text"
              placeholder="Address 2 (optional)"
              value={newCustomer.Address2}
              onChange={(e) => setNewCustomer({...newCustomer, Address2: e.target.value})}
              style={{ gridColumn: '1 / -1' }}
            />
            <input
              type="text"
              placeholder="Address 3 (optional)"
              value={newCustomer.Address3}
              onChange={(e) => setNewCustomer({...newCustomer, Address3: e.target.value})}
              style={{ gridColumn: '1 / -1' }}
            />
            <input
              type="text"
              placeholder="Postcode"
              value={newCustomer.Postcode}
              onChange={(e) => setNewCustomer({...newCustomer, Postcode: e.target.value})}
              style={{ gridColumn: '1 / -1' }}
            />
            <input
              type="tel"
              placeholder="Phone Number"
              value={newCustomer.PhoneNumber}
              onChange={(e) => setNewCustomer({...newCustomer, PhoneNumber: e.target.value})}
            />
            <input
              type="email"
              placeholder="Email Address"
              value={newCustomer.EmailAddress}
              onChange={(e) => setNewCustomer({...newCustomer, EmailAddress: e.target.value})}
            />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '8px', pointerEvents: 'none', fontWeight: '600', color: '#333' }}>
                {getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol}
              </span>
              <input
                type="number"
                placeholder="Price"
                value={newCustomer.Price}
                onChange={(e) => setNewCustomer({...newCustomer, Price: e.target.value})}
                style={{ paddingLeft: '28px' }}
                required
              />
            </div>
            <input
              type="number"
              placeholder="Weeks between cleans"
              value={newCustomer.Weeks}
              onChange={(e) => setNewCustomer({...newCustomer, Weeks: e.target.value})}
              required
            />
            <input
              type="text"
              list="route-options"
              placeholder="Route (pick existing or type new)"
              value={newCustomer.Route}
              onChange={(e) => setNewCustomer({...newCustomer, Route: e.target.value})}
            />
            <datalist id="route-options">
              {routeOptions.map((route) => (
                <option key={route} value={route} />
              ))}
            </datalist>
            <input
              type="date"
              placeholder="Next Clean Date"
              value={newCustomer.NextClean}
              onChange={(e) => setNewCustomer({...newCustomer, NextClean: e.target.value})}
            />
            <textarea
              placeholder="Notes (optional)"
              value={newCustomer.Notes}
              onChange={(e) => setNewCustomer({...newCustomer, Notes: e.target.value})}
              rows="2"
              style={{ gridColumn: '1 / -1' }}
            />
          </div>
          <div className="form-actions">
            <button type="submit">Add Customer</button>
            <button type="button" className="cancel-btn" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {showFindForm && (
        <div className="customer-form find-form">
          <h3>Find Customer</h3>
          <div className="form-grid">
            <input
              type="text"
              placeholder="Customer Name"
              value={filters.CustomerName}
              onChange={(e) => handleFilterChange('CustomerName', e.target.value)}
            />
            <input
              type="text"
              placeholder="Address"
              value={filters.Address}
              onChange={(e) => handleFilterChange('Address', e.target.value)}
            />
            <input
              type="text"
              placeholder="Phone Number"
              value={filters.PhoneNumber}
              onChange={(e) => handleFilterChange('PhoneNumber', e.target.value)}
            />
            <input
              type="text"
              placeholder="Route"
              value={filters.Route}
              onChange={(e) => handleFilterChange('Route', e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="clear-btn" onClick={clearFilters}>
              Clear & Close
            </button>
          </div>
        </div>
      )}

      <div className="customer-table">
        <h3>Customer List ({customers.length})</h3>
        <div className="sort-buttons">
          <div className="sort-dropdown">
            <button
              className={`sort-toggle ${showSortDropdown ? 'open' : ''}`}
              onClick={() => setShowSortDropdown((v) => !v)}
            >
              Sort By: {sortBy}
            </button>
            {showSortDropdown && (
              <div className="sort-dropdown-menu">
                <button onClick={() => { handleSortChange('Next Clean'); setShowSortDropdown(false) }}>Next Clean</button>
                <button onClick={() => { handleSortChange('Route'); setShowSortDropdown(false) }}>Route</button>
                <button onClick={() => { handleSortChange('Outstanding'); setShowSortDropdown(false) }}>Outstanding</button>
                <button onClick={() => { handleSortChange('Customer Name'); setShowSortDropdown(false) }}>Customer Name</button>
                <button onClick={() => { handleSortChange('Address'); setShowSortDropdown(false) }}>Address</button>
              </div>
            )}
          </div>
        </div>
        {customers.length === 0 ? (
          <p className="empty-state">No customers yet. Add your first customer above!</p>
        ) : (
          <table>
            <thead>
              <tr>
                {columnOrder.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const rowCells = []
                
                columnOrder.forEach((col) => {
                  if (col === 'Name') {
                    rowCells.push({
                      key: 'Name',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.CustomerName : customer.CustomerName,
                      onChange: (e) => setEditFormData({...editFormData, CustomerName: e.target.value})
                    })
                  } else if (col === 'Address') {
                    if (editingCustomerId === customer.id) {
                      // Show all address fields when editing
                      rowCells.push({
                        key: 'Address',
                        isEditAddress: true,
                        customer: customer
                      })
                    } else {
                      // Show full address when not editing
                      rowCells.push({
                        key: 'Address',
                        isEdit: false,
                        value: getFullAddress(customer)
                      })
                    }
                  } else if (col === 'Contact Details') {
                    rowCells.push({
                      key: 'Contact Details',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.PhoneNumber : customer.PhoneNumber,
                      onChange: (e) => setEditFormData({...editFormData, PhoneNumber: e.target.value}),
                      type: 'tel'
                    })
                  } else if (col === 'Price') {
                    rowCells.push({
                      key: 'Price',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.Price : customer.Price,
                      onChange: (e) => setEditFormData({...editFormData, Price: e.target.value}),
                      type: 'number'
                    })
                  } else if (col === 'Weeks') {
                    rowCells.push({
                      key: 'Weeks',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.Weeks : customer.Weeks,
                      onChange: (e) => setEditFormData({...editFormData, Weeks: e.target.value}),
                      type: 'number'
                    })
                  } else if (col === 'Next Clean') {
                    rowCells.push({
                      key: 'Next Clean',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.NextClean : customer.NextClean,
                      onChange: (e) => setEditFormData({...editFormData, NextClean: e.target.value}),
                      type: 'date',
                      // When not editing, render formatted date per user country
                      isDateField: editingCustomerId !== customer.id
                    })
                  } else if (col === 'Outstanding') {
                    rowCells.push({
                      key: 'Outstanding',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.Outstanding : customer.Outstanding,
                      onChange: (e) => setEditFormData({...editFormData, Outstanding: e.target.value}),
                      type: 'number',
                      isOutstanding: true
                    })
                  } else if (col === 'Route') {
                    rowCells.push({
                      key: 'Route',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.Route : customer.Route,
                      onChange: (e) => setEditFormData({...editFormData, Route: e.target.value})
                    })
                  } else if (col === 'Notes') {
                    rowCells.push({
                      key: 'Notes',
                      isEdit: editingCustomerId === customer.id,
                      value: editingCustomerId === customer.id ? editFormData.Notes : customer.Notes,
                      onChange: (e) => setEditFormData({...editFormData, Notes: e.target.value})
                    })
                  } else if (col === 'Actions') {
                    rowCells.push({
                      key: 'Actions',
                      isActions: true,
                      customerId: customer.id
                    })
                  }
                })
                
                return (
                  <tr
                    key={customer.id}
                    className="customer-row"
                    onClick={(e) => {
                      // Ignore clicks originating from the actions dropdown
                      if (e.target.closest('.actions-dropdown')) return
                      setSelectedCustomer(customer)
                      setShowCustomerModal(true)
                    }}
                  >
                    {rowCells.map((cell) => (
                      <td key={cell.key} data-label={cell.key} className="customer-cell">
                        {cell.isActions ? (
                          <div className="actions-dropdown" onClick={(ev) => ev.stopPropagation()}>
                            <button
                              className="actions-dropdown-btn"
                              ref={(el) => {if (el) dropdownRefs.current[customer.id] = el}}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleActionDropdown(customer.id, e.currentTarget)
                              }}
                            >
                              ⋮
                            </button>
                            {expandedActionRows[customer.id] && (
                              <div 
                                className="actions-dropdown-menu-inline"
                                style={{
                                  top: dropdownPositions[customer.id]?.top || '0px',
                                  left: dropdownPositions[customer.id]?.left || '0px'
                                }}
                              >
                                {editingCustomerId === customer.id ? (
                                  <>
                                    <button
                                      className="save-btn"
                                      onClick={() => {
                                        handleSaveEdit(customer.id)
                                        setExpandedActionRows(prev => ({...prev, [customer.id]: false}))
                                      }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      className="cancel-btn"
                                      onClick={() => {
                                        setEditingCustomerId(null)
                                        setExpandedActionRows(prev => ({...prev, [customer.id]: false}))
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {reminderLetter && (
                                      <button
                                        className="reminder-btn"
                                        onClick={() => sendReminderMessage(customer)}
                                      >
                                        Pay Reminder
                                      </button>
                                    )}
                                    <button
                                      className="paid-btn"
                                      onClick={() => handleMarkAsPaid(customer.id)}
                                    >
                                      Mark as Paid
                                    </button>
                                    <button
                                      className="change-price-btn"
                                      onClick={() => {
                                        setSelectedCustomer(customer)
                                        handleOpenChangePrice(customer.id)
                                        setExpandedActionRows(prev => ({...prev, [customer.id]: false}))
                                      }}
                                    >
                                      Change Price
                                    </button>
                                    <button
                                      className="invoice-btn"
                                      onClick={() => {
                                        setInvoiceModal({ show: true, customer })
                                        setExpandedActionRows(prev => ({...prev, [customer.id]: false}))
                                      }}
                                    >
                                      Create Invoice
                                    </button>
                                    <button
                                      className="delete-btn"
                                      onClick={() => deleteCustomer(customer.id)}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ) : cell.isEditAddress ? (
                          <div style={{ display: 'grid', gap: '6px', minWidth: '200px' }}>
                            <input
                              type="text"
                              value={editFormData.Address}
                              onChange={(e) => setEditFormData({...editFormData, Address: e.target.value})}
                              className="edit-input"
                              placeholder="Address"
                            />
                            <input
                              type="text"
                              value={editFormData.Address2}
                              onChange={(e) => setEditFormData({...editFormData, Address2: e.target.value})}
                              className="edit-input"
                              placeholder="Address 2"
                            />
                            <input
                              type="text"
                              value={editFormData.Address3}
                              onChange={(e) => setEditFormData({...editFormData, Address3: e.target.value})}
                              className="edit-input"
                              placeholder="Address 3"
                            />
                            <input
                              type="text"
                              value={editFormData.Postcode}
                              onChange={(e) => setEditFormData({...editFormData, Postcode: e.target.value})}
                              className="edit-input"
                              placeholder="Postcode"
                            />
                          </div>
                        ) : cell.isEdit ? (
                          <input
                            type={cell.type || 'text'}
                            value={cell.value}
                            onChange={cell.onChange}
                            className="edit-input"
                            placeholder={cell.type === 'tel' ? 'Phone' : undefined}
                          />
                        ) : (
                          cell.isOutstanding ? formatCurrency(cell.value, user.SettingsCountry || 'United Kingdom') : 
                          cell.isDateField ? formatDateByCountry(cell.value, user.SettingsCountry || 'United Kingdom') : 
                          cell.value
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCustomerModal && selectedCustomer && (
        <div className="modal-overlay customer-details-overlay" onClick={() => { setShowCustomerModal(false); setIsEditingModal(false); setShowServices(false); setShowHistory(false); }}>
          <div
            className="modal-content customer-modal-main"
            style={{
              width: 'min(96vw, 820px)',
              maxWidth: '820px',
              maxHeight: '88vh',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '1rem 1.25rem',
              boxSizing: 'border-box'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => { setShowCustomerModal(false); setIsEditingModal(false); setShowServices(false); setShowHistory(false); }}>×</button>
            <h3>{showHistory ? 'Customer History' : showServices ? 'Customer Services' : 'Customer Details'}</h3>
            
            <div
              className="modal-actions customer-modal-actions"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1rem',
                paddingBottom: '0.9rem',
                borderBottom: '1px solid rgba(21, 101, 192, 0.2)'
              }}
            >
              {isEditingModal ? (
                <>
                  <button className="modal-save-btn customer-modal-action-btn" style={{ minWidth: '88px' }} onClick={handleModalSave}>Save</button>
                  <button className="modal-cancel-btn customer-modal-action-btn" style={{ minWidth: '88px' }} onClick={() => setIsEditingModal(false)}>Cancel</button>
                </>
              ) : (
                <>
                  {!showServices && !showHistory && <button className="modal-edit-btn customer-modal-action-btn" style={{ minWidth: '88px' }} onClick={() => { setIsEditingModal(true); setModalEditData({...selectedCustomer}); setPreferredDaysSelected(parsePreferredDays(selectedCustomer.PrefferedDays)); }}>Edit</button>}
                  <button className="modal-services-btn customer-modal-action-btn" style={{ minWidth: '96px' }} onClick={() => { setShowServices(!showServices); setShowHistory(false); if (!showServices) fetchCustomerServices(selectedCustomer.id); }}>{showServices ? 'Customer Details' : 'Services'}</button>
                  <button className="modal-history-btn customer-modal-action-btn" style={{ minWidth: '96px' }} onClick={() => { setShowHistory(!showHistory); setShowServices(false); if (!showHistory) fetchCustomerHistory(selectedCustomer.id); }}>{showHistory ? 'Customer Details' : 'History'}</button>
                </>
              )}
            </div>
            
            {!showServices && !showHistory ? (
              // Customer Details View
              isEditingModal ? (
                <div className="details-grid-edit customer-edit-form">
                  <div className="full-width customer-edit-field">
                    <label className="customer-edit-label">Name</label>
                    <input type="text" value={modalEditData.CustomerName} onChange={(e) => setModalEditData({...modalEditData, CustomerName: e.target.value})} className="modal-input" />
                  </div>
                  <div className="full-width address-section customer-edit-field">
                    <label className="customer-edit-label">Address</label>
                    <input type="text" value={modalEditData.Address} onChange={(e) => setModalEditData({...modalEditData, Address: e.target.value})} className="modal-input" placeholder="Address Line 1" />
                    <input type="text" value={modalEditData.Address2} onChange={(e) => setModalEditData({...modalEditData, Address2: e.target.value})} className="modal-input" placeholder="Address Line 2" />
                    <input type="text" value={modalEditData.Address3} onChange={(e) => setModalEditData({...modalEditData, Address3: e.target.value})} className="modal-input" placeholder="Address Line 3" />
                  </div>
                  <div className="customer-edit-field">
                    <label className="customer-edit-label">Postcode</label>
                    <input type="text" value={modalEditData.Postcode} onChange={(e) => setModalEditData({...modalEditData, Postcode: e.target.value})} className="modal-input" />
                  </div>
                  <div className="customer-edit-field">
                    <label className="customer-edit-label">Phone</label>
                    <input type="tel" value={modalEditData.PhoneNumber} onChange={(e) => setModalEditData({...modalEditData, PhoneNumber: e.target.value})} className="modal-input" />
                  </div>
                  <div className="customer-edit-field">
                    <label className="customer-edit-label">Email</label>
                    <input type="email" value={modalEditData.EmailAddress} onChange={(e) => setModalEditData({...modalEditData, EmailAddress: e.target.value})} className="modal-input" />
                  </div>
                  <div className="customer-edit-field">
                    <label className="customer-edit-label">Route</label>
                    <input type="text" value={modalEditData.Route} onChange={(e) => setModalEditData({...modalEditData, Route: e.target.value})} className="modal-input" />
                  </div>
                  <div className="inline-fields full-width">
                    <div className="inline-field customer-edit-field">
                      <label className="customer-edit-label">Price</label>
                      <input type="number" value={modalEditData.Price} onChange={(e) => setModalEditData({...modalEditData, Price: e.target.value})} className="modal-input" />
                    </div>
                    <div className="inline-field customer-edit-field">
                      <label className="customer-edit-label">Weeks</label>
                      <input type="number" value={modalEditData.Weeks} onChange={(e) => setModalEditData({...modalEditData, Weeks: e.target.value})} className="modal-input" />
                    </div>
                  </div>
                  <div className="customer-edit-field">
                    <label className="customer-edit-label">Next Clean</label>
                    <input type="date" value={modalEditData.NextClean} onChange={(e) => setModalEditData({...modalEditData, NextClean: e.target.value})} className="modal-input" />
                  </div>
                  <div className="customer-edit-field">
                    <label className="customer-edit-label">Outstanding</label>
                    <input type="number" value={modalEditData.Outstanding} onChange={(e) => setModalEditData({...modalEditData, Outstanding: e.target.value})} className="modal-input" />
                  </div>
                  <div className="customer-edit-field customer-edit-checkbox full-width">
                    <label className="customer-edit-label">VAT Registered</label>
                    <input type="checkbox" checked={modalEditData.VAT || false} onChange={(e) => setModalEditData({...modalEditData, VAT: e.target.checked})} />
                  </div>
                  <div className="full-width customer-edit-field">
                    <label className="customer-edit-label">Preferred Days</label>
                    <div className="days-checkboxes">
                      {daysOfWeek.map((day, index) => (
                        <label key={day} className="day-checkbox-item">
                          <input 
                            type="checkbox" 
                            checked={preferredDaysSelected[day] || false}
                            onChange={(e) => setPreferredDaysSelected({...preferredDaysSelected, [day]: e.target.checked})}
                            style={{ cursor: 'pointer' }}
                          />
                          {dayShortcuts[index]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="full-width customer-edit-field">
                    <label className="customer-edit-label">Notes</label>
                    <textarea value={modalEditData.Notes} onChange={(e) => { setModalEditData({...modalEditData, Notes: e.target.value}); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }} className="modal-input" style={{ minHeight: '40px', maxHeight: '200px', overflow: 'hidden', resize: 'none' }} />
                  </div>
                </div>
              ) : (
                <>
                <div className="details-grid">
                  <div><strong>Name:</strong> {selectedCustomer.CustomerName}</div>
                  <div><strong>Address:</strong> {getFullAddress(selectedCustomer)}</div>
                  <div><strong>Phone:</strong> {selectedCustomer.PhoneNumber || '—'}</div>
                  <div><strong>Email:</strong> {selectedCustomer.EmailAddress || '—'}</div>
                  <div><strong>Price:</strong> {formatCurrency(selectedCustomer.Price, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Weeks:</strong> {selectedCustomer.Weeks}</div>
                  <div><strong>Next Clean:</strong> {formatDateByCountry(selectedCustomer.NextClean, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Outstanding:</strong> {formatCurrency(selectedCustomer.Outstanding, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Route:</strong> {selectedCustomer.Route || '—'}</div>
                  <div><strong>VAT Registered:</strong> {selectedCustomer.VAT ? 'Yes' : 'No'}</div>
                  <div className="full-width"><strong>Preferred Days:</strong> {selectedCustomer.PrefferedDays || '—'}</div>
                  <div className="full-width"><strong>Notes:</strong> <div className="notes-display">{selectedCustomer.Notes || '—'}</div></div>
                </div>
                <button 
                  className="cancel-service-btn"
                  onClick={() => setCancelServiceModal({ show: true, reason: '' })}
                  title="Cancel this customer's service"
                >
                  Cancel Service
                </button>
                </>
              )
            ) : showHistory ? (

              // History View

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

              // Services View
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
                                  <button onClick={() => { handleAddToNextClean(service); setServiceDropdownOpen(null); }}>Add to Next Clean</button>
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

      {cancelServiceModal.show && selectedCustomer && (
        <div className="modal-overlay simple-modal-overlay" onClick={() => setCancelServiceModal({ show: false, reason: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel Service</h3>
            <div className="modal-form">
              <label htmlFor="cancelReason">Reason for Cancelation:</label>
              <textarea
                id="cancelReason"
                value={cancelServiceModal.reason}
                onChange={(e) => setCancelServiceModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason (optional)"
                rows="4"
              />
            </div>
            <div className="modal-buttons">
              <button 
                onClick={() => handleCancelService(cancelServiceModal.reason)}
                className="modal-ok-btn"
              >
                OK
              </button>
              <button 
                onClick={() => setCancelServiceModal({ show: false, reason: '' })}
                className="modal-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {changePriceModal.show && selectedCustomer && (
        <div className="modal-overlay simple-modal-overlay" onClick={() => setChangePriceModal({ show: false, price: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Change Price</h3>
            <div className="modal-form">
              <label htmlFor="newPrice">New Price:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                  {getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol}
                </span>
                <input
                  id="newPrice"
                  type="number"
                  step="0.01"
                  value={changePriceModal.price}
                  onChange={(e) => setChangePriceModal(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="Enter new price"
                />
              </div>
            </div>
            <div className="modal-buttons">
              <button 
                onClick={handleSaveChangePrice}
                className="modal-ok-btn"
              >
                Save
              </button>
              <button 
                onClick={() => setChangePriceModal({ show: false, price: '' })}
                className="modal-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal.show && invoiceModal.customer && (
        <InvoiceModalContent 
          user={user}
          customer={invoiceModal.customer}
          onClose={() => setInvoiceModal({ show: false, customer: null })}
        />
      )}

      {showCSVImportModal && (
        <div className="modal-overlay simple-modal-overlay" onClick={() => setShowCSVImportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCSVImportModal(false)}>×</button>
            <h3>CSV Import Instructions</h3>
            <div style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>
              <p><strong>Required columns (can be in any order):</strong></p>
              <ol style={{ marginLeft: '1.5rem' }}>
                <li>Customer Name</li>
                <li>Address</li>
                <li>Price</li>
              </ol>
              <p><strong>Optional columns:</strong></p>
              <ol style={{ marginLeft: '1.5rem' }}>
                <li>Phone Number</li>
                <li>Weeks for clean (e.g., 4, 6, etc)</li>
                <li>Next Clean date</li>
                <li>Outstanding Amount</li>
                <li>Route</li>
                <li>Notes</li>
                <li>Email Address</li>
              </ol>
              <p><strong>Extra services via Notes:</strong> put <strong>Services:</strong> followed by service and price pairs, separated by semicolons.</p>
              <p><strong>Important:</strong> put <strong>Services:</strong> at the end of the Notes text. Anything after <strong>Services:</strong> is used for CustomerPrices and is not saved in the customer Notes field.</p>
              <p>Example: <strong>Services: Gutters - 25; Conservatory Roof - 35</strong></p>
            </div>
            <div className="modal-buttons">
              <button 
                type="button"
                className="modal-ok-btn" 
                onClick={() => {
                  setShowCSVImportModal(false)
                  setTimeout(() => csvFileInputRef.current?.click(), 0)
                }}
              >
                OK
              </button>
              <button 
                type="button"
                className="modal-cancel-btn" 
                onClick={() => setShowCSVImportModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default CustomerList
