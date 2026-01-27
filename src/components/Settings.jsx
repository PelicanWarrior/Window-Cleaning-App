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
  const [address1, setAddress1] = useState(user['Address 1'] || '')
  const [address2, setAddress2] = useState(user['Address 2'] || '')
  const [town, setTown] = useState(user.Town || '')
  const [postcode, setPostcode] = useState(user.Postcode || '')
  const [country, setCountry] = useState(user.SettingsCountry || 'United Kingdom')
  const [routeWeeks, setRouteWeeks] = useState(user.RouteWeeks || '')
  const [vatRegistered, setVatRegistered] = useState(user.VAT || false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCompanyName(user.CompanyName || '')
    setAddress1(user['Address 1'] || '')
    setAddress2(user['Address 2'] || '')
    setTown(user.Town || '')
    setPostcode(user.Postcode || '')
    setCountry(user.SettingsCountry || 'United Kingdom')
    setRouteWeeks(user.RouteWeeks || '')
    setVatRegistered(user.VAT || false)
  }, [user])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const updateFields = { 
        CompanyName: companyName, 
        SettingsCountry: country, 
        RouteWeeks: routeWeeks || null, 
        VAT: vatRegistered 
      }
      
      // Add address fields if they have values
      if (address1) updateFields['Address 1'] = address1
      if (address2) updateFields['Address 2'] = address2
      if (town) updateFields.Town = town
      if (postcode) updateFields.Postcode = postcode
      
      if (password) {
        updateFields.password = password
      }

      const { error: updateError, data } = await supabase
        .from('Users')
        .update(updateFields)
        .eq('id', user.id)
        .select()
        .single()

      if (updateError) {
        // If error is about missing columns, show helpful message
        if (updateError.message.includes('Address') || updateError.message.includes('Town')) {
          setError('Address columns need to be added to Supabase Users table. Please add: Address 1, Address 2, Town, Postcode columns as text fields.')
        } else {
          throw updateError
        }
      } else {
        // If VAT is being toggled to true, update all customers
        if (vatRegistered && !user.VAT) {
          const { error: customerError } = await supabase
            .from('Customers')
            .update({ VAT: true })
            .eq('UserId', user.id)
          
          if (customerError) throw customerError
        }

        const updatedFields = { SettingsCountry: country, RouteWeeks: routeWeeks, VAT: vatRegistered, ...(password ? { password } : {}) }
        
        // Add address fields to the callback
        if (address1) updatedFields['Address 1'] = address1
        if (address2) updatedFields['Address 2'] = address2
        if (town) updatedFields.Town = town
        if (postcode) updatedFields.Postcode = postcode
        
        onSaved(updatedFields)
      }
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
          <div className="address-section">
            <h4>Address</h4>
            <div className="address-fields">
              <div className="settings-field">
                <input
                  type="text"
                  placeholder="Address 1"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <input
                  type="text"
                  placeholder="Address 2"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <input
                  type="text"
                  placeholder="Town"
                  value={town}
                  onChange={(e) => setTown(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="address-section">
            <h4>Postcode</h4>
            <div className="settings-field">
              <input
                type="text"
                placeholder="Postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
            </div>
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
