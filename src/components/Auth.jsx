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
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)

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

  const urlIndicatesRecovery = () => {
    const search = window.location.search || ''
    const hash = window.location.hash || ''
    const combined = `${search}&${hash}`.toLowerCase()
    return combined.includes('type=recovery')
  }

  const getEmailRedirectUrl = () => {
    const configuredRedirect = (import.meta.env.VITE_AUTH_REDIRECT_URL || '').trim()
    if (configuredRedirect) {
      return configuredRedirect
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${window.location.pathname}`
    }

    return undefined
  }

  const findUniqueUsername = async (requestedUsername, fallbackEmail) => {
    const baseFromInput = (requestedUsername || '').trim()
    const baseFromEmail = (fallbackEmail || '').split('@')[0]
    const safeBase = (baseFromInput || baseFromEmail || 'user').replace(/\s+/g, '')

    let candidate = safeBase
    let suffix = 1

    while (suffix <= 50) {
      const { data, error } = await supabase
        .from('Users')
        .select('id')
        .eq('UserName', candidate)
        .limit(1)

      if (error) throw error
      if (!data || data.length === 0) return candidate

      suffix += 1
      candidate = `${safeBase}${suffix}`
    }

    return `${safeBase}${Date.now()}`
  }

  async function ensureUserRecordFromAuth(authUser, signupDefaults = {}) {
    if (!authUser?.email) {
      throw new Error('Confirmed auth user email was not found')
    }

    const authEmail = authUser.email.trim().toLowerCase()

    const { data: existingUser, error: existingError } = await supabase
      .from('Users')
      .select('*')
      .eq('email_address', authEmail)
      .maybeSingle()

    if (existingError) throw existingError
    if (existingUser) return existingUser

    const metadata = authUser.user_metadata || {}
    const requestedUsername = signupDefaults.username || metadata.username || authEmail.split('@')[0]
    const uniqueUsername = await findUniqueUsername(requestedUsername, authEmail)

    const newUserPayload = {
      UserName: uniqueUsername,
      email_address: authEmail,
      admin: false,
      CustomerSort: 'Route',
      SettingsCountry: signupDefaults.country || metadata.country || 'United Kingdom',
      CompanyName: signupDefaults.companyName || metadata.companyName || '',
      MessageFooter: '',
      RouteWeeks: 4,
      AccountLevel: 1
    }

    const { data: newUser, error: insertError } = await supabase
      .from('Users')
      .insert([newUserPayload])
      .select()
      .single()

    if (insertError) throw insertError
    return newUser
  }

  useEffect(() => {
    let isMounted = true

    const hydrateFromAuthSession = async () => {
      try {
        if (urlIndicatesRecovery()) {
          setIsPasswordRecovery(true)
          return
        }

        const { data } = await supabase.auth.getSession()
        const authUser = data?.session?.user
        if (!authUser || !isMounted) return

        const userProfile = await ensureUserRecordFromAuth(authUser)
        if (isMounted && userProfile) {
          onLogin(userProfile)
        }
      } catch (err) {
        console.error('Error hydrating auth session:', err)
      }
    }

    hydrateFromAuthSession()

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setRecoveryError('')
      }
    })

    return () => {
      isMounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [onLogin])

  const handleRecoverySubmit = async (e) => {
    e.preventDefault()
    setRecoveryError('')

    const newPassword = (recoveryPassword || '').trim()
    const confirmPassword = (recoveryConfirmPassword || '').trim()

    if (!newPassword || !confirmPassword) {
      setRecoveryError('Please enter and confirm your new password.')
      return
    }

    if (newPassword.length < 8) {
      setRecoveryError('Password must be at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match.')
      return
    }

    try {
      setRecoveryLoading(true)
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      await supabase.auth.signOut()
      setIsPasswordRecovery(false)
      setRecoveryPassword('')
      setRecoveryConfirmPassword('')
      setConfirmationMessage('Password updated successfully. Please log in with your new password.')
      setIsLogin(true)
      window.history.replaceState({}, document.title, window.location.pathname)
    } catch (err) {
      setRecoveryError(err.message || 'Unable to update password. Please request a new reset email and try again.')
    } finally {
      setRecoveryLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    const emailToResend = (pendingConfirmationEmail || formData.email || '').trim().toLowerCase()
    if (!emailToResend) {
      setError('Enter your email address first, then try again.')
      return
    }

    setError('')
    setConfirmationMessage('')

    try {
      setResendLoading(true)
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: emailToResend,
        options: {
          emailRedirectTo: getEmailRedirectUrl()
        }
      })

      if (resendError) throw resendError

      setConfirmationMessage('Confirmation email resent. Please check your inbox and spam folder.')
      setPendingConfirmationEmail(emailToResend)
    } catch (err) {
      const resendMessage = String(err?.message || '')
      const normalizedResendMessage = resendMessage.toLowerCase()

      if (normalizedResendMessage.includes('email rate limit exceeded') || normalizedResendMessage.includes('rate limit')) {
        setError('Resend limit reached. Please wait a few minutes before trying again. For live apps, set up custom SMTP in Supabase to avoid shared sending limits.')
      } else {
        setError(resendMessage || 'Unable to resend confirmation email right now. Please try again shortly.')
      }
    } finally {
      setResendLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setConfirmationMessage('')
    setLoading(true)

    try {
      if (isLogin) {
        const credentialInput = (formData.username || '').trim()

        let authLoginEmail = credentialInput.includes('@') ? credentialInput.toLowerCase() : ''
        if (!authLoginEmail && credentialInput) {
          const { data: userByName, error: userByNameError } = await supabase
            .from('Users')
            .select('email_address')
            .eq('UserName', credentialInput)
            .maybeSingle()

          if (!userByNameError && userByName?.email_address) {
            authLoginEmail = String(userByName.email_address).toLowerCase()
          }
        }

        if (!authLoginEmail) {
          setError('Invalid username/email or password')
          setLoading(false)
          return
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: authLoginEmail,
          password: formData.password
        })

        if (authError || !authData?.user) {
          const authMessage = (authError?.message || '').toLowerCase()
          if (authMessage.includes('email not confirmed')) {
            setError('Please confirm your email before logging in. Check your inbox and spam folder.')
          } else {
            setError('Invalid username/email or password')
          }
          setLoading(false)
          return
        }

        const data = await ensureUserRecordFromAuth(authData.user, {
          username: credentialInput
        })

        if (!data) {
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
        setPendingConfirmationEmail('')
        onLogin(userData)
      } else {
        // Sign up - create new account with email confirmation
        if (!formData.email || !formData.username || !formData.password) {
          setError('Please fill in all fields')
          setLoading(false)
          return
        }

        const signupEmail = formData.email.trim().toLowerCase()
        const signupUsername = formData.username.trim()
        const emailRedirectTo = getEmailRedirectUrl()

        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: signupEmail,
          password: formData.password,
          options: {
            emailRedirectTo,
            data: {
              username: signupUsername,
              companyName: formData.companyName || '',
              country: formData.country || 'United Kingdom'
            }
          }
        })

        if (signupError) {
          const signupMessage = String(signupError.message || '')
          const normalizedSignupMessage = signupMessage.toLowerCase()

          if (normalizedSignupMessage.includes('email rate limit exceeded') || normalizedSignupMessage.includes('rate limit')) {
            setError('Signup email limit reached. Please wait a few minutes and try again, or use Resend confirmation email. If this keeps happening, configure custom SMTP in Supabase for production.')
          } else if (normalizedSignupMessage.includes('already registered')) {
            setPendingConfirmationEmail(signupEmail)
            setConfirmationMessage('This email is already registered. If it is not confirmed yet, use the resend button below.')
          } else {
            setError('Error creating account: ' + signupMessage)
          }
          setLoading(false)
          return
        }

        if (signupData?.session && signupData?.user) {
          await supabase.auth.signOut()
          setPendingConfirmationEmail('')
          setError('Your account was created and signed in immediately, which means email confirmation is disabled in Supabase Auth settings. Enable Confirm email if you want verification emails sent.')
          setLoading(false)
          return
        }

        const noIdentityCreated = Array.isArray(signupData?.user?.identities) && signupData.user.identities.length === 0
        if (noIdentityCreated) {
          setPendingConfirmationEmail(signupEmail)
          setConfirmationMessage('This email is already registered. If it is not confirmed yet, use the resend button below.')
          setIsLogin(true)
          setFormData({ username: '', email: '', password: '', companyName: '', country: 'United Kingdom' })
          setLoading(false)
          return
        }

        setPendingConfirmationEmail(signupEmail)
        setConfirmationMessage('Account created. Please check your email and click the confirmation link to finish creating your account.')
        setIsLogin(true)
        setFormData({ username: '', email: '', password: '', companyName: '', country: 'United Kingdom' })
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
        <h2>{isPasswordRecovery ? 'Set New Password' : (isLogin ? 'Login' : 'Create Account')}</h2>

        {error && <div className="error-message">{error}</div>}
        {confirmationMessage && <div className="success-message">{confirmationMessage}</div>}
        {recoveryError && <div className="error-message">{recoveryError}</div>}

        {isPasswordRecovery ? (
          <form onSubmit={handleRecoverySubmit}>
            <input
              type="password"
              placeholder="New Password"
              value={recoveryPassword}
              onChange={(e) => setRecoveryPassword(e.target.value)}
              required
              disabled={recoveryLoading}
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={recoveryConfirmPassword}
              onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
              required
              disabled={recoveryLoading}
            />
            <button type="submit" disabled={recoveryLoading}>
              {recoveryLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : (
        <>

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

        {pendingConfirmationEmail && (
          <button
            type="button"
            className="toggle-button"
            onClick={handleResendConfirmation}
            disabled={loading || resendLoading}
          >
            {resendLoading ? 'Resending...' : 'Resend confirmation email'}
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
              setConfirmationMessage('')
              setFormData({ username: '', email: '', password: '', companyName: '', country: 'United Kingdom' })
            }}
            disabled={loading}
          >
            {isLogin ? 'Create one' : 'Login'}
          </button>
        </p>
        </>
        )}
      </div>
    </div>
  )
}

export default Auth
