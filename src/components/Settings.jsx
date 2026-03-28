import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getCountryUpdateFields, getUserCountry } from '../lib/format'
import { APP_VERSION } from '../config/appVersion'
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

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function getFunctionErrorMessage(error, fallback) {
  if (error?.context) {
    try {
      const json = await error.context.json()
      if (json?.error) return json.error
      if (json?.message) return json.message
      return JSON.stringify(json)
    } catch {
      try {
        const text = await error.context.text()
        if (text) return text
      } catch {
        // ignore
      }
    }
  }

  return error?.message || fallback
}

function Settings({ user, onClose, onSaved, initialTab = 'userSettings', isGuest = false, onRequireAuth }) {
  const isAdmin = Boolean(user?.admin)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState(user.CompanyName || '')
  const [address1, setAddress1] = useState(user['Address 1'] || '')
  const [address2, setAddress2] = useState(user['Address 2'] || '')
  const [town, setTown] = useState(user.Town || '')
  const [postcode, setPostcode] = useState(user.Postcode || '')
  const [country, setCountry] = useState(getUserCountry(user))
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
  const [userLevels, setUserLevels] = useState([])
  const [loadingUserLevels, setLoadingUserLevels] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('')
  const [currentAccountLevelId, setCurrentAccountLevelId] = useState(user.AccountLevel || null)
  const [systemSubject, setSystemSubject] = useState('')
  const [systemMessage, setSystemMessage] = useState('')
  const [systemMessageStatus, setSystemMessageStatus] = useState('')

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    setCompanyName(user.CompanyName || '')
    setAddress1(user['Address 1'] || '')
    setAddress2(user['Address 2'] || '')
    setTown(user.Town || '')
    setPostcode(user.Postcode || '')
    setCountry(getUserCountry(user))
    setRouteWeeks(user.RouteWeeks || '')
    setVatRegistered(user.VAT || false)
    setCurrentAccountLevelId(user.AccountLevel || null)
    
    // Re-fetch account level when user changes (e.g., after payment)
    if (activeTab === 'accountLevel') {
      fetchAccountLevel()
    }
  }, [user, activeTab])

  useEffect(() => {
    if (activeTab === 'myRound') {
      fetchCustomerCount()
    } else if (activeTab === 'accountLevel') {
      fetchAccountLevel()
      fetchCustomerCount()
      fetchUserLevels()
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

  async function fetchUserLevels() {
    setLoadingUserLevels(true)
    try {
      const { data, error } = await supabase
        .from('UserLevel')
        .select('id, LevelName, MonthlyAmount, Customers, RoundAmount')
        .in('LevelName', ['Bronze', 'Silver', 'Gold'])
        .order('id', { ascending: true })

      if (error) throw error
      setUserLevels(data || [])
    } catch (err) {
      console.error('Error fetching user levels:', err)
      setUserLevels([])
    } finally {
      setLoadingUserLevels(false)
    }
  }

  const handleSelectLevel = async (level) => {
    if (isGuest) {
      onRequireAuth?.()
      return
    }

    setCheckoutError('')
    setPortalError('')
    setConnectionStatus('')

    const pendingAccountLevelKey = 'pendingAccountLevelId'

    if (!level || level.id === currentAccountLevelId) return

    const monthlyAmount = parseFloat(level.MonthlyAmount) || 0
    if (monthlyAmount <= 0) {
      const proceed = confirm('Switch to the free plan? If you have an active subscription, cancel it in Stripe first.')
      if (!proceed) return

      try {
        const { error } = await supabase
          .from('Users')
          .update({ AccountLevel: level.id })
          .eq('id', user.id)

        if (error) throw error

        setCurrentAccountLevelId(level.id)
        onSaved({ AccountLevel: level.id })
        fetchAccountLevel()
        window.localStorage.removeItem(pendingAccountLevelKey)
      } catch (err) {
        setCheckoutError(err.message || 'Failed to update account level')
      }
      return
    }

    try {
      setCheckoutLoading(level.id)
      if (!user?.id) {
        throw new Error('Missing user id')
      }

      window.localStorage.setItem(pendingAccountLevelKey, String(level.id))

      const { data, error } = await supabase.functions.invoke('create_checkout_session', {
        body: {
          userId: user.id,
          accountLevelId: level.id,
          userEmail: user.email_address || user.email || null,
          userName: user.UserName || null,
          debug: user?.AccountLevel === 4
        },
        headers: SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : undefined
      })

      if (error) {
        const message = await getFunctionErrorMessage(error, 'Unable to start checkout')
        throw new Error(message)
      }

      if (data?.updated) {
        setCurrentAccountLevelId(level.id)
        onSaved({ AccountLevel: level.id })
        fetchAccountLevel()
        window.localStorage.removeItem(pendingAccountLevelKey)
        return
      }

      if (data?.alreadyOnPlan) {
        window.localStorage.removeItem(pendingAccountLevelKey)
        setCheckoutError(data?.message || 'You are already on this plan')
        return
      }

      if (!data?.url) {
        throw new Error('Stripe checkout session did not return a URL')
      }

      window.location.assign(data.url)
    } catch (err) {
      window.localStorage.removeItem(pendingAccountLevelKey)
      setCheckoutError(err.message || 'Unable to start checkout')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleManageBilling = async () => {
    if (isGuest) {
      onRequireAuth?.()
      return
    }

    setPortalError('')
    setConnectionStatus('')
    try {
      setPortalLoading(true)
      const { data, error } = await supabase.functions.invoke('create_portal_session', {
        body: { userId: user.id },
        headers: SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : undefined
      })

      if (error) {
        const message = await getFunctionErrorMessage(error, 'Unable to open billing portal')
        throw new Error(message)
      }
      if (!data?.url) throw new Error('No billing portal URL returned')

      window.location.assign(data.url)
    } catch (err) {
      setPortalError(err.message || 'Unable to open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setConnectionStatus('')
    setCheckoutError('')
    setPortalError('')
    try {
      const { data, error } = await supabase.functions.invoke('health_check', {
        headers: SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : undefined
      })
      if (error) {
        const message = await getFunctionErrorMessage(error, 'Billing connection failed')
        throw new Error(message)
      }
      if (!data?.ok) throw new Error('Health check did not return ok')

      const stripe = data?.stripe || {}
      const mode = stripe.balanceLivemode === true
        ? 'Live'
        : stripe.balanceLivemode === false
          ? 'Sandbox/Test'
          : stripe.accountLivemode === true
            ? 'Live (account)'
            : stripe.accountLivemode === false
              ? 'Sandbox/Test (account)'
              : stripe.keyMode === 'live'
                ? 'Live (key prefix)'
                : stripe.keyMode === 'test'
                  ? 'Sandbox/Test (key prefix)'
                  : 'Unknown'

      const details = stripe.accountError ? ` (${stripe.accountError})` : ''
      setConnectionStatus(`Billing connection OK — Stripe mode: ${mode}${details}`)
    } catch (err) {
      setConnectionStatus(err.message || 'Billing connection failed')
    }
  }

  const handleSave = async () => {
    if (isGuest) {
      onRequireAuth?.()
      return
    }

    setError('')
    setSaving(true)
    try {
      const updateFields = {
        CompanyName: companyName, 
        ...getCountryUpdateFields(user, country),
        RouteWeeks: routeWeeks || null, 
        VAT: vatRegistered 
      }
      
      // Add address fields if they have values
      if (address1) updateFields['Address 1'] = address1
      if (address2) updateFields['Address 2'] = address2
      if (town) updateFields.Town = town
      if (postcode) updateFields.Postcode = postcode

      if (password) {
        const { error: authPasswordError } = await supabase.auth.updateUser({ password })
        if (authPasswordError) throw authPasswordError
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

        const updatedFields = {
          ...getCountryUpdateFields(user, country),
          RouteWeeks: routeWeeks,
          VAT: vatRegistered
        }
        
        // Add address fields to the callback
        if (address1) updatedFields['Address 1'] = address1
        if (address2) updatedFields['Address 2'] = address2
        if (town) updatedFields.Town = town
        if (postcode) updatedFields.Postcode = postcode
        
        onSaved(updatedFields)
        setPassword('')
      }
    } catch (err) {
      setError(err.message || 'Error saving settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSendSystemMessage = () => {
    setSystemMessageStatus('')

    const trimmedMessage = (systemMessage || '').trim()
    if (!trimmedMessage) {
      setSystemMessageStatus('Please write a message before sending.')
      return
    }

    const emailSubject = (systemSubject || '').trim() || `Pelican App message from ${user?.UserName || 'User'}`
    const bodyLines = [
      `From user: ${user?.UserName || ''}`,
      `User ID: ${user?.id || ''}`,
      `Email: ${user?.email_address || user?.email || ''}`,
      '',
      trimmedMessage
    ]

    const mailtoUrl = `mailto:pelicanwindowcleaning19@gmail.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
    window.location.href = mailtoUrl
    setSystemMessageStatus('Opening your email app...')
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
          <button
            className={activeTab === 'system' ? 'active' : ''}
            onClick={() => setActiveTab('system')}
          >
            System
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
                  <h4 className="my-round-stat">Average Monthly Round: {formatCurrency(averageMonthlyRound, country)}</h4>
                  
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
                            <td>{formatCurrency(route.amount, country)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="route-total">
                          <td><strong>Total</strong></td>
                          <td><strong>{totalCustomers}</strong></td>
                          <td><strong>{formatCurrency(averageMonthlyRound, country)}</strong></td>
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
              <div className="account-level-plans">
                <h4 className="account-level-title">Choose Your Plan</h4>
                {checkoutError && <p className="account-level-error">{checkoutError}</p>}
                {portalError && <p className="account-level-error">{portalError}</p>}
                {connectionStatus && <p className="account-level-status">{connectionStatus}</p>}
                {loadingUserLevels ? (
                  <p>Loading plans...</p>
                ) : (
                  <div className="plan-grid">
                    {userLevels.map((level) => {
                      const monthlyAmount = parseFloat(level.MonthlyAmount) || 0
                      const isCurrent = level.id === currentAccountLevelId
                      const isUnlimitedCustomers = String(level.Customers).match(/^9+$/)
                      const isUnlimitedRound = String(level.RoundAmount).match(/^9+$/)
                      return (
                        <div key={level.id} className={`plan-card ${isCurrent ? 'current' : ''}`}>
                          <div className="plan-header">
                            <h5>{level.LevelName}</h5>
                            <span className="plan-price">
                              {monthlyAmount <= 0 ? 'Free' : `${formatCurrency(monthlyAmount, country)}/month`}
                            </span>
                          </div>
                          <ul>
                            <li>
                              Customers: {isUnlimitedCustomers ? 'Unlimited' : level.Customers}
                            </li>
                            <li>
                              Monthly round: {isUnlimitedRound ? 'Unlimited' : formatCurrency(level.RoundAmount, country)}
                            </li>
                          </ul>
                          <button
                            className="plan-select-btn"
                            disabled={checkoutLoading === level.id || isCurrent}
                            onClick={() => handleSelectLevel(level)}
                          >
                            {isCurrent ? 'Current Plan' : checkoutLoading === level.id ? 'Redirecting...' : 'Select Plan'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="plan-note">
                  Paid plans include a 3-month free trial for first-time subscribers, then monthly billing via Stripe.
                </p>
                {isAdmin && (
                  <button className="plan-test-btn" onClick={handleTestConnection}>
                    Test billing connection
                  </button>
                )}
                {user?.StripeCustomerId && (
                  <button
                    className="plan-portal-btn"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                  >
                    {portalLoading ? 'Opening billing...' : 'Manage billing'}
                  </button>
                )}
              </div>
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
                          This entitles you to register {accountLevelCustomers} Customers or {formatCurrency(accountLevelRoundAmount, country)} for your Monthly round, whichever is first. If you go beyond this then you will need to register for the next tier up.
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

        {activeTab === 'system' && (
          <>
            <div className="system-content">
              <div className="system-card">
                <h4 className="system-title">Application Version</h4>
                <p className="system-version">{APP_VERSION}</p>
              </div>

              <div className="system-card">
                <h4 className="system-title">Contact Support</h4>
                <p className="system-note">Send a message to pelicanwindowcleaning19@gmail.com</p>
                <div className="settings-grid">
                  <div className="settings-field">
                    <label>Subject</label>
                    <input
                      type="text"
                      placeholder="Type a subject"
                      value={systemSubject}
                      onChange={(e) => setSystemSubject(e.target.value)}
                    />
                  </div>
                  <div className="settings-field">
                    <label>Message</label>
                    <textarea
                      className="system-textarea"
                      placeholder="Type your message"
                      value={systemMessage}
                      onChange={(e) => setSystemMessage(e.target.value)}
                    />
                  </div>
                </div>
                {systemMessageStatus && <p className="system-status">{systemMessageStatus}</p>}
                <button className="save-btn" onClick={handleSendSystemMessage}>Send Message</button>
              </div>
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
