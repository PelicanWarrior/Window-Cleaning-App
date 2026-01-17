import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDateByCountry, formatCurrency, getCurrencyConfig } from '../lib/format'
import './Quotes.css'

function Quotes({ user }) {
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
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [editServiceData, setEditServiceData] = useState({})
  const [showHistory, setShowHistory] = useState(false)
  const [customerHistory, setCustomerHistory] = useState([])
  const [bookJobModal, setBookJobModal] = useState({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })
  const [quoteData, setQuoteData] = useState({
    CustomerName: '',
    Address: '',
    Address2: '',
    Address3: '',
    Postcode: '',
    PhoneNumber: '',
    EmailAddress: '',
    Notes: '',
    QuoteDate: ''
  })

  useEffect(() => {
    if (user?.id) fetchQuotes()
  }, [user])

  const fetchQuotes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('Customers')
        .select('id, CustomerName, Address, Address2, Address3, Postcode, PhoneNumber, EmailAddress, Notes, NextClean, Price, Weeks, Route, Outstanding')
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

      await fetchQuotes()
      setQuoteData({
        CustomerName: '',
        Address: '',
        Address2: '',
        Address3: '',
        Postcode: '',
        PhoneNumber: '',
        EmailAddress: '',
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
      
      if (!services || services.length === 0) {
        alert('You need to add at least 1 service')
        // Open the customer modal and navigate to services tab
        setSelectedQuote(customer)
        setModalEditData({ ...customer })
        setShowQuoteModal(true)
        setShowServices(true)
        setShowHistory(false)
        setIsEditingModal(false)
        setServiceDropdownOpen(null)
        setEditingServiceId(null)
        setIsAddingService(false)
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
      setShowQuoteModal(false)
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
                                <div className="service-actions-dropdown">
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

export default Quotes
