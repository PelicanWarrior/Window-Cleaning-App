import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Letters.css'
import { getCurrencyConfig } from '../lib/format'

function Letters({ user }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingMessage, setEditingMessage] = useState(null)
  const [showEditFooter, setShowEditFooter] = useState(false)
  const [messageFooter, setMessageFooter] = useState(user.MessageFooter || '')
  const [selectedPayLetter, setSelectedPayLetter] = useState('')
  const [selectedReminderLetter, setSelectedReminderLetter] = useState('')
  const [activeTab, setActiveTab] = useState('Default Messages')
  const [formData, setFormData] = useState({
    MessageTitle: '',
    Message: '',
    IncludePrice: false
  })

  useEffect(() => {
    fetchMessages()
    fetchCustomerPayLetter()
    fetchCustomerReminderLetter()
  }, [])

  async function fetchMessages() {
    try {
      const { data, error } = await supabase
        .from('Messages')
        .select('*')
        .eq('UserId', user.id)
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
        .eq('id', user.id)
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
        .eq('id', user.id)
        .single()
      
      if (error) throw error
      setSelectedReminderLetter(data?.CustomerReminderLetter || '')
    } catch (error) {
      console.error('Error fetching customer reminder letter:', error.message)
    }
  }

  async function handlePayLetterChange(letterId) {
    setSelectedPayLetter(letterId)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CustomerPayLetter: letterId })
        .eq('id', user.id)
      
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
        .eq('id', user.id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating customer reminder letter:', error.message)
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

  async function handleUpdateFooter(e) {
    e.preventDefault()
    try {
      const { error } = await supabase
        .from('Users')
        .update({ MessageFooter: messageFooter })
        .eq('id', user.id)
      
      if (error) throw error
      setShowEditFooter(false)
      alert('Message footer updated successfully!')
    } catch (error) {
      console.error('Error updating footer:', error.message)
    }
  }

  if (loading) return <div className="loading">Loading messages...</div>

  return (
    <div className="letters-container">
      <h2>Message Templates</h2>
      
      <div className="message-tabs">
        <button
          className={`message-tab ${activeTab === 'Default Messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('Default Messages')}
        >
          Default Messages
        </button>
        <button
          className={`message-tab ${activeTab === 'Message Footer' ? 'active' : ''}`}
          onClick={() => setActiveTab('Message Footer')}
        >
          Message Footer
        </button>
        <button
          className={`message-tab ${activeTab === 'Messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('Messages')}
        >
          Messages
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
        </>
      )}
      
      {activeTab === 'Message Footer' && (
        <div className="footer-section">
          <div className="footer-header">
            <h3>Message Footer</h3>
            <button 
              className="edit-footer-btn" 
              onClick={() => setShowEditFooter(!showEditFooter)}
            >
              {showEditFooter ? 'Cancel' : 'Edit Footer'}
            </button>
          </div>
          
          {showEditFooter ? (
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
      )}
      
      {activeTab === 'Messages' && (
        <>
          {!showAddForm && (
            <button className="add-message-btn" onClick={() => setShowAddForm(true)}>
              + New Message
            </button>
          )}

          {showAddForm && (
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
