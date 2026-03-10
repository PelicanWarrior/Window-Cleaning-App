import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getCountryUpdateFields, normalizeUserCountryFields } from '../lib/format'
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
  const formPanelRef = useRef(null)

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
    if (existingUser) return normalizeUserCountryFields(existingUser)

    const metadata = authUser.user_metadata || {}
    const requestedUsername = signupDefaults.username || metadata.username || authEmail.split('@')[0]
    const uniqueUsername = await findUniqueUsername(requestedUsername, authEmail)

    const preferredCountry = signupDefaults.country || metadata.country || 'United Kingdom'

    const newUserPayload = {
      UserName: uniqueUsername,
      email_address: authEmail,
      admin: false,
      CustomerSort: 'Route',
      CompanyName: signupDefaults.companyName || metadata.companyName || '',
      MessageFooter: '',
      RouteWeeks: 4,
      AccountLevel: 1
    }

    const candidatePayloads = [
      { ...newUserPayload, SettingsCountry: preferredCountry },
      { ...newUserPayload, SettingsCounty: preferredCountry },
      { ...newUserPayload }
    ]

    let lastError = null

    for (const payload of candidatePayloads) {
      const { data: newUser, error: insertError } = await supabase
        .from('Users')
        .insert([payload])
        .select()
        .single()

      if (!insertError && newUser) {
        return normalizeUserCountryFields(newUser)
      }

      lastError = insertError
      const message = String(insertError?.message || '').toLowerCase()
      const isCountryColumnError = message.includes('settingscountry') || message.includes('settingscounty')
      if (!isCountryColumnError) {
        throw insertError
      }
    }

    throw lastError || new Error('Unable to create user record')
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

        // If country settings are empty, set them to United Kingdom
        let userData = normalizeUserCountryFields(data)
        const hasStoredCountry = Boolean(
          (data?.SettingsCountry && String(data.SettingsCountry).trim()) ||
          (data?.SettingsCounty && String(data.SettingsCounty).trim())
        )

        if (!hasStoredCountry) {
          const countryUpdate = getCountryUpdateFields(data, 'United Kingdom')
          const { error: updateError } = await supabase
            .from('Users')
            .update(countryUpdate)
            .eq('id', userData.id)
          
          if (updateError) throw updateError
          userData = normalizeUserCountryFields({ ...userData, ...countryUpdate })
        }

        // If RouteWeeks is empty, set it to 4
        if (!userData.RouteWeeks) {
          const { error: updateError } = await supabase
            .from('Users')
            .update({ RouteWeeks: 4 })
            .eq('id', userData.id)
          
          if (updateError) throw updateError
          userData = normalizeUserCountryFields({ ...userData, RouteWeeks: 4 })
        }

        // If AccountLevel is empty, set it to 1
        if (!userData.AccountLevel) {
          const { error: updateError } = await supabase
            .from('Users')
            .update({ AccountLevel: 1 })
            .eq('id', userData.id)
          
          if (updateError) throw updateError
          userData = normalizeUserCountryFields({ ...userData, AccountLevel: 1 })
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

        window.location.assign('/sign_up/')
        return
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const openSignupPanel = () => {
    setIsLogin(false)
    setError('')
    setConfirmationMessage('')
    setTimeout(() => {
      formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  if (isPasswordRecovery) {
    return (
      <div className="auth-page auth-recovery-page">
        <div className="auth-form-panel auth-recovery-panel">
          <img src="/Logo1.png" alt="Pelican Logo" className="auth-logo" />
          <h1 className="auth-panel-title">Set New Password</h1>
          {recoveryError && <div className="error-message">{recoveryError}</div>}
          {confirmationMessage && <div className="success-message">{confirmationMessage}</div>}
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
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="auth-hero-left">
          <img src="/Logo1.png" alt="Pelican Logo" className="auth-logo" />
          <h1>Window Cleaning Software Free Until You Hit 100 Customers or £1,000 Monthly Round</h1>
          <p className="auth-hero-subtitle">
            Manage customers, routes, quotes, invoices, and reminders in one app built for window cleaners.
          </p>
          <div className="auth-hero-actions">
            <button type="button" className="hero-primary" onClick={openSignupPanel}>Start Free - No Card Needed</button>
          </div>
          <p className="auth-hero-trust">Free until you reach 100 customers or £1,000 monthly round, whichever comes first.</p>
        </div>

        <div className="auth-form-panel" ref={formPanelRef}>
          <h2 className="auth-panel-title">{isLogin ? 'Log In' : 'Create Your Free Account'}</h2>
          <p className="auth-panel-subtitle">
            {isLogin ? 'Welcome back. Sign in to manage your round.' : 'Get started in under 2 minutes.'}
          </p>

          {error && <div className="error-message">{error}</div>}
          {confirmationMessage && <div className="success-message">{confirmationMessage}</div>}

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <input
                type="email"
                placeholder="Email address"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={loading}
              />
            )}

            <input
              type="text"
              placeholder={isLogin ? 'Username or Email' : 'Username'}
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
              {loading ? 'Please wait...' : (isLogin ? 'Log In' : 'Create Free Account')}
            </button>
          </form>

          {!isLogin && <p className="signup-microcopy">Free until 100 customers or £1,000 monthly round. No card required.</p>}

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
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
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
              {isLogin ? 'Create one' : 'Log in'}
            </button>
          </p>
        </div>
      </section>

      <section className="auth-strip">
        <h3>Stop Losing Time to Admin</h3>
        <ul>
          <li>Know exactly who is due and when</li>
          <li>Send quotes and invoices in minutes</li>
          <li>Keep customer history in one place</li>
          <li>Track routes and weekly workload clearly</li>
        </ul>
      </section>

      <section className="auth-features" id="auth-demo">
        <h3>Everything You Need to Run Your Round</h3>
        <div className="feature-grid">
          <article className="feature-card">
            <h4>Customer Management</h4>
            <p>Store addresses, pricing, notes, and clean history.</p>
          </article>
          <article className="feature-card">
            <h4>Workload and Routes</h4>
            <p>Plan your days and avoid missed cleans.</p>
          </article>
          <article className="feature-card">
            <h4>Quotes and Invoices</h4>
            <p>Create, send, and track payments fast.</p>
          </article>
          <article className="feature-card">
            <h4>Reminders and Messages</h4>
            <p>Send customer updates without copy-paste chaos.</p>
          </article>
        </div>
      </section>

      <section className="auth-offer">
        <h3>Start Free and Stay Free Until You Grow</h3>
        <p>Use Pelican free until you reach 100 customers or £1,000 monthly round, whichever comes first. No trial countdown. No card required.</p>
        <button type="button" className="hero-primary" onClick={openSignupPanel}>Create Free Account</button>
      </section>

      <section className="auth-pricing">
        <h3>Simple Pricing as You Grow</h3>
        <p className="auth-pricing-intro">Start free, then move up only when your round reaches the limit.</p>
        <div className="pricing-grid">
          <article className="pricing-card">
            <p className="pricing-label">Free</p>
            <p className="pricing-amount">£0<span>/month</span></p>
            <ul>
              <li>Up to 100 customers</li>
              <li>Up to £1,000 monthly round</li>
              <li>No card required</li>
            </ul>
          </article>
          <article className="pricing-card pricing-card-featured">
            <p className="pricing-label">Growth</p>
            <p className="pricing-amount">£4.99<span>/month</span></p>
            <ul>
              <li>Up to 500 customers</li>
              <li>Up to £5,000 monthly round</li>
              <li>Ideal for growing rounds</li>
            </ul>
          </article>
          <article className="pricing-card">
            <p className="pricing-label">Unlimited</p>
            <p className="pricing-amount">£9.99<span>/month</span></p>
            <ul>
              <li>Unlimited customers</li>
              <li>Unlimited monthly round</li>
              <li>For established businesses</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="auth-testimonials">
        <h3>Built for Real Window Cleaning Businesses</h3>
        <div className="testimonial-grid">
          <blockquote>"Set up in under 20 minutes."</blockquote>
          <blockquote>"Saved me hours every week."</blockquote>
          <blockquote>"Finally one place for customers, routes, and invoices."</blockquote>
        </div>
      </section>

      <section className="auth-faq">
        <h3>Frequently Asked Questions</h3>
        <div className="faq-grid">
          <article>
            <h4>Is this really free?</h4>
            <p>Yes. It is free until you reach 100 customers or £1,000 monthly round, whichever comes first.</p>
          </article>
          <article>
            <h4>Do I need a credit card?</h4>
            <p>No card is required to start your free account.</p>
          </article>
          <article>
            <h4>Can I upgrade later?</h4>
            <p>Yes. Upgrade only when you pass 100 customers or £1,000 monthly round.</p>
          </article>
          <article>
            <h4>Can I import my customers?</h4>
            <p>Yes. We can help you with setup and import.</p>
          </article>
        </div>
      </section>

      <section className="auth-final-cta">
        <h3>Ready to Get Organised?</h3>
        <button type="button" className="hero-primary" onClick={openSignupPanel}>Start Free - 100 Customers or £1,000 Round</button>
        <p>Takes less than 2 minutes to create your account.</p>
      </section>
    </div>
  )
}

export default Auth
