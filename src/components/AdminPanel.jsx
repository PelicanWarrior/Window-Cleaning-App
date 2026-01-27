import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './AdminPanel.css'

function AdminPanel({ user, onClose }) {
  const [activeTab, setActiveTab] = useState('userLevels')
  const [userLevels, setUserLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [newLevel, setNewLevel] = useState({
    LevelName: '',
    MonthlyAmount: '',
    Customers: '',
    RoundAmount: ''
  })

  useEffect(() => {
    fetchUserLevels()
  }, [])

  async function fetchUserLevels() {
    try {
      const { data, error } = await supabase
        .from('UserLevel')
        .select('*')
        .order('id', { ascending: true })

      if (error) throw error
      setUserLevels(data || [])
    } catch (error) {
      console.error('Error fetching user levels:', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddLevel() {
    try {
      const { error } = await supabase
        .from('UserLevel')
        .insert([{
          LevelName: newLevel.LevelName,
          MonthlyAmount: parseFloat(newLevel.MonthlyAmount) || 0,
          Customers: parseInt(newLevel.Customers) || 0,
          RoundAmount: parseFloat(newLevel.RoundAmount) || 0
        }])

      if (error) throw error

      setNewLevel({ LevelName: '', MonthlyAmount: '', Customers: '', RoundAmount: '' })
      setIsAddingNew(false)
      fetchUserLevels()
    } catch (error) {
      console.error('Error adding user level:', error.message)
      alert('Error adding user level: ' + error.message)
    }
  }

  async function handleDeleteLevel(id) {
    if (!confirm('Are you sure you want to delete this user level?')) return

    try {
      const { error } = await supabase
        .from('UserLevel')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchUserLevels()
    } catch (error) {
      console.error('Error deleting user level:', error.message)
      alert('Error deleting user level: ' + error.message)
    }
  }

  function handleEditClick(level) {
    setEditingId(level.id)
    setEditData({
      LevelName: level.LevelName,
      MonthlyAmount: level.MonthlyAmount,
      Customers: level.Customers,
      RoundAmount: level.RoundAmount
    })
  }

  async function handleSaveEdit() {
    try {
      const { error } = await supabase
        .from('UserLevel')
        .update({
          LevelName: editData.LevelName,
          MonthlyAmount: parseFloat(editData.MonthlyAmount) || 0,
          Customers: parseInt(editData.Customers) || 0,
          RoundAmount: parseFloat(editData.RoundAmount) || 0
        })
        .eq('id', editingId)

      if (error) throw error

      setEditingId(null)
      setEditData({})
      fetchUserLevels()
    } catch (error) {
      console.error('Error updating user level:', error.message)
      alert('Error updating user level: ' + error.message)
    }
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditData({})
  }

  return (
    <div className="admin-panel-backdrop" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Admin Control</h2>

        <div className="admin-tabs">
          <button
            className={activeTab === 'userLevels' ? 'active' : ''}
            onClick={() => setActiveTab('userLevels')}
          >
            User Levels
          </button>
        </div>

        {activeTab === 'userLevels' && (
          <div className="admin-content">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <>
                <div className="user-levels-list">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Level Name</th>
                        <th>Monthly Amount</th>
                        <th>Customers</th>
                        <th>Round Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userLevels.map((level) => (
                        <tr key={level.id}>
                          <td>
                            {editingId === level.id ? (
                              <input
                                type="text"
                                value={editData.LevelName}
                                onChange={(e) => setEditData({ ...editData, LevelName: e.target.value })}
                              />
                            ) : (
                              level.LevelName
                            )}
                          </td>
                          <td>
                            {editingId === level.id ? (
                              <input
                                type="number"
                                step="0.01"
                                value={editData.MonthlyAmount}
                                onChange={(e) => setEditData({ ...editData, MonthlyAmount: e.target.value })}
                              />
                            ) : (
                              `£${level.MonthlyAmount}`
                            )}
                          </td>
                          <td>
                            {editingId === level.id ? (
                              <input
                                type="number"
                                value={editData.Customers}
                                onChange={(e) => setEditData({ ...editData, Customers: e.target.value })}
                              />
                            ) : (
                              level.Customers
                            )}
                          </td>
                          <td>
                            {editingId === level.id ? (
                              <input
                                type="number"
                                step="0.01"
                                value={editData.RoundAmount}
                                onChange={(e) => setEditData({ ...editData, RoundAmount: e.target.value })}
                              />
                            ) : (
                              `£${level.RoundAmount}`
                            )}
                          </td>
                          <td>
                            {editingId === level.id ? (
                              <>
                                <button className="save-edit-btn" onClick={handleSaveEdit}>Save</button>
                                <button className="cancel-edit-btn" onClick={handleCancelEdit}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button className="edit-btn" onClick={() => handleEditClick(level)}>Edit</button>
                                <button className="delete-btn" onClick={() => handleDeleteLevel(level.id)}>Delete</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isAddingNew ? (
                  <div className="add-level-form">
                    <h4>Add New User Level</h4>
                    <div className="form-row">
                      <input
                        type="text"
                        placeholder="Level Name"
                        value={newLevel.LevelName}
                        onChange={(e) => setNewLevel({ ...newLevel, LevelName: e.target.value })}
                      />
                      <input
                        type="number"
                        placeholder="Monthly Amount"
                        value={newLevel.MonthlyAmount}
                        onChange={(e) => setNewLevel({ ...newLevel, MonthlyAmount: e.target.value })}
                      />
                    </div>
                    <div className="form-row">
                      <input
                        type="number"
                        placeholder="Customers"
                        value={newLevel.Customers}
                        onChange={(e) => setNewLevel({ ...newLevel, Customers: e.target.value })}
                      />
                      <input
                        type="number"
                        placeholder="Round Amount"
                        value={newLevel.RoundAmount}
                        onChange={(e) => setNewLevel({ ...newLevel, RoundAmount: e.target.value })}
                      />
                    </div>
                    <div className="form-actions">
                      <button className="save-btn" onClick={handleAddLevel}>Save</button>
                      <button className="cancel-btn" onClick={() => {
                        setIsAddingNew(false)
                        setNewLevel({ LevelName: '', MonthlyAmount: '', Customers: '', RoundAmount: '' })
                      }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="add-new-btn" onClick={() => setIsAddingNew(true)}>
                    + Add New Level
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <button className="close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export default AdminPanel
