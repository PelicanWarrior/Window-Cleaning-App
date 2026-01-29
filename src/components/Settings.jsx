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
  const [activeTab, setActiveTab] = useState('userSettings')
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
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [averageMonthlyRound, setAverageMonthlyRound] = useState(0)
  const [routeBreakdown, setRouteBreakdown] = useState([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [accountLevelName, setAccountLevelName] = useState('')
  const [accountLevelCustomers, setAccountLevelCustomers] = useState(null)
  const [accountLevelRoundAmount, setAccountLevelRoundAmount] = useState(null)
  const [loadingAccountLevel, setLoadingAccountLevel] = useState(false)

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

  useEffect(() => {
    if (activeTab === 'myRound') {
      fetchCustomerCount()
    } else if (activeTab === 'accountLevel') {
      fetchAccountLevel()
      fetchCustomerCount()
    }
  }, [activeTab])

  async function fetchCustomerCount() {
    setLoadingCustomers(true)
    try {
      const { data, error } = await supabase
        .from('Customers')
        .select('id, Quote, NextClean, Price, Weeks, Route')
        .eq('UserId', user.id)

      if (error) throw error

      // Filter customers: exclude quotes, exclude empty NextClean, exclude dates before 2024-01-01
      const activeCustomers = data.filter(customer => {
        if (customer.Quote === true) return false
        if (!customer.NextClean) return false
        const nextCleanDate = new Date(customer.NextClean)
        const cutoffDate = new Date('2024-01-01')
        if (nextCleanDate < cutoffDate) return false
        return true
      })

      setTotalCustomers(activeCustomers.length)

      // Calculate Average Monthly Round: (Price / Weeks) * 4 for each customer
      const monthlyTotal = activeCustomers.reduce((sum, customer) => {
        const price = parseFloat(customer.Price) || 0
        const weeks = parseInt(customer.Weeks) || 1 // Avoid division by zero
        const monthlyValue = (price / weeks) * 4
        return sum + monthlyValue
      }, 0)

      setAverageMonthlyRound(monthlyTotal)

      // Group by Route
      const routeMap = {}
      activeCustomers.forEach(customer => {
        const route = customer.Route || 'No Route'
        if (!routeMap[route]) {
          routeMap[route] = {
            route: route,
            customers: 0,
            amount: 0
          }
        }
        routeMap[route].customers++
        const price = parseFloat(customer.Price) || 0
        const weeks = parseInt(customer.Weeks) || 1
        const monthlyValue = (price / weeks) * 4
        routeMap[route].amount += monthlyValue
      })

      // Convert to array and sort by route name
      const routeArray = Object.values(routeMap).sort((a, b) => 
        a.route.localeCompare(b.route)
      )

      setRouteBreakdown(routeArray)
    } catch (error) {
      console.error('Error fetching customer count:', error.message)
      setTotalCustomers(0)
      setAverageMonthlyRound(0)
      setRouteBreakdown([])
    } finally {
      setLoadingCustomers(false)
    }
  }

  async function fetchAccountLevel() {
    setLoadingAccountLevel(true)
    try {
      const accountLevelId = user.AccountLevel
      
      if (!accountLevelId) {
        setAccountLevelName('No account level set')
        setLoadingAccountLevel(false)
        return
      }

      const { data, error } = await supabase
        .from('UserLevel')
        .select('LevelName, Customers, RoundAmount')
        .eq('id', accountLevelId)
        .single()

      if (error) throw error

      setAccountLevelName(data?.LevelName || 'Unknown')
      setAccountLevelCustomers(data?.Customers)
      setAccountLevelRoundAmount(data?.RoundAmount)
    } catch (err) {
      console.error('Error fetching account level:', err)
      setAccountLevelName('Error loading level')
    } finally {
      setLoadingAccountLevel(false)
    }
  }

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
        
        <div className="settings-tabs">
          <button
            className={activeTab === 'userSettings' ? 'active' : ''}
            onClick={() => setActiveTab('userSettings')}
          >
            User Settings
          </button>
          <button
            className={activeTab === 'myRound' ? 'active' : ''}
            onClick={() => setActiveTab('myRound')}
          >
            My Round
          </button>
          <button
            className={activeTab === 'accountLevel' ? 'active' : ''}
            onClick={() => setActiveTab('accountLevel')}
          >
            Account Level
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        
        {activeTab === 'userSettings' && (
          <>
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
          </>
        )}

        {activeTab === 'myRound' && (
          <>
            <div className="my-round-content">
              {loadingCustomers ? (
                <p>Loading...</p>
              ) : (
                <>
                  <h4 className="my-round-stat">Total Customers: {totalCustomers}</h4>
                  <h4 className="my-round-stat">Average Monthly Round: £{averageMonthlyRound.toFixed(2)}</h4>
                  
                  <div className="route-breakdown">
                    <h4 className="route-breakdown-title">Route Breakdown</h4>
                    <table className="route-table">
                      <thead>
                        <tr>
                          <th>Route</th>
                          <th>Customers</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeBreakdown.map((route, index) => (
                          <tr key={index}>
                            <td>{route.route}</td>
                            <td>{route.customers}</td>
                            <td>£{route.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="route-total">
                          <td><strong>Total</strong></td>
                          <td><strong>{totalCustomers}</strong></td>
                          <td><strong>£{averageMonthlyRound.toFixed(2)}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="settings-actions">
              <button className="cancel-btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {activeTab === 'accountLevel' && (
          <>
            <div className="account-level-content">
              {loadingAccountLevel ? (
                <p>Loading...</p>
              ) : (
                <>
                  <h4 className="account-level-stat">Your Account Level: {accountLevelName}</h4>
                  {accountLevelCustomers != null && accountLevelRoundAmount != null && 
                   !String(accountLevelCustomers).match(/^9+$/) && 
                   !String(accountLevelRoundAmount).match(/^9+$/) && (
                    <>
                      {(totalCustomers > accountLevelCustomers || averageMonthlyRound > accountLevelRoundAmount) ? (
                        <p className="account-level-warning" style={{ color: 'red', fontWeight: 'bold' }}>
                          You are more than your limit of customers. You will not be able to use any features until you increase your Level
                        </p>
                      ) : (
                        <p className="account-level-message">
                          This entitles you to register {accountLevelCustomers} Customers or £{accountLevelRoundAmount} for your Monthly round, whichever is first. If you go beyond this then you will need to register for the next tier up.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="settings-actions">
              <button className="cancel-btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Settings
