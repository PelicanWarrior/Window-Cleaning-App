import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './WorkloadManager.css'

function WorkloadManager({ user }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [customers, setCustomers] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().getDate())
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [messageFooter, setMessageFooter] = useState('')
  const [selectedLetters, setSelectedLetters] = useState({})
  const [selectedLetterAll, setSelectedLetterAll] = useState('')
  const [activeView, setActiveView] = useState('Calendar')
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedMoveDate, setExpandedMoveDate] = useState({})
  const [customerPayLetter, setCustomerPayLetter] = useState(null)
  const [routeOrder, setRouteOrder] = useState(null)
  const [orderedCustomers, setOrderedCustomers] = useState([])
  const [draggedCustomerId, setDraggedCustomerId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  useEffect(() => {
    fetchCustomers()
    fetchMessagesAndFooter()
    fetchCalendarView()
    fetchCustomerPayLetter()
  }, [user])

  useEffect(() => {
    setSelectedLetterAll('')
    fetchRouteOrder()
  }, [selectedDate, currentDate])

  // Derive ordered customers for the selected date based on RouteOrder
  const deriveOrderedCustomers = () => {
    if (!selectedDate || !routeOrder) {
      setOrderedCustomers([])
      return
    }
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
    if (routeOrder.RouteDate !== dateStr || !routeOrder.Route) {
      setOrderedCustomers([])
      return
    }
    const dayCustomers = getCustomersForDate(selectedDate)
    const idToCustomer = new Map(dayCustomers.map(c => [c.id, c]))
    const routeIds = routeOrder.Route.split(',')
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

  // Recompute orderedCustomers whenever customers or routeOrder change
  useEffect(() => {
    deriveOrderedCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, routeOrder, selectedDate, currentDate])

  async function fetchRouteOrder() {
    try {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
      const { data, error } = await supabase
        .from('RouteOrder')
        .select('*')
        .eq('UserID', user.id)
        .eq('RouteDate', dateStr)
        .single()
      
      if (error && error.code !== 'PGRST116') throw error // PGRST116 is "no rows found"
      
      if (data) {
        setRouteOrder(data)
      } else {
        setRouteOrder(null)
        setOrderedCustomers([])
      }
    } catch (error) {
      console.error('Error fetching route order:', error.message)
    }
  }

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
  const handleDayClick = (day) => {
    setSelectedDate(day)
  }

  // Handle Done and Paid
  const handleDoneAndPaid = async (customer) => {
    try {
      const currentWorkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDate)
      const weeksToAdd = parseInt(customer.Weeks) || 0
      const nextCleanDate = new Date(currentWorkDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: nextCleanDate.toISOString().split('T')[0]
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      // Remove from route order
      await removeCustomerFromRouteOrder(customer.id)
      
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
      
      const newOutstanding = (parseFloat(customer.Outstanding) || 0) + (parseFloat(customer.Price) || 0)
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: nextCleanDate.toISOString().split('T')[0],
          Outstanding: newOutstanding
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      // Remove from route order
      await removeCustomerFromRouteOrder(customer.id)
      
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
    } catch (error) {
      console.error('Error updating customer:', error.message)
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
      // If IncludePrice is checked and message contains £, replace it with £[outstanding amount]
      if (message.IncludePrice && messageContent.includes('£')) {
        messageContent = messageContent.replace('£', `£${customer.Outstanding}`)
      }
      bodyParts.push(messageContent)
    }
    
    if (messageFooter) bodyParts.push(messageFooter)

    const text = bodyParts.join('\n')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  // Handle Move Date
  const handleMoveDate = async (customer, days) => {
    try {
      const currentNextClean = new Date(customer.NextClean)
      const newNextClean = new Date(currentNextClean)
      newNextClean.setDate(newNextClean.getDate() + days)
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: newNextClean.toISOString().split('T')[0]
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      // Remove from route order
      await removeCustomerFromRouteOrder(customer.id)
      
      fetchCustomers()
    } catch (error) {
      console.error('Error moving date:', error.message)
    }
  }

  // Bulk move dates for all customers on the selected day
  const handleMoveDateBulk = async (days) => {
    if (!selectedDayCustomers.length) return
    try {
      await Promise.all(
        selectedDayCustomers
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
            
            // Remove from route order
            await removeCustomerFromRouteOrder(customer.id)
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

  const handleSelectLetterAll = (messageId, customersForDay) => {
    setSelectedLetterAll(messageId)
    if (!messageId) return

    setSelectedLetters((prev) => {
      const updated = { ...prev }
      customersForDay.forEach((customer) => {
        updated[customer.id] = messageId
      })
      return updated
    })
  }

  const toggleMoveDate = (customerId) => {
    setExpandedMoveDate((prev) => ({
      ...prev,
      [customerId]: !prev[customerId]
    }))
  }

  const removeCustomerFromRouteOrder = async (customerId) => {
    if (!routeOrder) return
    
    try {
      const routeIds = routeOrder.Route.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      const updatedIds = routeIds.filter(id => id !== customerId)
      
      if (updatedIds.length === 0) {
        // Delete the route order if empty
        const { error } = await supabase
          .from('RouteOrder')
          .delete()
          .eq('id', routeOrder.id)
        if (error) throw error
      } else {
        // Update the route order with remaining IDs
        const { error } = await supabase
          .from('RouteOrder')
          .update({ Route: updatedIds.join(',') })
          .eq('id', routeOrder.id)
        if (error) throw error
      }
      
      // Refresh route order
      fetchRouteOrder()
    } catch (error) {
      console.error('Error updating route order:', error.message)
    }
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

    // Update orderedCustomers or save to RouteOrder if we have one
    if (orderedCustomers.length > 0) {
      setOrderedCustomers(newList)
      await saveRouteOrder(newList)
    } else {
      // Create new route order with the reordered customers
      await saveRouteOrder(newList)
    }

    setDraggedCustomerId(null)
  }

  const saveRouteOrder = async (customerList) => {
    try {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
      const routeString = customerList.map(c => c.id).join(',')

      if (routeOrder) {
        // Update existing route order
        const { error } = await supabase
          .from('RouteOrder')
          .update({ Route: routeString })
          .eq('id', routeOrder.id)
        if (error) throw error
      } else {
        // Create new route order
        const { error } = await supabase
          .from('RouteOrder')
          .insert({
            UserID: parseInt(user.id),
            RouteDate: dateStr,
            Route: routeString
          })
        if (error) throw error
      }

      fetchRouteOrder()
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

    const formalName = getFormalCustomerName(customer.CustomerName)
    const bodyParts = [`Dear ${formalName}`]
    
    if (letter?.Message) {
      let messageContent = letter.Message
      // If IncludePrice is checked and message contains £, replace it with £[outstanding amount]
      if (letter.IncludePrice && messageContent.includes('£')) {
        messageContent = messageContent.replace('£', `£${customer.Outstanding}`)
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
      const dayCustomers = getCustomersForDate(day)
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
                  <div className="overview-customer-address">{customer.Address}</div>
                  <div className="overview-customer-meta">
                    £{customer.Price} • <span className="overview-route-pill" style={getRouteStyle(customer.Route)}>{customer.Route || 'N/A'}</span>
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
          <div className="calendar-grid">
            <div className="calendar-day-header">Sun</div>
            <div className="calendar-day-header">Mon</div>
            <div className="calendar-day-header">Tue</div>
            <div className="calendar-day-header">Wed</div>
            <div className="calendar-day-header">Thu</div>
            <div className="calendar-day-header">Fri</div>
            <div className="calendar-day-header">Sat</div>
            {generateCalendar()}
          </div>

          {selectedDate && (
        <div className="selected-day-customers">
          <h3>
            Jobs for {monthNames[currentDate.getMonth()]} {selectedDate}, {currentDate.getFullYear()}
          </h3>
          <p className="income-total">Income: £{totalIncome.toFixed(2)}</p>
          {selectedDayCustomers.length > 0 && (
            <div className="message-all-section">
              <label className="message-all-label" htmlFor="messageAll">Message to All:</label>
              <select
                id="messageAll"
                value={selectedLetterAll || ''}
                onChange={(e) => handleSelectLetterAll(e.target.value, selectedDayCustomers)}
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
              <span className="bulk-move-label">Move all jobs:</span>
              <button onClick={() => handleMoveDateBulk(-1)} className="bulk-move-btn">-1 Day</button>
              <button onClick={() => handleMoveDateBulk(1)} className="bulk-move-btn">+1 Day</button>
              <button onClick={() => handleMoveDateBulk(-7)} className="bulk-move-btn">-1 Week</button>
              <button onClick={() => handleMoveDateBulk(7)} className="bulk-move-btn">+1 Week</button>
            </div>
          )}
          {selectedDayCustomers.length === 0 ? (
            <p className="empty-state">No customers scheduled for this day.</p>
          ) : (
            <div className="customer-list">
              {(orderedCustomers.length > 0 ? orderedCustomers : selectedDayCustomers).map((customer, index) => (
                <div
                  key={customer.id}
                  className={`customer-item ${draggedCustomerId === customer.id ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, customer.id)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <div className="drag-handle">⋮⋮</div>
                  <div className="customer-content">
                    <div className="customer-header">
                      <div className="customer-name">{customer.Address}</div>
                      <span className="route-pill" style={getRouteStyle(customer.Route)}>{customer.Route || 'N/A'}</span>
                    </div>
                    <div className="customer-details">
                      <span>{customer.CustomerName}</span>
                      {customer.PhoneNumber && <span> • {customer.PhoneNumber}</span>}
                      <span> • £{customer.Price}</span>
                      {customer.Outstanding > 0 && <span className="outstanding"> • Outstanding: £{customer.Outstanding}</span>}
                      {customer.Notes && <span> • {customer.Notes}</span>}
                    </div>
                    <div className="customer-actions">
                      <button onClick={() => handleDoneAndPaid(customer)} className="done-paid-btn">
                        Done and Paid
                      </button>
                      <button onClick={() => handleDoneAndNotPaid(customer)} className="done-not-paid-btn">
                        Done and Not Paid
                      </button>
                    </div>
                    <div className="customer-footer">
                      <button
                        className="move-date-toggle-btn"
                        onClick={() => toggleMoveDate(customer.id)}
                      >
                        {expandedMoveDate[customer.id] ? '− Hide' : '+ Move Date'}
                      </button>
                      <div className="text-message-section">
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
                    </div>
                    {expandedMoveDate[customer.id] && (
                      <div className="move-date-buttons">
                        <button onClick={() => handleMoveDate(customer, -1)} className="move-date-btn">
                          -1 Day
                        </button>
                        <button onClick={() => handleMoveDate(customer, 1)} className="move-date-btn">
                          +1 Day
                        </button>
                        <button onClick={() => handleMoveDate(customer, -7)} className="move-date-btn">
                          -1 Week
                        </button>
                        <button onClick={() => handleMoveDate(customer, 7)} className="move-date-btn">
                          +1 Week
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </>
      ) : (
        <div className="overview-grid">
          <div className="calendar-day-header">Sun</div>
          <div className="calendar-day-header">Mon</div>
          <div className="calendar-day-header">Tue</div>
          <div className="calendar-day-header">Wed</div>
          <div className="calendar-day-header">Thu</div>
          <div className="calendar-day-header">Fri</div>
          <div className="calendar-day-header">Sat</div>
          {generateOverviewCalendar()}
        </div>
      )}
    </div>
  )
}

export default WorkloadManager
