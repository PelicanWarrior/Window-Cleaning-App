import { useState } from 'react'
import './App.css'
import Auth from './components/Auth'
import CustomerList from './components/CustomerList'
import WorkloadManager from './components/WorkloadManager'
import Letters from './components/Letters'

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('customers')

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    setUser(null)
    setActiveTab('customers')
  }

  // Show login if not authenticated
  if (!user) {
    return <Auth onLogin={handleLogin} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Window Cleaning Manager</h1>
          <div className="user-info">
            <span>Welcome, {user.UserName}</span>
            {user.admin && <span className="admin-badge">Admin</span>}
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <nav>
          <button 
            className={activeTab === 'customers' ? 'active' : ''}
            onClick={() => setActiveTab('customers')}
          >
            Customers
          </button>
          <button 
            className={activeTab === 'workload' ? 'active' : ''}
            onClick={() => setActiveTab('workload')}
          >
            Workload
          </button>
          <button 
            className={activeTab === 'letters' ? 'active' : ''}
            onClick={() => setActiveTab('letters')}
          >
            Letters
          </button>
        </nav>
      </header>
      <main className="app-main">
        {activeTab === 'customers' && <CustomerList user={user} />}
        {activeTab === 'workload' && <WorkloadManager user={user} />}
        {activeTab === 'letters' && <Letters user={user} />}
      </main>
    </div>
  )
}

export default App
