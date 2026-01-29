import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateByCountry } from '../lib/format'
import './CustomerList.css'

function CustomerDetailsModal({ 
  isOpen, 
  customer, 
  user, 
  onClose, 
  onSave 
}) {
  const [isEditingModal, setIsEditingModal] = useState(false)
  const [modalEditData, setModalEditData] = useState({})
  const [showServices, setShowServices] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [customerServices, setCustomerServices] = useState([])
  const [isAddingService, setIsAddingService] = useState(false)
  const [newServiceData, setNewServiceData] = useState({ Service: '', Price: '', Description: '' })
  const [customerHistory, setCustomerHistory] = useState([])
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [editServiceData, setEditServiceData] = useState({})
  const [selectedDays, setSelectedDays] = useState({})

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const dayShortcuts = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']

  if (!isOpen || !customer) return null

  const getFullAddress = (customer) => {
    const parts = [customer.Address, customer.Address2, customer.Address3, customer.Postcode]
      .filter(part => part && part.trim())
    return parts.length > 0 ? parts.join(', ') : '—'
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

  const handleEditClick = () => {
    setIsEditingModal(true)
    setModalEditData({...customer})
    setSelectedDays(parsePreferredDays(customer.PrefferedDays))
  }

  const handleDayToggle = (day) => {
    setSelectedDays({
      ...selectedDays,
      [day]: !selectedDays[day]
    })
  }

  const fetchCustomerServices = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('CustomerServices')
        .select('*')
        .eq('CustomerId', customerId)
        .order('Service', { ascending: true })

      if (error) throw error
      setCustomerServices(data || [])
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const fetchCustomerHistory = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('CustomerHistory')
        .select('*')
        .eq('CustomerId', customerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCustomerHistory(data || [])
    } catch (error) {
      console.error('Error fetching history:', error)
    }
  }

  const handleModalSave = async () => {
    try {
      const dataToSave = {
        ...modalEditData,
        PrefferedDays: formatPreferredDays(selectedDays)
      }

      const { error } = await supabase
        .from('Customers')
        .update(dataToSave)
        .eq('id', customer.id)

      if (error) throw error
      setIsEditingModal(false)
      onSave(dataToSave)
    } catch (error) {
      console.error('Error saving customer:', error)
      alert('Error saving customer: ' + error.message)
    }
  }

  const handleAddService = async () => {
    if (!newServiceData.Service.trim()) {
      alert('Please enter a service name')
      return
    }

    try {
      const { error } = await supabase
        .from('CustomerServices')
        .insert([{
          CustomerId: customer.id,
          Service: newServiceData.Service,
          Price: newServiceData.Price || 0,
          Description: newServiceData.Description
        }])

      if (error) throw error

      setNewServiceData({ Service: '', Price: '', Description: '' })
      setIsAddingService(false)
      fetchCustomerServices(customer.id)
    } catch (error) {
      console.error('Error adding service:', error)
      alert('Error adding service: ' + error.message)
    }
  }

  const handleDeleteService = async (serviceId) => {
    if (!confirm('Are you sure you want to delete this service?')) return

    try {
      const { error } = await supabase
        .from('CustomerServices')
        .delete()
        .eq('id', serviceId)

      if (error) throw error
      fetchCustomerServices(customer.id)
    } catch (error) {
      console.error('Error deleting service:', error)
      alert('Error deleting service: ' + error.message)
    }
  }

  const handleEditService = (service) => {
    setEditingServiceId(service.id)
    setEditServiceData({...service})
  }

  const handleSaveService = async () => {
    try {
      const { error } = await supabase
        .from('CustomerServices')
        .update(editServiceData)
        .eq('id', editingServiceId)

      if (error) throw error
      setEditingServiceId(null)
      fetchCustomerServices(customer.id)
    } catch (error) {
      console.error('Error updating service:', error)
      alert('Error updating service: ' + error.message)
    }
  }

  const handleCloseModal = () => {
    setIsEditingModal(false)
    setShowServices(false)
    setShowHistory(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleCloseModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleCloseModal}>×</button>
        <h3>{showHistory ? 'Customer History' : showServices ? 'Customer Services' : 'Customer Details'}</h3>
        
        <div className="modal-actions">
          {isEditingModal ? (
            <>
              <button className="modal-save-btn" onClick={handleModalSave}>Save</button>
              <button className="modal-cancel-btn" onClick={() => setIsEditingModal(false)}>Cancel</button>
            </>
          ) : (
            <>
              {!showServices && !showHistory && <button className="modal-edit-btn" onClick={handleEditClick}>Edit</button>}
              <button className="modal-services-btn" onClick={() => { setShowServices(!showServices); setShowHistory(false); if (!showServices) fetchCustomerServices(customer.id); }}>{showServices ? 'Customer Details' : 'Services'}</button>
              <button className="modal-history-btn" onClick={() => { setShowHistory(!showHistory); setShowServices(false); if (!showHistory) fetchCustomerHistory(customer.id); }}>{showHistory ? 'Customer Details' : 'History'}</button>
            </>
          )}
        </div>
        
        {!showServices && !showHistory ? (
          // Customer Details View
          isEditingModal ? (
            <div className="details-grid-edit">
              <div className="full-width"><strong>Name:</strong> <input type="text" value={modalEditData.CustomerName} onChange={(e) => setModalEditData({...modalEditData, CustomerName: e.target.value})} className="modal-input" /></div>
              <div className="full-width address-section">
                <strong>Address:</strong>
                <input type="text" value={modalEditData.Address} onChange={(e) => setModalEditData({...modalEditData, Address: e.target.value})} className="modal-input" placeholder="Address Line 1" />
                <input type="text" value={modalEditData.Address2} onChange={(e) => setModalEditData({...modalEditData, Address2: e.target.value})} className="modal-input" placeholder="Address Line 2" />
                <input type="text" value={modalEditData.Address3} onChange={(e) => setModalEditData({...modalEditData, Address3: e.target.value})} className="modal-input" placeholder="Address Line 3" />
              </div>
              <div><strong>Postcode:</strong> <input type="text" value={modalEditData.Postcode} onChange={(e) => setModalEditData({...modalEditData, Postcode: e.target.value})} className="modal-input" /></div>
              <div><strong>Phone:</strong> <input type="tel" value={modalEditData.PhoneNumber} onChange={(e) => setModalEditData({...modalEditData, PhoneNumber: e.target.value})} className="modal-input" /></div>
              <div><strong>Email:</strong> <input type="email" value={modalEditData.EmailAddress} onChange={(e) => setModalEditData({...modalEditData, EmailAddress: e.target.value})} className="modal-input" /></div>
              <div><strong>Route:</strong> <input type="text" value={modalEditData.Route} onChange={(e) => setModalEditData({...modalEditData, Route: e.target.value})} className="modal-input" /></div>
              <div className="inline-fields">
                <div className="inline-field"><strong>Price:</strong> <input type="number" value={modalEditData.Price} onChange={(e) => setModalEditData({...modalEditData, Price: e.target.value})} className="modal-input" /></div>
                <div className="inline-field"><strong>Weeks:</strong> <input type="number" value={modalEditData.Weeks} onChange={(e) => setModalEditData({...modalEditData, Weeks: e.target.value})} className="modal-input" /></div>
              </div>
              <div><strong>Next Clean:</strong> <input type="date" value={modalEditData.NextClean} onChange={(e) => setModalEditData({...modalEditData, NextClean: e.target.value})} className="modal-input" /></div>
              <div><strong>Outstanding:</strong> <input type="number" value={modalEditData.Outstanding} onChange={(e) => setModalEditData({...modalEditData, Outstanding: e.target.value})} className="modal-input" /></div>
              <div><strong>Route:</strong> <input type="text" value={modalEditData.Route} onChange={(e) => setModalEditData({...modalEditData, Route: e.target.value})} className="modal-input" /></div>
              <div><strong>VAT Registered:</strong> <input type="checkbox" checked={modalEditData.VAT || false} onChange={(e) => setModalEditData({...modalEditData, VAT: e.target.checked})} /></div>
              <div className="full-width">
                <strong>Preferred Days:</strong>
                <div className="days-checkboxes">
                  {daysOfWeek.map((day, index) => (
                    <label key={day} style={{ marginRight: '1rem', display: 'inline-flex', alignItems: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedDays[day] || false}
                        onChange={() => handleDayToggle(day)}
                        style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                      />
                      {dayShortcuts[index]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="full-width"><strong>Notes:</strong> <textarea value={modalEditData.Notes} onChange={(e) => setModalEditData({...modalEditData, Notes: e.target.value})} className="modal-input" rows="2" /></div>
            </div>
          ) : (
            <div className="details-grid">
              <div><strong>Name:</strong> {customer.CustomerName}</div>
              <div><strong>Address:</strong> {getFullAddress(customer)}</div>
              <div><strong>Phone:</strong> {customer.PhoneNumber || '—'}</div>
              <div><strong>Email:</strong> {customer.EmailAddress || '—'}</div>
              <div><strong>Price:</strong> {formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}</div>
              <div><strong>Weeks:</strong> {customer.Weeks}</div>
              <div><strong>Next Clean:</strong> {formatDateByCountry(customer.NextClean, user.SettingsCountry || 'United Kingdom')}</div>
              <div><strong>Outstanding:</strong> {formatCurrency(customer.Outstanding, user.SettingsCountry || 'United Kingdom')}</div>
              <div><strong>Route:</strong> {customer.Route || '—'}</div>
              <div><strong>VAT Registered:</strong> {customer.VAT ? 'Yes' : 'No'}</div>
              <div><strong>Preferred Days:</strong> {customer.PrefferedDays || '—'}</div>
              <div className="notes-cell"><strong>Notes:</strong> {customer.Notes || '—'}</div>
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
              <div className="service-items">
                {customerServices.map((service) => (
                  <div key={service.id} className="service-item">
                    {editingServiceId === service.id ? (
                      <div className="edit-service-form">
                        <div>
                          <label><strong>Service:</strong></label>
                          <input 
                            type="text" 
                            value={editServiceData.Service} 
                            onChange={(e) => setEditServiceData({...editServiceData, Service: e.target.value})} 
                            className="modal-input"
                          />
                        </div>
                        <div>
                          <label><strong>Price:</strong></label>
                          <input 
                            type="number" 
                            value={editServiceData.Price} 
                            onChange={(e) => setEditServiceData({...editServiceData, Price: e.target.value})} 
                            className="modal-input"
                          />
                        </div>
                        <div>
                          <label><strong>Description:</strong></label>
                          <input 
                            type="text" 
                            value={editServiceData.Description} 
                            onChange={(e) => setEditServiceData({...editServiceData, Description: e.target.value})} 
                            className="modal-input"
                          />
                        </div>
                        <div className="service-item-actions">
                          <button className="modal-save-btn" onClick={handleSaveService}>Save</button>
                          <button className="modal-cancel-btn" onClick={() => setEditingServiceId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="service-info">
                          <strong>{service.Service}</strong>
                          {service.Description && <p>{service.Description}</p>}
                          <p>Price: {formatCurrency(service.Price, user.SettingsCountry || 'United Kingdom')}</p>
                        </div>
                        <div className="service-item-actions">
                          <button className="modal-edit-btn" onClick={() => handleEditService(service)}>Edit</button>
                          <button className="delete-service-btn" onClick={() => handleDeleteService(service.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CustomerDetailsModal
