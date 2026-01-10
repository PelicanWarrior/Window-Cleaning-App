import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import './CustomerList.css'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'

function CustomerList({ user }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState(user.CustomerSort || 'Route')
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

  // Get column order with Actions first, then sorted column
  const getColumnOrder = () => {
    const allColumns = ['Name', 'Address', 'Contact Details', 'Price', 'Weeks', 'Next Clean', 'Outstanding', 'Route', 'Notes']
    const columnFieldMap = {
      'Next Clean': 'Next Clean',
      'Route': 'Route',
      'Outstanding': 'Outstanding',
      'Customer Name': 'Name',
      'Address': 'Address'
    }
    
    if (sortedColumn) {
      const sortedColumnDisplay = columnFieldMap[sortedColumn] || sortedColumn
      const filtered = allColumns.filter(col => col !== sortedColumnDisplay)
      return ['Actions', sortedColumnDisplay, ...filtered]
    }
    return ['Actions', ...allColumns]
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
      // Opening a new dropdown - close all others first
      if (buttonRef) {
        const rect = buttonRef.getBoundingClientRect()
        setDropdownPositions({
          [customerId]: {
            top: rect.bottom + window.scrollY + 4,
            left: rect.left
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

  async function handleMarkAsPaid(customerId) {
    try {
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
          <span>Sort by:</span>
          <button 
            className={sortBy === 'Next Clean' ? 'active' : ''}
            onClick={() => handleSortChange('Next Clean')}
          >
            Next Clean
          </button>
          <button 
            className={sortBy === 'Route' ? 'active' : ''}
            onClick={() => handleSortChange('Route')}
          >
            Route
          </button>
          <button 
            className={sortBy === 'Outstanding' ? 'active' : ''}
            onClick={() => handleSortChange('Outstanding')}
          >
            Outstanding
          </button>
          <button 
            className={sortBy === 'Customer Name' ? 'active' : ''}
            onClick={() => handleSortChange('Customer Name')}
          >
            Customer Name
          </button>
          <button 
            className={sortBy === 'Address' ? 'active' : ''}
            onClick={() => handleSortChange('Address')}
          >
            Address
          </button>
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
                  <tr key={customer.id}>
                    {rowCells.map((cell) => (
                      <td key={cell.key}>
                        {cell.isActions ? (
                          <div className="actions-dropdown">
                            <button
                              className="actions-dropdown-btn"
                              ref={(el) => {if (el) dropdownRefs.current[customer.id] = el}}
                              onClick={(e) => toggleActionDropdown(customer.id, e.currentTarget)}
                            >
                              ⋮
                            </button>
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

      {/* Render all dropdown menus at root level to avoid z-index issues */}
      {customers.map((customer) => (
        expandedActionRows[customer.id] && dropdownPositions[customer.id] && (
          <div 
            key={customer.id}
            className="actions-dropdown-menu"
            style={{
              position: 'fixed',
              top: `${dropdownPositions[customer.id].top}px`,
              left: `${dropdownPositions[customer.id].left}px`,
              zIndex: 100001
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
                  className="edit-btn"
                  onClick={() => {
                    handleEditCustomer(customer)
                  }}
                >
                  Edit
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
        )
      ))}
    </div>
  )
}

export default CustomerList
