import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './WorkloadManager.css'

function WorkloadManager({ user }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [customers, setCustomers] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCustomers()
  }, [user])

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
      fetchCustomers()
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
      fetchCustomers()
    } catch (error) {
      console.error('Error updating customer:', error.message)
    }
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
          })
      )

      fetchCustomers()
    } catch (error) {
      console.error('Error bulk moving dates:', error.message)
    }
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

  return (
    <div className="workload-manager">
      <div className="calendar-header">
        <button onClick={previousMonth} className="month-nav-btn">←</button>
        <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
        <button onClick={nextMonth} className="month-nav-btn">→</button>
      </div>

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
              {selectedDayCustomers.map((customer) => (
                <div key={customer.id} className="customer-item">
                  <div className="customer-info">
                    <div>
                      <div className="customer-name">{customer.Address}</div>
                      <div className="customer-details">
                        <span>{customer.CustomerName}</span>
                        {customer.PhoneNumber && <span> • {customer.PhoneNumber}</span>}
                        <span> • £{customer.Price}</span>
                        {customer.Route && <span> • Route: {customer.Route}</span>}
                        {customer.Outstanding > 0 && <span className="outstanding"> • Outstanding: £{customer.Outstanding}</span>}
                        {customer.Notes && <span> • {customer.Notes}</span>}
                      </div>
                    </div>
                    <div className="customer-actions">
                      <button onClick={() => handleDoneAndPaid(customer)} className="done-paid-btn">
                        Done and Paid
                      </button>
                      <button onClick={() => handleDoneAndNotPaid(customer)} className="done-not-paid-btn">
                        Done and Not Paid
                      </button>
                    </div>
                  </div>
                  <div className="move-date-section">
                    <span className="move-date-label">Move date:</span>
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default WorkloadManager
