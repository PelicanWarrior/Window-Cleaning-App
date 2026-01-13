import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './WorkloadManager.css'
import { formatCurrency, getCurrencyConfig } from '../lib/format'

function WorkloadManager({ user }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [customers, setCustomers] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [messageFooter, setMessageFooter] = useState('')
  const [selectedLetters, setSelectedLetters] = useState({})
  const [selectedLetterAll, setSelectedLetterAll] = useState('')
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([])
  const [activeView, setActiveView] = useState('Calendar')
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedDatePickers, setExpandedDatePickers] = useState({})
  const [bulkDatePickerOpen, setBulkDatePickerOpen] = useState(false)
  const [customerPayLetter, setCustomerPayLetter] = useState(null)
  const [userRouteOrder, setUserRouteOrder] = useState('')
  const [orderedCustomers, setOrderedCustomers] = useState([])
  const [draggedCustomerId, setDraggedCustomerId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [calendarCollapsed, setCalendarCollapsed] = useState(false)
  const [editingPriceCustomerId, setEditingPriceCustomerId] = useState(null)
  const [editingPriceValue, setEditingPriceValue] = useState('')
  const [mobileMenuOpenCustomerId, setMobileMenuOpenCustomerId] = useState(null)

  const getFullAddress = (customer) => {
    const parts = [
      customer.Address || '',
      customer.Address2 || '',
      customer.Address3 || '',
      customer.Postcode || ''
    ].filter(Boolean)
    return parts.join(', ')
  }

  const getAdditionalServices = (customer) => {
    if (!customer.NextServices) return ''
    const services = customer.NextServices.split(',').map(s => s.trim())
    const additionalServices = services.filter(s => s !== 'Windows')
    return additionalServices.length > 0 ? ` (Inc ${additionalServices.join(', ')})` : ''
  }

  useEffect(() => {
    fetchCustomers()
    fetchMessagesAndFooter()
    fetchCalendarView()
    fetchCustomerPayLetter()
    fetchAndInitializeUserRouteOrder()
    fetchCalendarDate()
  }, [user])

  useEffect(() => {
    setSelectedLetterAll('')
  }, [selectedDate, currentDate])

  useEffect(() => {
    setSelectedCustomerIds([])
  }, [selectedDate, currentDate])

  // Fetch and initialize user route order from Users table
  async function fetchAndInitializeUserRouteOrder() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('RouteOrder')
        .eq('id', user.id)
        .single()

      if (error) throw error

      let routeOrderStr = data?.RouteOrder || ''

      // Ensure all current customers are in RouteOrder
      const { data: customersData } = await supabase
        .from('Customers')
        .select('id')
        .eq('UserId', user.id)

      if (customersData) {
        const existingIds = new Set(
          routeOrderStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
        )
        const allCustomerIds = customersData.map(c => c.id)
        const missingIds = allCustomerIds.filter(id => !existingIds.has(id))

        if (missingIds.length > 0) {
          routeOrderStr = routeOrderStr
            ? `${routeOrderStr},${missingIds.join(',')}`
            : missingIds.join(',')

          // Update Users table with new RouteOrder
          const { error: updateError } = await supabase
            .from('Users')
            .update({ RouteOrder: routeOrderStr })
            .eq('id', user.id)
          if (updateError) throw updateError
        }
      }

      setUserRouteOrder(routeOrderStr)
    } catch (error) {
      console.error('Error fetching/initializing route order:', error.message)
    }
  }

  // Derive ordered customers for a specific day based on user's RouteOrder
  const getOrderedCustomersForDate = (day) => {
    const dayCustomers = getCustomersForDate(day)
    if (!userRouteOrder || dayCustomers.length === 0) {
      return dayCustomers
    }

    const idToCustomer = new Map(dayCustomers.map(c => [c.id, c]))
    const routeIds = userRouteOrder.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id))

    // In-order customers from route
    const orderedFromRoute = routeIds
      .map(id => idToCustomer.get(id))
      .filter(Boolean)

    // Append any remaining customers not included in route
    const remaining = dayCustomers.filter(c => !routeIds.includes(c.id))
    return [...orderedFromRoute, ...remaining]
  }

  // Derive ordered customers for selected date based on user's RouteOrder
  const deriveOrderedCustomers = () => {
    if (!selectedDate) {
      setOrderedCustomers([])
      return
    }

    const dayCustomers = getCustomersForDate(selectedDate)
    if (!userRouteOrder) {
      setOrderedCustomers(dayCustomers)
      return
    }

    const idToCustomer = new Map(dayCustomers.map(c => [c.id, c]))
    const routeIds = userRouteOrder.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id))

    // In-order customers from route
    const orderedFromRoute = routeIds
      .map(id => idToCustomer.get(id))
      .filter(Boolean)

    // Append any remaining customers not included in route
    const remaining = dayCustomers.filter(c => !routeIds.includes(c.id))
    setOrderedCustomers([...orderedFromRoute, ...remaining])
  }

  // Recompute orderedCustomers whenever customers, userRouteOrder, or selectedDate change
  useEffect(() => {
    deriveOrderedCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, userRouteOrder, selectedDate])

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .from('Customers')
        .select('*')
        .eq('UserId', user.id)
        .order('NextClean', { ascending: true })
      
      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessagesAndFooter() {
    try {
      const [{ data: messagesData, error: messagesError }, { data: userData, error: userError }] = await Promise.all([
        supabase
          .from('Messages')
          .select('*')
          .eq('UserId', user.id)
          .order('MessageTitle', { ascending: true }),
        supabase
          .from('Users')
          .select('MessageFooter')
          .eq('id', user.id)
          .single()
      ])

      if (messagesError) throw messagesError
      if (userError) throw userError

      setMessages(messagesData || [])
      setMessageFooter(userData?.MessageFooter || '')
    } catch (error) {
      console.error('Error fetching messages/footer:', error.message)
    }
  }

  async function fetchCalendarView() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderView')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setActiveView(data?.CalenderView || 'Calendar')
    } catch (error) {
      console.error('Error fetching calendar view:', error.message)
      setActiveView('Calendar')
    }
  }

  async function fetchCustomerPayLetter() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CustomerPayLetter')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setCustomerPayLetter(data?.CustomerPayLetter || null)
    } catch (error) {
      console.error('Error fetching customer pay letter:', error.message)
    }
  }

  async function fetchCalendarDate() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderDate')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      if (data?.CalenderDate) {
        const savedDate = new Date(data.CalenderDate)
        setCurrentDate(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1))
        setSelectedDate(savedDate.getDate())
      } else {
        // If no saved date, use today
        setSelectedDate(new Date().getDate())
      }
    } catch (error) {
      console.error('Error fetching calendar date:', error.message)
      setSelectedDate(new Date().getDate())
    }
  }

  async function updateCalendarView(view) {
    setActiveView(view)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CalenderView: view })
        .eq('id', user.id)

      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar view:', error.message)
    }
  }

  // Get the first day of the month
  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }

  // Get the last day of the month
  const getLastDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
  }

  // Get days in month
  const getDaysInMonth = (date) => {
    return getLastDayOfMonth(date).getDate()
  }

  // Get the day of week for the first day (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfWeek = (date) => {
    return getFirstDayOfMonth(date).getDay()
  }

  // Change to previous month
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  // Change to next month
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  // Check if a date has any customers scheduled
  const hasCustomersOnDate = (day) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0]
    return customers.some(customer => {
      if (!customer.NextClean) return false
      const nextCleanDate = new Date(customer.NextClean).toISOString().split('T')[0]
      return nextCleanDate === dateStr
    })
  }

  // Get customers for a specific date
  const getCustomersForDate = (day) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0]
    return customers.filter(customer => {
      if (!customer.NextClean) return false
      const nextCleanDate = new Date(customer.NextClean).toISOString().split('T')[0]
      return nextCleanDate === dateStr
    })
  }

  // Handle day click
  const handleDayClick = async (day) => {
    setSelectedDate(day)
    
    // Save the selected date to CalenderDate in Users table
    try {
      const selectedDateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0]
      const { error } = await supabase
        .from('Users')
        .update({ CalenderDate: selectedDateStr })
        .eq('id', user.id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar date:', error.message)
    }
  }

  // Sync customer price from CustomerPrices and update NextServices
  const syncCustomerPriceAndServices = async (customerId) => {
    try {
      // Fetch Windows service price from CustomerPrices
      const { data: priceData, error: priceError } = await supabase
        .from('CustomerPrices')
        .select('Price')
        .eq('CustomerID', customerId)
        .eq('Service', 'Windows')
        .single()

      if (priceError && priceError.code !== 'PGRST116') throw priceError

      // Build update object
      const updateObj = { NextServices: 'Windows' }
      if (priceData) {
        updateObj.Price = priceData.Price
      }

      console.log('Updating customer', customerId, 'with:', updateObj)

      // Update customer with NextServices (and Price if available)
      const { error: updateError } = await supabase
        .from('Customers')
        .update(updateObj)
        .eq('id', customerId)

      if (updateError) {
        console.error('Update error:', updateError)
        throw updateError
      }
      
      console.log('Update successful, refreshing customers')
      // Refresh customers list
      await fetchCustomers()
    } catch (error) {
      console.error('Error syncing customer price:', error)
    }
  }

  // Create a customer history record
  const createCustomerHistory = async (customerId, message) => {
    try {
      const { error } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: customerId,
          Message: message
        })
      
      if (error) throw error
    } catch (error) {
      console.error('Error creating customer history:', error)
    }
  }

  // Handle Done and Paid
  const handleDoneAndPaid = async (customer) => {
    try {
      const currentWorkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate)
      const weeksToAdd = parseInt(customer.Weeks) || 0
      const nextCleanDate = new Date(currentWorkDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      
      // Create history record first
      const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const historyMessage = `${customer.NextServices} done, Paid ${symbol}${customer.Price}`
      await createCustomerHistory(customer.id, historyMessage)
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: nextCleanDate.toISOString().split('T')[0]
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      fetchCustomers()

      // Check if CustomerPayLetter is set and ask to send message
      if (customerPayLetter) {
        const paymentMessage = messages.find((m) => String(m.id) === String(customerPayLetter))
        if (paymentMessage) {
          const shouldSend = window.confirm(`Send message "${paymentMessage.MessageTitle}" to ${customer.CustomerName}?`)
          if (shouldSend) {
            sendPaymentMessage(customer, paymentMessage)
          }
        }
      }
      
      // Always sync price and services after marking as done
      await syncCustomerPriceAndServices(customer.id)
    } catch (error) {
      console.error('Error updating customer:', error.message)
    }
  }

  // Handle Done and Not Paid
  const handleDoneAndNotPaid = async (customer) => {
    try {
      const currentWorkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate)
      const weeksToAdd = parseInt(customer.Weeks) || 0
      const nextCleanDate = new Date(currentWorkDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      
      // Create history record first
      const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const historyMessage = `${customer.NextServices} done, Not Paid ${symbol}${customer.Price}`
      await createCustomerHistory(customer.id, historyMessage)
      
      const newOutstanding = (parseFloat(customer.Outstanding) || 0) + (parseFloat(customer.Price) || 0)
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: nextCleanDate.toISOString().split('T')[0],
          Outstanding: newOutstanding
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      fetchCustomers()

      // Check if CustomerPayLetter is set and ask to send message
      if (customerPayLetter) {
        const paymentMessage = messages.find((m) => String(m.id) === String(customerPayLetter))
        if (paymentMessage) {
          // Update customer object with new outstanding amount for message
          const updatedCustomer = { ...customer, Outstanding: newOutstanding }
          const shouldSend = window.confirm(`Send message "${paymentMessage.MessageTitle}" to ${customer.CustomerName}?`)
          if (shouldSend) {
            sendPaymentMessage(updatedCustomer, paymentMessage)
          }
        }
      }
      
      // Always sync price and services after marking as done
      await syncCustomerPriceAndServices(customer.id)
    } catch (error) {
      console.error('Error updating customer:', error.message)
    }
  }

  // Update customer price
  const handleUpdatePrice = async (customerId, newPrice) => {
    try {
      const numericPrice = parseFloat(newPrice)
      if (isNaN(numericPrice) || numericPrice < 0) {
        alert('Please enter a valid price')
        return
      }

      const { error } = await supabase
        .from('Customers')
        .update({ Price: numericPrice })
        .eq('id', customerId)

      if (error) throw error

      setEditingPriceCustomerId(null)
      setEditingPriceValue('')
      fetchCustomers()
    } catch (error) {
      console.error('Error updating price:', error.message)
      alert('Failed to update price')
    }
  }

  // Send payment message via WhatsApp
  const sendPaymentMessage = (customer, message) => {
    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    if (!phone) {
      alert('This customer does not have a valid phone number.')
      return
    }

    const formalName = getFormalCustomerName(customer.CustomerName)
    const bodyParts = [`Dear ${formalName}`]
    
    if (message?.Message) {
      let messageContent = message.Message
      // Replace currency placeholder dynamically based on user country
      if (message.IncludePrice) {
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
  }

  // Handle Move Date to specific date
  const handleMoveToDate = async (customer, newDate) => {
    try {
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: newDate
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      setExpandedDatePickers(prev => ({...prev, [customer.id]: false}))
      fetchCustomers()
    } catch (error) {
      console.error('Error moving date:', error.message)
    }
  }

  // Bulk move to specific date
  const handleBulkMoveToDate = async (newDate) => {
    const targetCustomers = selectedCustomerIds.length
      ? selectedDayCustomers.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayCustomers

    if (!targetCustomers.length) return
    try {
      await Promise.all(
        targetCustomers
          .filter((customer) => customer.NextClean)
          .map(async (customer) => {
            const { error } = await supabase
              .from('Customers')
              .update({ NextClean: newDate })
              .eq('id', customer.id)

            if (error) throw error
          })
      )

      setBulkDatePickerOpen(false)
      fetchCustomers()
    } catch (error) {
      console.error('Error bulk moving dates:', error.message)
    }
  }

  // Handle Move Date (legacy - for backwards compatibility if needed)
  const handleMoveDate = async (customer, days) => {
    try {
      const currentNextClean = new Date(customer.NextClean)
      const newNextClean = new Date(currentNextClean)
      newNextClean.setDate(newNextClean.getDate() + days)
      
      await handleMoveToDate(customer, newNextClean.toISOString().split('T')[0])
    } catch (error) {
      console.error('Error moving date:', error.message)
    }
  }

  // Bulk move dates for selected customers (or all if none selected)
  const handleMoveDateBulk = async (days) => {
    const targetCustomers = selectedCustomerIds.length
      ? selectedDayCustomers.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayCustomers

    if (!targetCustomers.length) return
    try {
      await Promise.all(
        targetCustomers
          .filter((customer) => customer.NextClean)
          .map(async (customer) => {
            const currentNextClean = new Date(customer.NextClean)
            const newNextClean = new Date(currentNextClean)
            newNextClean.setDate(newNextClean.getDate() + days)

            const { error } = await supabase
              .from('Customers')
              .update({ NextClean: newNextClean.toISOString().split('T')[0] })
              .eq('id', customer.id)

            if (error) throw error
          })
      )

      fetchCustomers()
    } catch (error) {
      console.error('Error bulk moving dates:', error.message)
    }
  }

  const handleSelectLetter = (customerId, messageId) => {
    setSelectedLetters((prev) => ({ ...prev, [customerId]: messageId }))
  }

  const handleSelectLetterAll = (messageId) => {
    setSelectedLetterAll(messageId)

    const targetCustomers = selectedCustomerIds.length
      ? selectedDayCustomers.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayCustomers

    if (!messageId || !targetCustomers.length) return

    setSelectedLetters((prev) => {
      const updated = { ...prev }
      targetCustomers.forEach((customer) => {
        updated[customer.id] = messageId
      })
      return updated
    })
  }
  const toggleCustomerSelection = (customerId) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    )
  }

  const toggleDatePicker = (customerId) => {
    setExpandedDatePickers((prev) => ({
      ...prev,
      [customerId]: !prev[customerId]
    }))
  }

  const handleDragStart = (e, customerId) => {
    setDraggedCustomerId(customerId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    setDragOverIndex(null)

    if (draggedCustomerId === null) return

    const displayListBase = orderedCustomers.length > 0 ? orderedCustomers : selectedDayCustomers
    const displayList = [...displayListBase]
    const draggedIndex = displayList.findIndex(c => c.id === draggedCustomerId)

    if (draggedIndex === -1 || draggedIndex === dropIndex) {
      setDraggedCustomerId(null)
      return
    }

    // Reorder the list
    const newList = [...displayList]
    const [draggedCustomer] = newList.splice(draggedIndex, 1)
    newList.splice(dropIndex, 0, draggedCustomer)

    // Update orderedCustomers
    setOrderedCustomers(newList)
    
    // Save new order to Users.RouteOrder
    await saveUserRouteOrder(newList)

    setDraggedCustomerId(null)
  }

  const saveUserRouteOrder = async (customerList) => {
    try {
      // Get current full route order
      const currentRouteIds = userRouteOrder.split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id))

      // Get IDs from the reordered list (customers on this day)
      const reorderedIds = customerList.map(c => c.id)
      
      // Remove the reordered customer IDs from the current route
      const otherCustomerIds = currentRouteIds.filter(id => !reorderedIds.includes(id))
      
      // Insert the reordered customers at the position of the first one in the original order
      const firstReorderedId = reorderedIds[0]
      const insertIndex = currentRouteIds.indexOf(firstReorderedId)
      
      let newRouteIds
      if (insertIndex === -1) {
        // If not found, append at the end
        newRouteIds = [...otherCustomerIds, ...reorderedIds]
      } else {
        // Insert at the original position
        newRouteIds = [
          ...otherCustomerIds.slice(0, insertIndex),
          ...reorderedIds,
          ...otherCustomerIds.slice(insertIndex)
        ]
      }

      const newRouteOrderStr = newRouteIds.join(',')

      // Update Users table RouteOrder field
      const { error } = await supabase
        .from('Users')
        .update({ RouteOrder: newRouteOrderStr })
        .eq('id', user.id)
      
      if (error) throw error
      
      setUserRouteOrder(newRouteOrderStr)
    } catch (error) {
      console.error('Error saving route order:', error.message)
      alert('Error saving route order: ' + error.message)
    }
  }

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

  const handleSendWhatsApp = (customer) => {
    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    if (!phone) {
      alert('This customer does not have a valid phone number.')
      return
    }

    if (!messages.length) {
      alert('No letters available. Please create a letter first.')
      return
    }

    const selectedId = selectedLetters[customer.id] ?? messages[0]?.id
    let letter = messages.find((m) => String(m.id) === String(selectedId))
    if (!letter && messages.length) letter = messages[0]
    
    // Create history record
    createCustomerHistory(customer.id, `Message ${letter?.MessageTitle} sent`)

    const formalName = getFormalCustomerName(customer.CustomerName)
    const bodyParts = [`Dear ${formalName}`]
    
    if (letter?.Message) {
      let messageContent = letter.Message
      // Replace currency placeholder dynamically based on user country
      if (letter.IncludePrice) {
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
  }

  // Generate calendar days
  const generateCalendar = () => {
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDayOfWeek = getFirstDayOfWeek(currentDate)
    const days = []

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>)
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const hasWork = hasCustomersOnDate(day)
      const isSelected = selectedDate === day
      
      days.push(
        <div
          key={day}
          className={`calendar-day ${hasWork ? 'has-work' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDayClick(day)}
        >
          <div className="day-number">{day}</div>
          {hasWork && <div className="work-indicator"></div>}
        </div>
      )
    }

    return days
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  if (loading) return <div className="loading">Loading workload...</div>

  const selectedDayCustomers = selectedDate ? getCustomersForDate(selectedDate) : []
  const selectedCustomersForDay = selectedDayCustomers.filter((customer) => selectedCustomerIds.includes(customer.id))
  const hasSelectedCustomers = selectedCustomersForDay.length > 0
  const totalIncome = selectedDayCustomers.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)

  // Route color helper
  const routeColors = [
    '#3498db', '#27ae60', '#9b59b6', '#e67e22', '#e74c3c', '#16a085', '#8e44ad', '#f1c40f'
  ]

  const getRouteStyle = (route) => {
    if (!route) return { backgroundColor: '#bdc3c7', color: '#2c3e50' }
    const index = Math.abs(route.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % routeColors.length
    return { backgroundColor: routeColors[index], color: 'white' }
  }

  // Generate overview calendar with inline customer lists
  const generateOverviewCalendar = () => {
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDayOfWeek = getFirstDayOfWeek(currentDate)
    const days = []

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="overview-day empty"></div>)
    }

    // Add days of the month with customer lists
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCustomers = getOrderedCustomersForDate(day)
      const isExpanded = expandedDays[day]
      const displayCustomers = isExpanded ? dayCustomers : dayCustomers.slice(0, 10)
      const hasMore = dayCustomers.length > 10

      days.push(
        <div key={day} className="overview-day">
          <div className="overview-day-number">{day}</div>
          {dayCustomers.length > 0 && (
            <div className="overview-customer-list">
              {displayCustomers.map((customer) => (
                <div key={customer.id} className="overview-customer-item">
                  <div className="overview-customer-address">{getFullAddress(customer)}</div>
                  <div className="overview-customer-meta">
                    {formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}{getAdditionalServices(customer)} • <span className="overview-route-pill" style={getRouteStyle(customer.Route)}>{customer.Route || 'N/A'}</span>
                  </div>
                </div>
              ))}
              {hasMore && !isExpanded && (
                <button
                  className="show-all-btn"
                  onClick={() => setExpandedDays(prev => ({ ...prev, [day]: true }))}
                >
                  Show all ({dayCustomers.length})
                </button>
              )}
            </div>
          )}
        </div>
      )
    }

    return days
  }

  return (
    <div className="workload-manager">
      <div className="view-tabs">
        <button
          className={`view-tab ${activeView === 'Calendar' ? 'active' : ''}`}
          onClick={() => updateCalendarView('Calendar')}
        >
          Calendar
        </button>
        <button
          className={`view-tab ${activeView === 'Overview' ? 'active' : ''}`}
          onClick={() => updateCalendarView('Overview')}
        >
          Overview
        </button>
      </div>

      <div className="calendar-header">
        <button onClick={previousMonth} className="month-nav-btn">←</button>
        <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
        <button onClick={nextMonth} className="month-nav-btn">→</button>
      </div>

      {activeView === 'Calendar' ? (
        <>
          {!calendarCollapsed && <div className="calendar-grid">
            <div className="calendar-day-header">Sun</div>
            <div className="calendar-day-header">Mon</div>
            <div className="calendar-day-header">Tue</div>
            <div className="calendar-day-header">Wed</div>
            <div className="calendar-day-header">Thu</div>
            <div className="calendar-day-header">Fri</div>
            <div className="calendar-day-header">Sat</div>
            {generateCalendar()}
          </div>}

          <div className="collapse-btn-row">
            <button onClick={() => setCalendarCollapsed(!calendarCollapsed)} className="collapse-btn">
              {calendarCollapsed ? '▼' : '▲'}
            </button>
          </div>

          {selectedDate && (
        <div className="selected-day-customers">
          <h3>
            Jobs for {monthNames[currentDate.getMonth()]} {selectedDate}, {currentDate.getFullYear()}
          </h3>
          <p className="income-total">Income: {formatCurrency(totalIncome, user.SettingsCountry || 'United Kingdom')}</p>
          {selectedDayCustomers.length > 0 && (
            <div className="message-all-section">
              <label className="message-all-label" htmlFor="messageAll">Message to {hasSelectedCustomers ? 'Selected' : 'All'}:</label>
              <select
                id="messageAll"
                value={selectedLetterAll || ''}
                onChange={(e) => handleSelectLetterAll(e.target.value)}
                disabled={!messages.length}
              >
                {!messages.length && <option value="">No letters available</option>}
                {messages.length > 0 && <option value="">Select letter</option>}
                {messages.map((msg) => (
                  <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                ))}
              </select>
            </div>
          )}
          {selectedDayCustomers.length > 0 && (
            <div className="bulk-move-section">
              <span className="bulk-move-label">Move {hasSelectedCustomers ? 'selected' : 'all'} jobs:</span>
              <div className="bulk-date-picker-wrapper">
                <button 
                  onClick={() => setBulkDatePickerOpen(!bulkDatePickerOpen)}
                  className="calendar-icon-btn"
                  title="Pick a date"
                >
                  📅
                </button>
                {bulkDatePickerOpen && (
                  <input
                    type="date"
                    value={new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate).toISOString().split('T')[0]}
                    onChange={(e) => handleBulkMoveToDate(e.target.value)}
                    className="date-picker-input"
                    autoFocus
                  />
                )}
              </div>
            </div>
          )}
          {selectedDayCustomers.length === 0 ? (
            <p className="empty-state">No customers scheduled for this day.</p>
          ) : (
            <div className="customer-list">
              {(orderedCustomers.length > 0 ? orderedCustomers : selectedDayCustomers).map((customer, index) => {
                const isSelected = selectedCustomerIds.includes(customer.id)

                return (
                  <div
                    key={customer.id}
                    className={`customer-row-item ${draggedCustomerId === customer.id ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, customer.id)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    <div className="customer-grid-col drag-col">
                      <div className="drag-handle">⋮⋮</div>
                    </div>

                    <div className="customer-grid-col checkbox-col">
                      <label
                        className="customer-select"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCustomerSelection(customer.id)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                      </label>
                    </div>

                    <div className="customer-grid-col outstanding-col">
                      {customer.Outstanding > 0 && (
                        <span className="outstanding">{formatCurrency(customer.Outstanding, user.SettingsCountry || 'United Kingdom')}</span>
                      )}
                    </div>

                    <div className="customer-grid-col info-col">
                      <div className="customer-address-main">{getFullAddress(customer)}</div>
                      <div className="customer-name-sub">{customer.CustomerName}</div>
                      <span className="route-pill" style={getRouteStyle(customer.Route)}>{customer.Route || 'N/A'}</span>
                    </div>

                    <div className="customer-grid-col price-col">
                      {editingPriceCustomerId === customer.id ? (
                        <div className="price-edit-container">
                          <input
                            type="number"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdatePrice(customer.id, editingPriceValue)
                              } else if (e.key === 'Escape') {
                                setEditingPriceCustomerId(null)
                                setEditingPriceValue('')
                              }
                            }}
                          />
                          <div className="price-button-row">
                            <button
                              className="price-save-btn"
                              onClick={() => handleUpdatePrice(customer.id, editingPriceValue)}
                              title="Save price"
                            >
                              ✓
                            </button>
                            <button
                              className="price-cancel-btn"
                              onClick={() => {
                                setEditingPriceCustomerId(null)
                                setEditingPriceValue('')
                              }}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="price-display"
                          onClick={() => {
                            setEditingPriceCustomerId(customer.id)
                            setEditingPriceValue(customer.Price || '')
                          }}
                        >
                          {customer.Price && formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}
                        </div>
                      )}
                    </div>

                    <div className="customer-grid-col actions-col">
                      <div className="row-actions-buttons">
                        <button onClick={() => handleDoneAndPaid(customer)} className="done-paid-btn">
                          Done and Paid
                        </button>
                        <button onClick={() => handleDoneAndNotPaid(customer)} className="done-not-paid-btn">
                          Done and Not Paid
                        </button>
                      </div>

                      <div className="row-message-and-calendar">
                        <div className="row-message-section">
                          <select
                            value={selectedLetters[customer.id] || messages[0]?.id || ''}
                            onChange={(e) => handleSelectLetter(customer.id, e.target.value)}
                            disabled={!messages.length}
                          >
                            {!messages.length && <option value="">No letters available</option>}
                            {messages.length > 0 && !selectedLetters[customer.id] && (
                              <option value="">Select letter</option>
                            )}
                            {messages.map((msg) => (
                              <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                            ))}
                          </select>
                          <button
                            className="text-btn"
                            onClick={() => handleSendWhatsApp(customer)}
                            disabled={!customer.PhoneNumber || !messages.length}
                          >
                            Text
                          </button>
                        </div>

                        <div className="row-calendar-section">
                          <span className="change-date-label">Change clean date</span>
                          <button
                            className="calendar-icon-btn"
                            onClick={() => toggleDatePicker(customer.id)}
                            title="Pick a date to move to"
                          >
                            📅
                          </button>
                          {expandedDatePickers[customer.id] && (
                            <input
                              type="date"
                              value={customer.NextClean || ''}
                              onChange={(e) => handleMoveToDate(customer, e.target.value)}
                              className="date-picker-input"
                              autoFocus
                            />
                          )}
                        </div>
                      </div>

                      <div className="mobile-menu-container">
                        <button
                          className="mobile-menu-btn"
                          onClick={() => setMobileMenuOpenCustomerId(
                            mobileMenuOpenCustomerId === customer.id ? null : customer.id
                          )}
                          title="More options"
                        >
                          ⋯
                        </button>
                        
                        {mobileMenuOpenCustomerId === customer.id && (
                          <div className="mobile-menu-dropdown">
                            <button 
                              className="mobile-menu-item done-paid-btn"
                              onClick={() => {
                                handleDoneAndPaid(customer)
                                setMobileMenuOpenCustomerId(null)
                              }}
                            >
                              Done and Paid
                            </button>
                            <button 
                              className="mobile-menu-item done-not-paid-btn"
                              onClick={() => {
                                handleDoneAndNotPaid(customer)
                                setMobileMenuOpenCustomerId(null)
                              }}
                            >
                              Done and Not Paid
                            </button>
                            <div className="mobile-menu-section">
                              <select
                                value={selectedLetters[customer.id] || messages[0]?.id || ''}
                                onChange={(e) => handleSelectLetter(customer.id, e.target.value)}
                                disabled={!messages.length}
                                className="mobile-menu-select"
                              >
                                {!messages.length && <option value="">No letters available</option>}
                                {messages.length > 0 && !selectedLetters[customer.id] && (
                                  <option value="">Select letter</option>
                                )}
                                {messages.map((msg) => (
                                  <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                                ))}
                              </select>
                              <button
                                className="mobile-menu-item text-btn"
                                onClick={() => {
                                  handleSendWhatsApp(customer)
                                  setMobileMenuOpenCustomerId(null)
                                }}
                                disabled={!customer.PhoneNumber || !messages.length}
                              >
                                Text
                              </button>
                            </div>
                            <button
                              className="mobile-menu-item calendar-icon-btn"
                              onClick={() => {
                                toggleDatePicker(customer.id)
                              }}
                              title="Pick a date to move to"
                            >
                              📅 Change Date
                            </button>
                            {expandedDatePickers[customer.id] && (
                              <input
                                type="date"
                                value={customer.NextClean || ''}
                                onChange={(e) => {
                                  handleMoveToDate(customer, e.target.value)
                                  setMobileMenuOpenCustomerId(null)
                                }}
                                className="mobile-menu-date-input"
                                autoFocus
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
        </>
      ) : (
        <>
          {!calendarCollapsed && <div className="overview-grid">
            <div className="calendar-day-header">Sun</div>
            <div className="calendar-day-header">Mon</div>
            <div className="calendar-day-header">Tue</div>
            <div className="calendar-day-header">Wed</div>
            <div className="calendar-day-header">Thu</div>
            <div className="calendar-day-header">Fri</div>
            <div className="calendar-day-header">Sat</div>
            {generateOverviewCalendar()}
          </div>}

          <div className="collapse-btn-row">
            <button onClick={() => setCalendarCollapsed(!calendarCollapsed)} className="collapse-btn">
              {calendarCollapsed ? '▼' : '▲'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default WorkloadManager
