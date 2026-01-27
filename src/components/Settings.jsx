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
  const [companyName, setCompanyName] = useState(user.CompanyName || '')
  const [country, setCountry] = useState(user.SettingsCountry || 'United Kingdom')
  const [routeWeeks, setRouteWeeks] = useState(user.RouteWeeks || '')
  const [vatRegistered, setVatRegistered] = useState(user.VAT || false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCompanyName(user.CompanyName || '')
    setCountry(user.SettingsCountry || 'United Kingdom')
    setRouteWeeks(user.RouteWeeks || '')
    setVatRegistered(user.VAT || false)
  }, [user])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const updateFields = { CompanyName: companyName, SettingsCountry: country, RouteWeeks: routeWeeks || null, VAT: vatRegistered }
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

      // If VAT is being toggled to true, update all customers
      if (vatRegistered && !user.VAT) {
        const { error: customerError } = await supabase
          .from('Customers')
          .update({ VAT: true })
          .eq('UserId', user.id)
        
        if (customerError) throw customerError
      }

      onSaved({ SettingsCountry: country, RouteWeeks: routeWeeks, VAT: vatRegistered, ...(password ? { password } : {}) })
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
            <label>Company Name</label>
            <input
              type="text"
              placeholder="Enter your company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
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
          <div className="settings-field vat-field">
            <label>
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
              />
              VAT Registered
            </label>
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
