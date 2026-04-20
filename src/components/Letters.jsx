import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Letters.css'
import { getCurrencyConfig } from '../lib/format'

function Letters({ user }) {
  const isTeamMember = Boolean(user?.ParentUserId)
  const ownerUserId = user?.ParentUserId || user?.id
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingMessage, setEditingMessage] = useState(null)
  const [showEditFooter, setShowEditFooter] = useState(false)
  const [messageFooter, setMessageFooter] = useState(user.MessageFooter || '')
  const [invoiceFooter, setInvoiceFooter] = useState(user.InvoiceFooter || '')
  const [showEditInvoiceFooter, setShowEditInvoiceFooter] = useState(false)
  const [messageFooterIncludeEmployee, setMessageFooterIncludeEmployee] = useState(user?.MessageFooterIncludeEmployee || false)
  const [invoiceFooterIncludeEmployee, setInvoiceFooterIncludeEmployee] = useState(user?.InvoiceFooterIncludeEmployee || false)
  const [hasTeamMembers, setHasTeamMembers] = useState(false)
  const [selectedPayLetter, setSelectedPayLetter] = useState('')
  const [selectedReminderLetter, setSelectedReminderLetter] = useState('')
  const [selectedPayChangeLetter, setSelectedPayChangeLetter] = useState('')
  const [selectedQuoteBookedInLetter, setSelectedQuoteBookedInLetter] = useState('')
  const [selectedQuoteTurnedIntoJobLetter, setSelectedQuoteTurnedIntoJobLetter] = useState('')
  const [quoteTurnedIntoJobIncludeBookedServices, setQuoteTurnedIntoJobIncludeBookedServices] = useState(false)
  const [activeTab, setActiveTab] = useState('Messages')
  const [formData, setFormData] = useState({
    MessageTitle: '',
    Message: '',
    IncludePrice: false
  })

  useEffect(() => {
    if (!ownerUserId) return
    fetchMessages()
    fetchCustomerPayLetter()
    fetchCustomerReminderLetter()
    fetchCustomerPayChangeLetter()
    fetchQuoteBookedInLetter()
    fetchQuoteTurnedIntoJobLetter()
    if (!isTeamMember) fetchTeamMemberCount()
  }, [ownerUserId])

  async function fetchMessages() {
    try {
      const { data, error } = await supabase
        .from('Messages')
        .select('*')
        .eq('UserId', ownerUserId)
        .order('id', { ascending: true })
      
      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      console.error('Error fetching messages:', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCustomerPayLetter() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CustomerPayLetter')
        .eq('id', ownerUserId)
        .single()
      
      if (error) throw error
      setSelectedPayLetter(data?.CustomerPayLetter || '')
    } catch (error) {
      console.error('Error fetching customer pay letter:', error.message)
    }
  }

  async function fetchCustomerReminderLetter() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CustomerReminderLetter')
        .eq('id', ownerUserId)
        .single()
      
      if (error) throw error
      setSelectedReminderLetter(data?.CustomerReminderLetter || '')
    } catch (error) {
      console.error('Error fetching customer reminder letter:', error.message)
    }
  }

  async function fetchTeamMemberCount() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('id')
        .eq('ParentUserId', user.id)
      
      if (error) throw error
      setHasTeamMembers((data?.length || 0) > 0)
    } catch (error) {
      console.error('Error fetching team member count:', error.message)
    }
  }

  async function fetchCustomerPayChangeLetter() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('PayChangeLetter')
        .eq('id', ownerUserId)
        .single()
      
      if (error) throw error
      setSelectedPayChangeLetter(data?.PayChangeLetter || '')
    } catch (error) {
      console.error('Error fetching pay change letter:', error.message)
    }
  }

  async function fetchQuoteBookedInLetter() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('QuoteBookedInLetter')
        .eq('id', ownerUserId)
        .single()

      if (error) throw error
      setSelectedQuoteBookedInLetter(data?.QuoteBookedInLetter || '')
    } catch (error) {
      console.error('Error fetching quote booked in letter:', error.message)
      if (String(error.message || '').toLowerCase().includes('quotebookedinletter')) {
        alert('Quote defaults are not available in Supabase yet. Please run the latest database migration to add QuoteBookedInLetter and QuoteTurnedIntoJobLetter.')
      }
    }
  }

  async function fetchQuoteTurnedIntoJobLetter() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('QuoteTurnedIntoJobLetter, QuoteTurnedIntoJobIncludeBookedServices')
        .eq('id', ownerUserId)
        .single()

      if (error) throw error
      setSelectedQuoteTurnedIntoJobLetter(data?.QuoteTurnedIntoJobLetter || '')
      setQuoteTurnedIntoJobIncludeBookedServices(Boolean(data?.QuoteTurnedIntoJobIncludeBookedServices))
    } catch (error) {
      console.error('Error fetching quote turned into job letter:', error.message)
      if (String(error.message || '').toLowerCase().includes('quoteturnedintojobletter')) {
        alert('Quote defaults are not available in Supabase yet. Please run the latest database migration to add QuoteBookedInLetter, QuoteTurnedIntoJobLetter and QuoteTurnedIntoJobIncludeBookedServices.')
      }
    }
  }

  async function handlePayLetterChange(letterId) {
    setSelectedPayLetter(letterId)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CustomerPayLetter: letterId })
        .eq('id', ownerUserId)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating customer pay letter:', error.message)
    }
  }

  async function handleReminderLetterChange(letterId) {
    setSelectedReminderLetter(letterId)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CustomerReminderLetter: letterId })
        .eq('id', ownerUserId)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating customer reminder letter:', error.message)
    }
  }

  async function handlePayChangeLetterChange(letterId) {
    setSelectedPayChangeLetter(letterId)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ PayChangeLetter: letterId })
        .eq('id', ownerUserId)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating pay change letter:', error.message)
    }
  }

  async function handleQuoteBookedInLetterChange(letterId) {
    const previousValue = selectedQuoteBookedInLetter
    setSelectedQuoteBookedInLetter(letterId)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ QuoteBookedInLetter: letterId || null })
        .eq('id', ownerUserId)

      if (error) throw error
      await fetchQuoteBookedInLetter()
    } catch (error) {
      setSelectedQuoteBookedInLetter(previousValue)
      console.error('Error updating quote booked in letter:', error.message)
      alert('Could not save "When a Quote is booked in" default to Supabase. If this is a new field, run the latest migration first.')
    }
  }

  async function handleQuoteTurnedIntoJobLetterChange(letterId) {
    const previousValue = selectedQuoteTurnedIntoJobLetter
    setSelectedQuoteTurnedIntoJobLetter(letterId)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ QuoteTurnedIntoJobLetter: letterId || null })
        .eq('id', ownerUserId)

      if (error) throw error
      await fetchQuoteTurnedIntoJobLetter()
    } catch (error) {
      setSelectedQuoteTurnedIntoJobLetter(previousValue)
      console.error('Error updating quote turned into job letter:', error.message)
      alert('Could not save "When a Quote is Turned into a Job" default to Supabase. If this is a new field, run the latest migration first.')
    }
  }

  async function handleQuoteTurnedIntoJobIncludeBookedServicesChange(checked) {
    const previousValue = quoteTurnedIntoJobIncludeBookedServices
    setQuoteTurnedIntoJobIncludeBookedServices(checked)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ QuoteTurnedIntoJobIncludeBookedServices: checked })
        .eq('id', ownerUserId)

      if (error) throw error
      await fetchQuoteTurnedIntoJobLetter()
    } catch (error) {
      setQuoteTurnedIntoJobIncludeBookedServices(previousValue)
      console.error('Error updating quote turned into job include booked services:', error.message)
      alert('Could not save "Include the Booked Services" option to Supabase. If this is a new field, run the latest migration first.')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editingMessage) {
        // Update existing message
        const { error } = await supabase
          .from('Messages')
          .update({
            MessageTitle: formData.MessageTitle,
            Message: formData.Message,
            IncludePrice: formData.IncludePrice
          })
          .eq('id', editingMessage.id)
        
        if (error) throw error
      } else {
        // Create new message
        const { error } = await supabase
          .from('Messages')
          .insert([{
            UserId: user.id,
            MessageTitle: formData.MessageTitle,
            Message: formData.Message,
            IncludePrice: formData.IncludePrice
          }])
        
        if (error) throw error
      }
      
      setFormData({ MessageTitle: '', Message: '', IncludePrice: false })
      setShowAddForm(false)
      setEditingMessage(null)
      fetchMessages()
    } catch (error) {
      console.error('Error saving message:', error.message)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this message?')) return
    
    try {
      const { error } = await supabase
        .from('Messages')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      fetchMessages()
    } catch (error) {
      console.error('Error deleting message:', error.message)
    }
  }

  function handleEdit(message) {
    setEditingMessage(message)
    setFormData({
      MessageTitle: message.MessageTitle,
      Message: message.Message,
      IncludePrice: message.IncludePrice || false
    })
    setShowAddForm(true)
  }

  function handleCancel() {
    setFormData({ MessageTitle: '', Message: '', IncludePrice: false })
    setShowAddForm(false)
    setEditingMessage(null)
  }

  async function handleToggleMessageFooterIncludeEmployee(checked) {
    setMessageFooterIncludeEmployee(checked)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ MessageFooterIncludeEmployee: checked })
        .eq('id', user.id)
      if (error) throw error
    } catch (err) {
      console.error('Error saving MessageFooterIncludeEmployee:', err.message)
    }
  }

  async function handleToggleInvoiceFooterIncludeEmployee(checked) {
    setInvoiceFooterIncludeEmployee(checked)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ InvoiceFooterIncludeEmployee: checked })
        .eq('id', user.id)
      if (error) throw error
    } catch (err) {
      console.error('Error saving InvoiceFooterIncludeEmployee:', err.message)
    }
  }

  async function handleUpdateFooter(e) {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('Users')
        .update({ MessageFooter: messageFooter, MessageFooterIncludeEmployee: messageFooterIncludeEmployee })
        .eq('id', user.id)
      
      if (error) throw error
      setShowEditFooter(false)
      alert('Message footer updated successfully!')
    } catch (error) {
      console.error('Error updating footer:', error.message)
    }
  }

  async function handleUpdateInvoiceFooter(e) {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('Users')
        .update({ InvoiceFooter: invoiceFooter, InvoiceFooterIncludeEmployee: invoiceFooterIncludeEmployee })
        .eq('id', user.id)
      
      if (error) throw error
      setShowEditInvoiceFooter(false)
      alert('Invoice footer updated successfully!')
    } catch (error) {
      console.error('Error updating invoice footer:', error.message)
    }
  }

  if (loading) return <div className="loading">Loading messages...</div>

  return (
    <div className="letters-container">
      <h2>Message Templates</h2>
      
      <div className="message-tabs">
        <button
          className={`message-tab ${activeTab === 'Messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('Messages')}
        >
          Messages
        </button>
        <button
          className={`message-tab ${activeTab === 'Default Messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('Default Messages')}
        >
          Default Messages
        </button>
        <button
          className={`message-tab ${activeTab === 'Message Footers' ? 'active' : ''}`}
          onClick={() => setActiveTab('Message Footers')}
        >
          Message Footers
        </button>
      </div>
      
      {activeTab === 'Default Messages' && (
        <>
          <div className="pay-letter-section">
            <label htmlFor="payLetterSelect" className="pay-letter-label">
              This message will be sent when you click Done and not Paid
            </label>
            <select
              id="payLetterSelect"
              value={selectedPayLetter || ''}
              onChange={(e) => handlePayLetterChange(e.target.value)}
              className="pay-letter-select"
            >
              <option value="">Select a message...</option>
              {messages.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.MessageTitle}
                </option>
              ))}
            </select>
          </div>

          <div className="reminder-letter-section">
            <label htmlFor="reminderLetterSelect" className="reminder-letter-label">
              This message is the default Customer Reminder Message
            </label>
            <select
              id="reminderLetterSelect"
              value={selectedReminderLetter || ''}
              onChange={(e) => handleReminderLetterChange(e.target.value)}
              className="reminder-letter-select"
            >
              <option value="">Select a message...</option>
              {messages.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.MessageTitle}
                </option>
              ))}
            </select>
          </div>

          <div className="pay-change-letter-section">
            <label htmlFor="payChangeLetterSelect" className="pay-change-letter-label">
              This message will be sent when you change customer payment amount
            </label>
            <select
              id="payChangeLetterSelect"
              value={selectedPayChangeLetter || ''}
              onChange={(e) => handlePayChangeLetterChange(e.target.value)}
              className="pay-change-letter-select"
            >
              <option value="">Select a message...</option>
              {messages.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.MessageTitle}
                </option>
              ))}
            </select>
          </div>

          <div className="quote-booked-in-letter-section">
            <label htmlFor="quoteBookedInLetterSelect" className="quote-booked-in-letter-label">
              This message will be offered when a quote is booked in
            </label>
            <select
              id="quoteBookedInLetterSelect"
              value={selectedQuoteBookedInLetter || ''}
              onChange={(e) => handleQuoteBookedInLetterChange(e.target.value)}
              className="quote-booked-in-letter-select"
            >
              <option value="">Select a message...</option>
              {messages.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.MessageTitle}
                </option>
              ))}
            </select>
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Will include the phrase The quote is booked in for (Quote Date)
            </p>
          </div>

          <div className="quote-turned-job-letter-section">
            <label htmlFor="quoteTurnedIntoJobLetterSelect" className="quote-turned-job-letter-label">
              This message will be offered when a quote is turned into a job
            </label>
            <select
              id="quoteTurnedIntoJobLetterSelect"
              value={selectedQuoteTurnedIntoJobLetter || ''}
              onChange={(e) => handleQuoteTurnedIntoJobLetterChange(e.target.value)}
              className="quote-turned-job-letter-select"
            >
              <option value="">Select a message...</option>
              {messages.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.MessageTitle}
                </option>
              ))}
            </select>
            <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              Includes the phrase The job is booked for (Job date)
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={quoteTurnedIntoJobIncludeBookedServices}
                onChange={(e) => handleQuoteTurnedIntoJobIncludeBookedServicesChange(e.target.checked)}
              />
              Include the Booked Services
            </label>
          </div>
        </>
      )}
      
      {activeTab === 'Message Footers' && (
        <>
          <div className="footer-section">
            <div className="footer-header">
              <h3>Text Message Footer</h3>
              {!isTeamMember && (
              <button 
                className="edit-footer-btn" 
                onClick={() => setShowEditFooter(!showEditFooter)}
              >
                {showEditFooter ? 'Cancel' : 'Edit Footer'}
              </button>
              )}
            </div>
            
            {!isTeamMember && hasTeamMembers && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={messageFooterIncludeEmployee}
                  onChange={(e) => handleToggleMessageFooterIncludeEmployee(e.target.checked)}
                />
                Include the Employee's Name
              </label>
            )}

            {showEditFooter && !isTeamMember ? (
              <form onSubmit={handleUpdateFooter} className="footer-form">
                <textarea
                  value={messageFooter}
                  onChange={(e) => setMessageFooter(e.target.value)}
                  rows="3"
                  placeholder="Enter your message footer"
                />
                <button type="submit" className="save-footer-btn">Save Footer</button>
              </form>
            ) : (
              <div className="footer-display">
                {messageFooter || 'No footer set'}
              </div>
            )}
          </div>
          
          <div className="footer-section">
            <div className="footer-header">
              <h3>Invoice Footer</h3>
              {!isTeamMember && (
              <button 
                className="edit-footer-btn" 
                onClick={() => setShowEditInvoiceFooter(!showEditInvoiceFooter)}
              >
                {showEditInvoiceFooter ? 'Cancel' : 'Edit Footer'}
              </button>
              )}
            </div>
            
            {!isTeamMember && hasTeamMembers && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={invoiceFooterIncludeEmployee}
                  onChange={(e) => handleToggleInvoiceFooterIncludeEmployee(e.target.checked)}
                />
                Include the Employee's Name
              </label>
            )}

            {showEditInvoiceFooter && !isTeamMember ? (
              <form onSubmit={handleUpdateInvoiceFooter} className="footer-form">
                <textarea
                  value={invoiceFooter}
                  onChange={(e) => setInvoiceFooter(e.target.value)}
                  rows="3"
                  placeholder="Enter your invoice footer"
                />
                <button type="submit" className="save-footer-btn">Save Footer</button>
              </form>
            ) : (
              <div className="footer-display">
                {invoiceFooter || 'No footer set'}
              </div>
            )}
          </div>
        </>
      )}
      
      {activeTab === 'Messages' && (
        <>
          {!showAddForm && !isTeamMember && (
            <button className="add-message-btn" onClick={() => setShowAddForm(true)}>
              + New Message
            </button>
          )}

          {showAddForm && !isTeamMember && (
            <form onSubmit={handleSubmit} className="message-form">
              <h3>{editingMessage ? 'Edit Message' : 'New Message'}</h3>
              <input
                type="text"
                placeholder="Message Title"
                value={formData.MessageTitle}
                onChange={(e) => setFormData({...formData, MessageTitle: e.target.value})}
                required
              />
              <div className="include-price-section">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.IncludePrice}
                    onChange={(e) => setFormData({...formData, IncludePrice: e.target.checked})}
                  />
                  Include Price
                </label>
                {formData.IncludePrice && (
                  <p className="price-helper-text">Add {getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol} in your message to include the customers price</p>
                )}
              </div>
              <div className="message-greeting">
                Hello [Customer Name]
              </div>
              <textarea
                placeholder="Message Content"
                value={formData.Message}
                onChange={(e) => setFormData({...formData, Message: e.target.value})}
                rows="6"
                required
              />
              <div className="message-footer-preview">
                {messageFooter || 'No footer set'}
              </div>
              <div className="form-actions">
                <button type="submit">{editingMessage ? 'Update Message' : 'Create Message'}</button>
                <button type="button" className="cancel-btn" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="messages-list">
            <h3>Saved Messages ({messages.length})</h3>
            {messages.length === 0 ? (
              <p className="empty-state">No messages yet. Create your first message template above!</p>
            ) : (
              <div className="messages-grid">
                {messages.map((message) => (
                  <div key={message.id} className="message-card">
                    <h4>{message.MessageTitle}</h4>
                    <p className="message-content">{message.Message}</p>
                    {!isTeamMember && (
                    <div className="message-actions">
                      <button 
                        onClick={() => handleEdit(message)}
                        className="edit-btn"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(message.id)}
                        className="delete-btn"
                      >
                        Delete
                      </button>
                    </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Letters
