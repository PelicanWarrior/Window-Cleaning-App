import { useState, useEffect } from 'react'
import './App.css'
import Auth from './components/Auth'
import CustomerList from './components/CustomerList'
import WorkloadManager from './components/WorkloadManager'
import Quotes from './components/Quotes'
import Letters from './components/Letters'
import Settings from './components/Settings'
import versionImage from '../pictures/Version.png'
import logo1 from '../public/Logo1.png'

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('workload')
  const [showSettings, setShowSettings] = useState(false)
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

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    setUser(null)
    setActiveTab('workload')
  }

  const handleSettingsSaved = (updatedUserFields) => {
    // Merge updated fields into user and close settings
    setUser((prev) => ({ ...prev, ...updatedUserFields }))
    setShowSettings(false)
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
            <img src={versionImage} alt="Version" className="version-image" />
          </div>
          <div className="user-info">
            <span>Welcome, {user.UserName}</span>
            {showInstallButton && (
              <button className="install-btn" onClick={handleInstallClick}>Install App</button>
            )}
            <button className="settings-btn" onClick={() => setShowSettings(true)}>Settings</button>
            {user.admin && <span className="admin-badge">Admin</span>}
            <div className="logout-section">
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </div>
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
        />
      )}
    </div>
  )
}

export default App
