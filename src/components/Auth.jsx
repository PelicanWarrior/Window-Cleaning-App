import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './Auth.css'

function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

            const missingWindows = customers.filter(c => !windowsEntries.has(c.id))

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
        const { data: existingUser } = await supabase
          .from('Users')
          .select('id')
          .or(`UserName.eq.${formData.username},email_address.eq.${formData.email}`)
          .single()

        if (existingUser) {
          setError('Username or email already exists')
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
              SettingsCountry: 'United Kingdom',
              MessageFooter: ''
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
        <h1>Window Cleaning Manager</h1>
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

        <p className="toggle-text">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button" 
            className="toggle-button"
            onClick={() => {
              setIsLogin(!isLogin)
              setError('')
              setFormData({ username: '', email: '', password: '' })
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
