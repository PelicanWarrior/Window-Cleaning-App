import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Settings.css'

const COUNTRY_OPTIONS = [
  'United Kingdom',
  'United States',
  'Ireland',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Canada',
  'Australia',
  'New Zealand'
]

function Settings({ user, onClose, onSaved }) {
  const [password, setPassword] = useState('')
  const [country, setCountry] = useState(user.SettingsCountry || 'United Kingdom')
  const [routeWeeks, setRouteWeeks] = useState(user.RouteWeeks || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCountry(user.SettingsCountry || 'United Kingdom')
    setRouteWeeks(user.RouteWeeks || '')
  }, [user])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const updateFields = { SettingsCountry: country, RouteWeeks: routeWeeks || null }
      if (password) {
        updateFields.password = password
      }

      const { error: updateError, data } = await supabase
        .from('Users')
        .update(updateFields)
        .eq('id', user.id)
        .select()
        .single()

      if (updateError) throw updateError

      onSaved({ SettingsCountry: country, RouteWeeks: routeWeeks, ...(password ? { password } : {}) })
    } catch (err) {
      setError(err.message || 'Error saving settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        {error && <div className="error-message">{error}</div>}
        <div className="settings-grid">
          <div className="settings-field">
            <label>Username</label>
            <input type="text" value={user.UserName} disabled />
          </div>
          <div className="settings-field">
            <label>New Password</label>
            <input
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="settings-field">
            <label>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="settings-field route-weeks-field">
            <label>Length of Route</label>
            <div className="route-weeks-input-row">
              <input
                type="number"
                value={routeWeeks}
                onChange={(e) => setRouteWeeks(e.target.value)}
                placeholder="e.g., 4"
                min="1"
              />
              <span className="weeks-label">Weeks</span>
            </div>
          </div>
        </div>
        <div className="settings-actions">
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="cancel-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default Settings
