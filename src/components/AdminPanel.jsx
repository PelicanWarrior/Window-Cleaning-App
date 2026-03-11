import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { LANDING_PICTURES } from '../config/landingPictures'
import './AdminPanel.css'

const pictureMapByName = LANDING_PICTURES.reduce((acc, picture) => {
  acc[picture.fileName] = picture
  return acc
}, {})

function sortCaptionRows(rows) {
  return [...rows].sort((a, b) => {
    const orderA = Number(a.display_order) || Number.MAX_SAFE_INTEGER
    const orderB = Number(b.display_order) || Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return String(a.picture_key).localeCompare(String(b.picture_key))
  })
}

function resequenceCaptionRows(rows) {
  return rows.map((row, index) => ({
    ...row,
    display_order: index + 1
  }))
}

function AdminPanel({ user, onClose }) {
  const [activeTab, setActiveTab] = useState('userLevels')
  const [userLevels, setUserLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [captionsLoading, setCaptionsLoading] = useState(true)
  const [pictureCaptions, setPictureCaptions] = useState([])
  const [captionsStatus, setCaptionsStatus] = useState('')
  const [savingCaptions, setSavingCaptions] = useState(false)
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
    fetchPictureCaptions()
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

  async function fetchPictureCaptions() {
    setCaptionsLoading(true)
    setCaptionsStatus('')

    const fallbackRows = LANDING_PICTURES.map((picture) => ({
      picture_key: picture.fileName,
      caption: picture.defaultCaption,
      display_order: picture.order
    }))

    if (!LANDING_PICTURES.length) {
      setPictureCaptions([])
      setCaptionsLoading(false)
      return
    }

    try {
      const pictureKeys = LANDING_PICTURES.map((picture) => picture.fileName)
      const { data, error } = await supabase
        .from('PictureCaptions')
        .select('picture_key, caption, display_order')
        .in('picture_key', pictureKeys)

      if (error) {
        setPictureCaptions(fallbackRows)
        setCaptionsStatus('Could not load captions from Supabase yet. Run supabase/picture_captions.sql and refresh.')
        throw error
      }

      const captionLookup = {}
      const orderLookup = {}
      for (const row of data || []) {
        captionLookup[row.picture_key] = row.caption || ''
        if (Number.isFinite(row.display_order)) {
          orderLookup[row.picture_key] = row.display_order
        }
      }

      const mergedRows = sortCaptionRows(LANDING_PICTURES.map((picture) => ({
        picture_key: picture.fileName,
        caption: typeof captionLookup[picture.fileName] === 'string' && captionLookup[picture.fileName].trim()
          ? captionLookup[picture.fileName]
          : picture.defaultCaption,
        display_order: Number.isFinite(orderLookup[picture.fileName])
          ? orderLookup[picture.fileName]
          : picture.order
      })))

      setPictureCaptions(resequenceCaptionRows(mergedRows))
    } catch (error) {
      console.error('Error fetching picture captions:', error.message)
    } finally {
      setCaptionsLoading(false)
    }
  }

  function handleCaptionChange(pictureKey, value) {
    setPictureCaptions((prev) => prev.map((row) => {
      if (row.picture_key !== pictureKey) return row
      return { ...row, caption: value }
    }))
  }

  function handleMovePicture(pictureKey, direction) {
    setPictureCaptions((prev) => {
      const rows = sortCaptionRows(prev)
      const index = rows.findIndex((row) => row.picture_key === pictureKey)
      if (index < 0) return prev

      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= rows.length) return prev

      const swapped = [...rows]
      const temp = swapped[index]
      swapped[index] = swapped[targetIndex]
      swapped[targetIndex] = temp

      return resequenceCaptionRows(swapped)
    })
  }

  async function handleSaveCaptions() {
    setSavingCaptions(true)
    setCaptionsStatus('')

    try {
      const orderedRows = resequenceCaptionRows(sortCaptionRows(pictureCaptions))
      const payload = orderedRows.map((row) => ({
        picture_key: row.picture_key,
        caption: (row.caption || '').trim(),
        display_order: row.display_order
      }))

      const { error } = await supabase
        .from('PictureCaptions')
        .upsert(payload, { onConflict: 'picture_key' })

      if (error) throw error

      setPictureCaptions(orderedRows)
      setCaptionsStatus('Picture captions saved.')
    } catch (error) {
      console.error('Error saving picture captions:', error.message)
      setCaptionsStatus(`Could not save captions: ${error.message}`)
    } finally {
      setSavingCaptions(false)
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
          <button
            className={activeTab === 'pictureCaptions' ? 'active' : ''}
            onClick={() => setActiveTab('pictureCaptions')}
          >
            Picture Captions
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

        {activeTab === 'pictureCaptions' && (
          <div className="admin-content">
            {captionsLoading ? (
              <div className="loading">Loading picture captions...</div>
            ) : (
              <div className="picture-captions-manager">
                <p className="picture-captions-help">Edit captions shown below the screenshots on the intro page.</p>
                <p className="picture-captions-help">Use Move Up and Move Down to control display order on the first page.</p>
                {captionsStatus && <div className="picture-captions-status">{captionsStatus}</div>}

                <div className="picture-captions-grid">
                  {sortCaptionRows(pictureCaptions).map((row, index, rows) => {
                    const picture = pictureMapByName[row.picture_key]
                    return (
                      <div className="picture-caption-card" key={row.picture_key}>
                        {picture?.src ? (
                          <img src={picture.src} alt={row.picture_key} className="picture-caption-preview" />
                        ) : (
                          <div className="picture-caption-missing">Image not found</div>
                        )}
                        <p className="picture-caption-file">{row.picture_key}</p>
                        <div className="picture-caption-order-controls">
                          <span className="picture-caption-order-label">Position {row.display_order}</span>
                          <div className="picture-caption-order-buttons">
                            <button
                              type="button"
                              className="small-action-btn"
                              onClick={() => handleMovePicture(row.picture_key, -1)}
                              disabled={index === 0}
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              className="small-action-btn"
                              onClick={() => handleMovePicture(row.picture_key, 1)}
                              disabled={index === rows.length - 1}
                            >
                              Move Down
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={row.caption}
                          onChange={(event) => handleCaptionChange(row.picture_key, event.target.value)}
                          rows={3}
                          placeholder="Write a caption..."
                        />
                      </div>
                    )
                  })}
                </div>

                <button className="save-btn" onClick={handleSaveCaptions} disabled={savingCaptions || pictureCaptions.length === 0}>
                  {savingCaptions ? 'Saving...' : 'Save Captions'}
                </button>
              </div>
            )}
          </div>
        )}

        <button className="close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export default AdminPanel
