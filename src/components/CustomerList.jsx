import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import './CustomerList.css'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'

function CustomerList({ user }) {
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
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [editServiceData, setEditServiceData] = useState({})
  const [showHistory, setShowHistory] = useState(false)
  const [customerHistory, setCustomerHistory] = useState([])
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
    Notes: ''
  })

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

  const sendReminderMessage = (customer) => {
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
    try {
      const customerData = {
        ...newCustomer,
        UserId: user.id,
        Price: parseInt(newCustomer.Price) || 0,
        Weeks: parseInt(newCustomer.Weeks) || 4,
        Outstanding: 0,
        NextClean: new Date(Date.now() + (parseInt(newCustomer.Weeks) || 4) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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
            Price: parseInt(newCustomer.Price) || 0,
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
          Price: parseInt(editFormData.Price) || 0,
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
          Notes: modalEditData.Notes
        })
        .eq('id', selectedCustomer.id)
      
      if (error) throw error
      
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
      const historyMessage = `Outstanding mark as paid`
      
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
      const customersToImport = []
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const values = parseCSVLine(line)
        
        const weeks = parseInt(values[headers.indexOf('Weeks')]) || 4
        const nextCleanValue = values[headers.indexOf('NextClean')]
        const outstandingValue = values[headers.indexOf('Outstanding')]
        
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
          CustomerName: values[headers.indexOf('CustomerName')] || '',
          Address: values[headers.indexOf('Address')] || '',
          Address2: values[headers.indexOf('Address2')] || '',
          Address3: values[headers.indexOf('Address3')] || '',
          Postcode: values[headers.indexOf('Postcode')] || '',
          PhoneNumber: values[headers.indexOf('PhoneNumber')] || '',
          EmailAddress: values[headers.indexOf('EmailAddress')] || '',
          Price: parseInt(values[headers.indexOf('Price')]) || 0,
          Weeks: weeks,
          Route: values[headers.indexOf('Route')] || '',
          Notes: values[headers.indexOf('Notes')] || '',
          Outstanding: outstandingValue ? parseFloat(outstandingValue) : 0,
          NextClean: nextCleanDate
        }
        
        if (customer.Address) {
          customersToImport.push(customer)
        }
      }

      if (customersToImport.length === 0) {
        alert('No valid customers found in CSV file')
        return
      }

      const { data: insertedCustomers, error } = await supabase
        .from('Customers')
        .insert(customersToImport)
        .select()
      
      if (error) throw error
      
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
      alert('Error importing CSV: ' + error.message)
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
          <button className="add-customer-btn" onClick={() => setShowAddForm(true)}>
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
            <label className="csv-import-btn">
              📄 Import via CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                style={{ display: 'none' }}
              />
            </label>
          </div>
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
              placeholder="Route"
              value={newCustomer.Route}
              onChange={(e) => setNewCustomer({...newCustomer, Route: e.target.value})}
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
        <div className="modal-overlay" onClick={() => { setShowCustomerModal(false); setIsEditingModal(false); setShowServices(false); setShowHistory(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowCustomerModal(false); setIsEditingModal(false); setShowServices(false); setShowHistory(false); }}>×</button>
            <h3>{showHistory ? 'Customer History' : showServices ? 'Customer Services' : 'Customer Details'}</h3>
            
            <div className="modal-actions">
              {isEditingModal ? (
                <>
                  <button className="modal-save-btn" onClick={handleModalSave}>Save</button>
                  <button className="modal-cancel-btn" onClick={() => setIsEditingModal(false)}>Cancel</button>
                </>
              ) : (
                <>
                  {!showServices && !showHistory && <button className="modal-edit-btn" onClick={() => { setIsEditingModal(true); setModalEditData({...selectedCustomer}); }}>Edit</button>}
                  <button className="modal-services-btn" onClick={() => { setShowServices(!showServices); setShowHistory(false); if (!showServices) fetchCustomerServices(selectedCustomer.id); }}>{showServices ? 'Customer Details' : 'Services'}</button>
                  <button className="modal-history-btn" onClick={() => { setShowHistory(!showHistory); setShowServices(false); if (!showHistory) fetchCustomerHistory(selectedCustomer.id); }}>{showHistory ? 'Customer Details' : 'History'}</button>
                </>
              )}
            </div>
            
            {!showServices && !showHistory ? (
              // Customer Details View
              isEditingModal ? (
                <div className="details-grid">
                  <div><strong>Name:</strong> <input type="text" value={modalEditData.CustomerName} onChange={(e) => setModalEditData({...modalEditData, CustomerName: e.target.value})} className="modal-input" /></div>
                  <div><strong>Address:</strong> <input type="text" value={modalEditData.Address} onChange={(e) => setModalEditData({...modalEditData, Address: e.target.value})} className="modal-input" /></div>
                  <div><strong>Address 2:</strong> <input type="text" value={modalEditData.Address2} onChange={(e) => setModalEditData({...modalEditData, Address2: e.target.value})} className="modal-input" /></div>
                  <div><strong>Address 3:</strong> <input type="text" value={modalEditData.Address3} onChange={(e) => setModalEditData({...modalEditData, Address3: e.target.value})} className="modal-input" /></div>
                  <div><strong>Postcode:</strong> <input type="text" value={modalEditData.Postcode} onChange={(e) => setModalEditData({...modalEditData, Postcode: e.target.value})} className="modal-input" /></div>
                  <div><strong>Phone:</strong> <input type="tel" value={modalEditData.PhoneNumber} onChange={(e) => setModalEditData({...modalEditData, PhoneNumber: e.target.value})} className="modal-input" /></div>
                  <div><strong>Email:</strong> <input type="email" value={modalEditData.EmailAddress} onChange={(e) => setModalEditData({...modalEditData, EmailAddress: e.target.value})} className="modal-input" /></div>
                  <div><strong>Price:</strong> <input type="number" value={modalEditData.Price} onChange={(e) => setModalEditData({...modalEditData, Price: e.target.value})} className="modal-input" /></div>
                  <div><strong>Weeks:</strong> <input type="number" value={modalEditData.Weeks} onChange={(e) => setModalEditData({...modalEditData, Weeks: e.target.value})} className="modal-input" /></div>
                  <div><strong>Next Clean:</strong> <input type="date" value={modalEditData.NextClean} onChange={(e) => setModalEditData({...modalEditData, NextClean: e.target.value})} className="modal-input" /></div>
                  <div><strong>Outstanding:</strong> <input type="number" value={modalEditData.Outstanding} onChange={(e) => setModalEditData({...modalEditData, Outstanding: e.target.value})} className="modal-input" /></div>
                  <div><strong>Route:</strong> <input type="text" value={modalEditData.Route} onChange={(e) => setModalEditData({...modalEditData, Route: e.target.value})} className="modal-input" /></div>
                  <div style={{gridColumn: '1 / -1'}}><strong>Notes:</strong> <textarea value={modalEditData.Notes} onChange={(e) => setModalEditData({...modalEditData, Notes: e.target.value})} className="modal-input" rows="3" /></div>
                </div>
              ) : (
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
                  <div className="notes-cell"><strong>Notes:</strong> {selectedCustomer.Notes || '—'}</div>
                </div>
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
                                <div className="service-actions-dropdown">
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
    </div>
  )
}

export default CustomerList
