import { useState, useEffect } from 'react'
import './App.css'
import Auth from './components/Auth'
import CustomerList from './components/CustomerList'
import WorkloadManager from './components/WorkloadManager'
import Quotes from './components/Quotes'
import Letters from './components/Letters'
import Settings from './components/Settings'
import AdminPanel from './components/AdminPanel'
import logo1 from '../public/Logo1.png'
import { supabase } from './lib/supabase'

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const USER_STORAGE_KEY = 'wc_user_id'

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('workload')
  const [showSettings, setShowSettings] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('userSettings')
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [checkoutStatus, setCheckoutStatus] = useState(null) // 'success', 'cancelled', or null
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlUserId = params.get('user_id')
    const storedUserId = localStorage.getItem(USER_STORAGE_KEY)
    const candidateUserId = urlUserId || storedUserId

    if (!candidateUserId || user) return

    const loadUser = async () => {
      try {
        const { data, error } = await supabase
          .from('Users')
          .select('*')
          .eq('id', candidateUserId)
          .single()

        if (error || !data) {
          localStorage.removeItem(USER_STORAGE_KEY)
          return
        }

        setUser(data)
        localStorage.setItem(USER_STORAGE_KEY, String(data.id))
      } catch (err) {
        console.error('Error restoring user session:', err)
      }
    }

    loadUser()
  }, [])

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Handle checkout success/cancel redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutParam = params.get('checkout')
    const sessionId = params.get('session_id')

    if (checkoutParam === 'success') {
      setCheckoutStatus('success')
      setStatusMessage('Payment successful! Your plan has been updated.')

      const run = async () => {
        if (sessionId) {
          await syncCheckoutSession(sessionId)
        }
        await refreshUserData()

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)

        // Clear status after 5 seconds
        setTimeout(() => setCheckoutStatus(null), 5000)
      }

      if (user) {
        run()
      }
    } else if (checkoutParam === 'cancelled') {
      setCheckoutStatus('cancelled')
      setStatusMessage('Payment was cancelled. Please try again if you wish to upgrade.')

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)

      // Clear status after 5 seconds
      setTimeout(() => setCheckoutStatus(null), 5000)
    }
  }, [user])

  async function syncCheckoutSession(sessionId) {
    try {
      const { data, error } = await supabase.functions.invoke('sync_checkout_session', {
        body: { sessionId },
        headers: SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : undefined
      })

      if (error) {
        console.error('Error syncing checkout session:', error)
        return false
      }

      if (!data?.ok) {
        console.error('Unexpected sync response:', data)
        return false
      }

      return true
    } catch (err) {
      console.error('Error syncing checkout session:', err)
      return false
    }
  }

  async function refreshUserData() {
    if (!user?.id) return
    
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (error) throw error
      
      // Update user state with fresh data
      setUser(data)
      localStorage.setItem(USER_STORAGE_KEY, String(data.id))
    } catch (err) {
      console.error('Error refreshing user data:', err)
    }
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallButton(false)
  }

  const handleLogin = (userData) => {
    setUser(userData)
    if (userData?.id) {
      localStorage.setItem(USER_STORAGE_KEY, String(userData.id))
    }
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem(USER_STORAGE_KEY)
    setActiveTab('workload')
  }

  const handleSettingsSaved = (updatedUserFields) => {
    // Merge updated fields into user and close settings
    setUser((prev) => ({ ...prev, ...updatedUserFields }))
    setShowSettings(false)
  }

  const handleShowSettings = (initialTab = 'userSettings') => {
    setSettingsInitialTab(initialTab)
    setShowSettings(true)
    // Clear any checkout status when opening settings
    setCheckoutStatus(null)
  }

  const getAccountLevelInfo = () => {
    const level = Number(user?.AccountLevel || 1)

    if (level >= 3) return { label: 'Gold', className: 'gold' }
    if (level === 2) return { label: 'Silver', className: 'silver' }
    return { label: 'Bronze', className: 'bronze' }
  }

  // Show login if not authenticated
  if (!user) {
    return <Auth onLogin={handleLogin} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <img src={logo1} alt="Pelican Logo" className="header-logo" />
            <h1>Pelican Window Cleaning Manager</h1>
          </div>
          <div className="user-info">
            <span>Welcome, {user.UserName}</span>
            {showInstallButton && (
              <button className="install-btn" onClick={handleInstallClick}>Install App</button>
            )}
            <button className="settings-btn" onClick={() => handleShowSettings('userSettings')}>Settings</button>
            {user.admin ? (
              <span className="admin-badge" onClick={() => setShowAdminPanel(true)}>Admin</span>
            ) : (
              (() => {
                const levelInfo = getAccountLevelInfo()
                return (
                  <span
                    className={`level-badge ${levelInfo.className}`}
                    onClick={() => handleShowSettings('accountLevel')}
                  >
                    {levelInfo.label}
                  </span>
                )
              })()
            )}
            <div className="logout-section">
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </div>
        {checkoutStatus && (
          <div className={`checkout-status ${checkoutStatus}`}>
            {statusMessage}
          </div>
        )}
        <nav>
          <button 
            className={activeTab === 'workload' ? 'active' : ''}
            onClick={() => setActiveTab('workload')}
          >
            Workload
          </button>
          <button 
            className={activeTab === 'customers' ? 'active' : ''}
            onClick={() => setActiveTab('customers')}
          >
            Customers
          </button>
          <button 
            className={activeTab === 'quotes' ? 'active' : ''}
            onClick={() => setActiveTab('quotes')}
          >
            Quotes
          </button>
          <button 
            className={activeTab === 'letters' ? 'active' : ''}
            onClick={() => setActiveTab('letters')}
          >
            Messages
          </button>
        </nav>
      </header>
      <main className="app-main">
        {activeTab === 'workload' && <WorkloadManager user={user} />}
        {activeTab === 'customers' && <CustomerList user={user} />}
        {activeTab === 'quotes' && <Quotes user={user} />}
        {activeTab === 'letters' && <Letters user={user} />}
      </main>
      {showSettings && (
        <Settings 
          user={user} 
          onClose={() => setShowSettings(false)} 
          onSaved={handleSettingsSaved}
          initialTab={settingsInitialTab}
        />
      )}
      {showAdminPanel && (
        <AdminPanel
          user={user}
          onClose={() => setShowAdminPanel(false)}
        />
      )}
    </div>
  )
}

export default App
