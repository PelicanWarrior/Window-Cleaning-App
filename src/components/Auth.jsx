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

        // Successful login
        onLogin(data)
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
              MessageFooter: `Thank you Gavin Pelican Window Cleaning`
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
