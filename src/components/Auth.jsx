import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Auth.css'

function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    companyName: '',
    country: 'United Kingdom'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallButton, setShowInstallButton] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallButton(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        // Login - check with either username or email
        const { data, error } = await supabase
          .from('Users')
          .select('*')
          .or(`UserName.eq.${formData.username},email_address.eq.${formData.username}`)
          .eq('password', formData.password)
          .single()

        if (error || !data) {
          setError('Invalid username/email or password')
          setLoading(false)
          return
        }

        // If SettingsCountry is empty, set it to United Kingdom
        let userData = data
        if (!userData.SettingsCountry) {
          const { error: updateError } = await supabase
            .from('Users')
            .update({ SettingsCountry: 'United Kingdom' })
            .eq('id', userData.id)
          
          if (updateError) throw updateError
          userData = { ...userData, SettingsCountry: 'United Kingdom' }
        }

        // If RouteWeeks is empty, set it to 4
        if (!userData.RouteWeeks) {
          const { error: updateError } = await supabase
            .from('Users')
            .update({ RouteWeeks: 4 })
            .eq('id', userData.id)
          
          if (updateError) throw updateError
          userData = { ...userData, RouteWeeks: 4 }
        }

        // If AccountLevel is empty, set it to 1
        if (!userData.AccountLevel) {
          const { error: updateError } = await supabase
            .from('Users')
            .update({ AccountLevel: 1 })
            .eq('id', userData.id)
          
          if (updateError) throw updateError
          userData = { ...userData, AccountLevel: 1 }
        }

        // Smart arrange addresses: split comma-separated addresses and extract postcodes
        const { data: customers, error: customersError } = await supabase
          .from('Customers')
          .select('id, Price, Address, Address2, Address3, Postcode')
          .eq('UserId', userData.id)

        if (!customersError && customers) {
          const updates = []
          
          for (const customer of customers) {
            // Only process if Address has content and other fields are empty
            if (customer.Address && !customer.Address2 && !customer.Address3 && !customer.Postcode) {
              const addressStr = customer.Address.trim()
              
              // UK postcode pattern (e.g., SG1 4LE, SW1A 1AA, etc.)
              const postcodeRegex = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i
              const postcodeMatch = addressStr.match(postcodeRegex)
              
              let postcode = ''
              let remainingAddress = addressStr
              
              if (postcodeMatch) {
                postcode = postcodeMatch[1].toUpperCase()
                remainingAddress = addressStr.replace(postcodeMatch[0], '').trim()
              }
              
              // Split by comma and clean up parts
              const parts = remainingAddress.split(',').map(p => p.trim()).filter(Boolean)
              
              const updateData = {
                Address: parts[0] || '',
                Address2: parts[1] || '',
                Address3: parts[2] || '',
                Postcode: postcode
              }
              
              updates.push(
                supabase
                  .from('Customers')
                  .update(updateData)
                  .eq('id', customer.id)
              )
            }
          }
          
          if (updates.length > 0) {
            await Promise.all(updates)
          }
        }

        // Ensure all customers have a "Windows" service entry in CustomerPrices
        if (customers) {
          const { data: priceEntries, error: priceError } = await supabase
            .from('CustomerPrices')
            .select('CustomerID, Service')
            .in('CustomerID', customers.map(c => c.id))

          if (!priceError && priceEntries) {
            const windowsEntries = new Set(
              priceEntries
                .filter(entry => entry.Service === 'Windows')
                .map(entry => entry.CustomerID)
            )

            const missingWindows = customers.filter(c => !windowsEntries.has(c.id) && c.Quote !== true)

            if (missingWindows.length > 0) {
              const windowsPrices = missingWindows.map(customer => ({
                CustomerID: customer.id,
                Price: customer.Price || 0,
                Service: 'Windows'
              }))

              const { error: insertError } = await supabase
                .from('CustomerPrices')
                .insert(windowsPrices)

              if (insertError) throw insertError
            }
          }
        }

        // Ensure all customers have NextServices populated with "Windows" if empty
        if (customers) {
          const customersNeedingNextServices = customers.filter(c => !c.NextServices)

          if (customersNeedingNextServices.length > 0) {
            const updates = customersNeedingNextServices.map(customer =>
              supabase
                .from('Customers')
                .update({ NextServices: 'Windows' })
                .eq('id', customer.id)
            )

            const results = await Promise.all(updates)
            const errors = results.filter(r => r.error)
            if (errors.length > 0) {
              console.error('Errors updating NextServices:', errors)
            }
          }
        }

        // Successful login
        onLogin(userData)
      } else {
        // Sign up - create new account
        if (!formData.email || !formData.username || !formData.password) {
          setError('Please fill in all fields')
          setLoading(false)
          return
        }

        // Check if username or email already exists
        const { data: existingUsers, error: existingError } = await supabase
          .from('Users')
          .select('UserName, email_address')
          .or(`UserName.eq.${formData.username},email_address.eq.${formData.email}`)
          .limit(1)

        if (existingError) throw existingError

        if (existingUsers && existingUsers.length > 0) {
          const match = existingUsers[0]
          const usernameTaken = match.UserName?.toLowerCase() === formData.username.toLowerCase()
          const emailTaken = match.email_address?.toLowerCase() === formData.email.toLowerCase()

          if (usernameTaken && emailTaken) {
            setError('Username has been taken and email address is being used')
          } else if (usernameTaken) {
            setError('Username has been taken')
          } else {
            setError('Email address is being used')
          }

          setLoading(false)
          return
        }

        // Create new user
        const { data, error } = await supabase
          .from('Users')
          .insert([
            {
              UserName: formData.username,
              email_address: formData.email,
              password: formData.password,
              admin: false,
              CustomerSort: 'Route',
              SettingsCountry: formData.country,
              CompanyName: formData.companyName,
              MessageFooter: '',
              RouteWeeks: 4,
              AccountLevel: 1
            }
          ])
          .select()
          .single()

        if (error) {
          setError('Error creating account: ' + error.message)
          setLoading(false)
          return
        }

        // Auto-login after signup
        onLogin(data)
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <img src="/Logo1.png" alt="Pelican Logo" className="auth-logo" />
        <h1>Pelican Window Cleaning Manager</h1>
        <h2>{isLogin ? 'Login' : 'Create Account'}</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required={!isLogin}
              disabled={loading}
            />
          )}
          
          <input
            type="text"
            placeholder={isLogin ? "Username or Email" : "Username"}
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
            disabled={loading}
          />
          
          {!isLogin && (
            <input
              type="text"
              placeholder="Company Name"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              disabled={loading}
            />
          )}
          
          {!isLogin && (
            <select
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              disabled={loading}
            >
              <option value="United Kingdom">United Kingdom</option>
              <option value="United States">United States</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
              <option value="New Zealand">New Zealand</option>
              <option value="Ireland">Ireland</option>
              <option value="France">France</option>
              <option value="Germany">Germany</option>
              <option value="Spain">Spain</option>
              <option value="Italy">Italy</option>
            </select>
          )}
          
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            disabled={loading}
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Create Account')}
          </button>
        </form>

        {showInstallButton && (
          <button className="install-app-btn" onClick={handleInstallClick}>
            Install App
          </button>
        )}

        <p className="toggle-text">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button" 
            className="toggle-button"
            onClick={() => {
              setIsLogin(!isLogin)
              setError('')
              setFormData({ username: '', email: '', password: '', companyName: '', country: 'United Kingdom' })
            }}
            disabled={loading}
          >
            {isLogin ? 'Create one' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default Auth
