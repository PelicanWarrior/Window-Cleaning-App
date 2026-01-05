import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './CustomerList.css'

function CustomerList({ user }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState(user.CustomerSort || 'Route')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showFindForm, setShowFindForm] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [filters, setFilters] = useState({
    CustomerName: '',
    Address: '',
    PhoneNumber: '',
    Route: ''
  })
  const [newCustomer, setNewCustomer] = useState({
    CustomerName: '',
    Address: '',
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

      const { error } = await supabase
        .from('Customers')
        .insert([customerData])
      
      if (error) throw error
      
      setNewCustomer({ 
        CustomerName: '', 
        Address: '', 
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
      PhoneNumber: customer.PhoneNumber || '',
      EmailAddress: customer.EmailAddress || '',
      Price: customer.Price,
      Weeks: customer.Weeks,
      Route: customer.Route || '',
      Notes: customer.Notes || ''
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
          PhoneNumber: editFormData.PhoneNumber,
          EmailAddress: editFormData.EmailAddress,
          Price: parseInt(editFormData.Price) || 0,
          Weeks: parseInt(editFormData.Weeks) || 4,
          Route: editFormData.Route,
          Notes: editFormData.Notes
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
          <h3>Add New Customer</h3>
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
            <input
              type="number"
              placeholder="Price"
              value={newCustomer.Price}
              onChange={(e) => setNewCustomer({...newCustomer, Price: e.target.value})}
              required
            />
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
                <th>Name</th>
                <th>Address</th>
                <th>Contact Details</th>
                <th>Price</th>
                <th>Weeks</th>
                <th>Next Clean</th>
                <th>Outstanding</th>
                <th>Route</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  {editingCustomerId === customer.id ? (
                    <>
                      <td>
                        <input
                          type="text"
                          value={editFormData.CustomerName}
                          onChange={(e) => setEditFormData({...editFormData, CustomerName: e.target.value})}
                          className="edit-input"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={editFormData.Address}
                          onChange={(e) => setEditFormData({...editFormData, Address: e.target.value})}
                          className="edit-input"
                        />
                      </td>
                      <td>
                        <input
                          type="tel"
                          value={editFormData.PhoneNumber}
                          onChange={(e) => setEditFormData({...editFormData, PhoneNumber: e.target.value})}
                          className="edit-input"
                          placeholder="Phone"
                        />
                        <input
                          type="email"
                          value={editFormData.EmailAddress}
                          onChange={(e) => setEditFormData({...editFormData, EmailAddress: e.target.value})}
                          className="edit-input"
                          placeholder="Email"
                          style={{marginTop: '0.5rem'}}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editFormData.Price}
                          onChange={(e) => setEditFormData({...editFormData, Price: e.target.value})}
                          className="edit-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editFormData.Weeks}
                          onChange={(e) => setEditFormData({...editFormData, Weeks: e.target.value})}
                          className="edit-input"
                        />
                      </td>
                      <td>{customer.NextClean ? new Date(customer.NextClean).toLocaleDateString('en-GB') : '-'}</td>
                      <td>{customer.Outstanding > 0 ? `£${customer.Outstanding}` : '-'}</td>
                      <td>
                        <input
                          type="text"
                          value={editFormData.Route}
                          onChange={(e) => setEditFormData({...editFormData, Route: e.target.value})}
                          className="edit-input"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={editFormData.Notes}
                          onChange={(e) => setEditFormData({...editFormData, Notes: e.target.value})}
                          className="edit-input"
                        />
                      </td>
                      <td>
                        <button onClick={() => handleSaveEdit(customer.id)} className="save-btn">
                          Save
                        </button>
                        <button onClick={handleCancelEdit} className="cancel-edit-btn">
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{customer.CustomerName}</td>
                      <td>{customer.Address}</td>
                      <td>
                        <div>{customer.PhoneNumber || '-'}</div>
                        <div style={{fontSize: '0.9em', color: '#666'}}>{customer.EmailAddress || '-'}</div>
                      </td>
                      <td>£{customer.Price}</td>
                      <td>{customer.Weeks}</td>
                      <td>{customer.NextClean ? new Date(customer.NextClean).toLocaleDateString('en-GB') : '-'}</td>
                      <td className={customer.Outstanding > 0 ? 'outstanding' : ''}>
                        {customer.Outstanding > 0 ? `£${customer.Outstanding}` : '-'}
                      </td>
                      <td>{customer.Route || '-'}</td>
                      <td className="notes-cell">{customer.Notes || '-'}</td>
                      <td>
                        <button 
                          onClick={() => handleEditCustomer(customer)}
                          className="edit-btn"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => deleteCustomer(customer.id)}
                          className="delete-btn"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default CustomerList
