import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './WorkloadManager.css'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'

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
  const [cancelServiceModal, setCancelServiceModal] = useState({ show: false, reason: '' })
  const [bookJobModal, setBookJobModal] = useState({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })

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
    fetchCalendarPosition()
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

  // Derive ordered customers (non-quote jobs) for a specific day based on user's RouteOrder
  const getOrderedCustomersForDate = (day) => {
    const dayCustomers = getJobsForDate(day)
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

    const dayCustomers = getJobsForDate(selectedDate)
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

  async function fetchCalendarPosition() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderPosition')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      if (data?.CalenderPosition === 'Up') {
        setCalendarCollapsed(true)
      } else {
        setCalendarCollapsed(false)
      }
    } catch (error) {
      console.error('Error fetching calendar position:', error.message)
    }
  }

  async function updateCalendarPosition(position) {
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CalenderPosition: position })
        .eq('id', user.id)

      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar position:', error.message)
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

  const isQuoteCustomer = (customer) => customer.Quote === true

  // Check if a date has any jobs scheduled (non-quote)
  const hasJobsOnDate = (day) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0]
    return customers.some(customer => {
      if (!customer.NextClean || isQuoteCustomer(customer)) return false
      const nextCleanDate = new Date(customer.NextClean).toISOString().split('T')[0]
      return nextCleanDate === dateStr
    })
  }

  const hasQuotesOnDate = (day) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0]
    return customers.some(customer => {
      if (!customer.NextClean || !isQuoteCustomer(customer)) return false
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

  const getJobsForDate = (day) => getCustomersForDate(day).filter(c => !isQuoteCustomer(c))
  const getQuotesForDate = (day) => getCustomersForDate(day).filter(c => isQuoteCustomer(c))

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
      ? selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayJobs

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
      ? selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayJobs

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
      ? selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayJobs

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

    const displayListBase = orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs
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

  // Modal helper functions
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

  // Handle Skip Clean
  const handleSkipClean = async (customer) => {
    try {
      const weeksToAdd = parseInt(user.RouteWeeks) || 1
      const currentCleanDate = new Date(customer.NextClean)
      const nextCleanDate = new Date(currentCleanDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      
      // Create history record
      await createCustomerHistory(customer.id, 'Skipped this clean')
      
      // Update customer with new NextClean date
      const { error } = await supabase
        .from('Customers')
        .update({ NextClean: nextCleanDate.toISOString().split('T')[0] })
        .eq('id', customer.id)
      
      if (error) throw error
      
      fetchCustomers()
    } catch (error) {
      console.error('Error skipping clean:', error.message)
      alert('Error skipping clean: ' + error.message)
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
      
      if (!services || services.length === 0) {
        alert('You need to add at least 1 service')
        // Open the customer modal and navigate to services tab
        setSelectedCustomer(customer)
        setShowCustomerModal(true)
        setShowServices(true)
        setShowHistory(false)
        return
      }
      
      // Show date and service picker modal
      setBookJobModal({ show: true, customer, selectedDate: '', services: services || [], selectedServices: [] })
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
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: bookJobModal.selectedDate,
          Price: totalPrice,
          NextServices: serviceNames,
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
      
      setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })
      setShowCustomerModal(false)
      fetchCustomers()
    } catch (error) {
      console.error('Error booking job:', error.message)
      alert('Error booking job: ' + error.message)
    }
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
      const hasJobs = hasJobsOnDate(day)
      const hasQuotes = hasQuotesOnDate(day)
      const hasAnyWork = hasJobs || hasQuotes
      const isSelected = selectedDate === day
      
      days.push(
        <div
          key={day}
          className={`calendar-day ${hasAnyWork ? 'has-work' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDayClick(day)}
        >
          <div className="day-number">{day}</div>
          {(hasJobs || hasQuotes) && (
            <div className="day-indicators">
              {hasJobs && <div className="work-indicator"></div>}
              {hasQuotes && <div className="quote-indicator"></div>}
            </div>
          )}
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

  const selectedDayJobs = selectedDate ? getJobsForDate(selectedDate) : []
  const selectedDayQuotes = selectedDate ? getQuotesForDate(selectedDate) : []
  const selectedCustomersForDay = selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
  const hasSelectedCustomers = selectedCustomersForDay.length > 0
  const totalIncome = selectedDayJobs.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)

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
    <div className={`workload-manager ${calendarCollapsed ? 'calendar-collapsed' : ''}`}>
      <div className="calendar-header">
        <button onClick={previousMonth} className="month-nav-btn">←</button>
        <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
        <button onClick={nextMonth} className="month-nav-btn">→</button>
      </div>

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
            <button onClick={() => {
              const newState = !calendarCollapsed
              setCalendarCollapsed(newState)
              updateCalendarPosition(newState ? 'Up' : 'Down')
            }} className="collapse-btn">
              {calendarCollapsed ? '▼' : '▲'}
            </button>
          </div>

          {selectedDate && (
            <div className="selected-day-customers">
              <h3>
                Jobs for {monthNames[currentDate.getMonth()]} {selectedDate}, {currentDate.getFullYear()}
              </h3>
          <p className="income-total">Income: {formatCurrency(totalIncome, user.SettingsCountry || 'United Kingdom')}</p>

          {selectedDayQuotes.length > 0 && (
            <div className="quotes-list-card">
              <h4>Quotes for this day ({selectedDayQuotes.length})</h4>
              <div className="quotes-list">
                {selectedDayQuotes.map((q) => (
                  <div key={q.id} className="quote-item-with-button">
                    <div
                      className="quote-item"
                      onClick={() => {
                        setSelectedCustomer(q)
                        setShowCustomerModal(true)
                      }}
                    >
                      <div className="quote-name">{q.CustomerName}</div>
                      <div className="quote-address">{getFullAddress(q)}</div>
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
                ))}
              </div>
            </div>
          )}

          {selectedDayJobs.length > 0 && (
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
          {selectedDayJobs.length > 0 && (
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
          {selectedDayJobs.length === 0 ? (
            <p className="empty-state">No jobs scheduled for this day.</p>
          ) : (
            <div className="customer-list">
              {(orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs).map((customer, index) => {
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

                    <div className="customer-grid-col info-col" onClick={() => {
                      setSelectedCustomer(customer)
                      setShowCustomerModal(true)
                    }}>
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
                          <div>{customer.Price && formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}</div>
                          {getAdditionalServices(customer) && <div className="additional-services">{getAdditionalServices(customer)}</div>}
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
                        <button onClick={() => handleSkipClean(customer)} className="skip-clean-btn">
                          Skip
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
                            <button 
                              className="mobile-menu-item skip-clean-btn"
                              onClick={() => {
                                handleSkipClean(customer)
                                setMobileMenuOpenCustomerId(null)
                              }}
                            >
                              Skip
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
                <>
                <div className="details-grid">
                  <div><strong>Name:</strong> {selectedCustomer.CustomerName}</div>
                  <div><strong>Address:</strong> {getFullAddress(selectedCustomer)}</div>
                  <div><strong>Phone:</strong> {selectedCustomer.PhoneNumber || '—'}</div>
                  <div><strong>Email:</strong> {selectedCustomer.EmailAddress || '—'}</div>
                  <div><strong>Price:</strong> {formatCurrency(selectedCustomer.Price, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Weeks:</strong> {selectedCustomer.Weeks}</div>
                  <div><strong>{isQuoteCustomer(selectedCustomer) ? 'Quotation Booked:' : 'Next Clean:'}</strong> {formatDateByCountry(selectedCustomer.NextClean, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Outstanding:</strong> {formatCurrency(selectedCustomer.Outstanding, user.SettingsCountry || 'United Kingdom')}</div>
                  <div><strong>Route:</strong> {selectedCustomer.Route || '—'}</div>
                  <div className="notes-cell"><strong>Notes:</strong> {selectedCustomer.Notes || '—'}</div>
                </div>
                <button 
                  className="cancel-service-btn"
                  onClick={() => setCancelServiceModal({ show: true, reason: '' })}
                  title={isQuoteCustomer(selectedCustomer) ? "Cancel this quote" : "Cancel this customer's service"}
                >
                  {isQuoteCustomer(selectedCustomer) ? 'Cancel Quote' : 'Cancel Service'}
                </button>
                {isQuoteCustomer(selectedCustomer) && (
                  <button 
                    className="book-job-btn"
                    onClick={() => handleBookJob(selectedCustomer)}
                    title="Convert quote to job"
                  >
                    Book Job
                  </button>
                )}
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

      {cancelServiceModal.show && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setCancelServiceModal({ show: false, reason: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{isQuoteCustomer(selectedCustomer) ? 'Cancel Quote' : 'Cancel Service'}</h3>
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

      {bookJobModal.show && bookJobModal.customer && (
        <div className="modal-overlay" onClick={() => setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })}>
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
            </div>
            <div className="modal-buttons">
              <button 
                onClick={() => handleBookJobSave()}
                className="modal-ok-btn"
              >
                Save
              </button>
              <button 
                onClick={() => setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })}
                className="modal-cancel-btn"
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

export default WorkloadManager
