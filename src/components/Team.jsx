import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getOwnerUserId, isOwnerUser } from '../lib/team'

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function Team({ user }) {
  const [teamMembers, setTeamMembers] = useState([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [creatingTeamMember, setCreatingTeamMember] = useState(false)
  const [teamMemberForm, setTeamMemberForm] = useState({
    username: '',
    email: '',
    password: ''
  })
  const [teamError, setTeamError] = useState('')
  const [teamMessage, setTeamMessage] = useState('')

  const ownerUserId = getOwnerUserId(user)
  const isOwner = isOwnerUser(user)

  useEffect(() => {
    fetchTeamMembers()
  }, [ownerUserId])

  async function fetchTeamMembers() {
    if (!ownerUserId) return

    try {
      setTeamLoading(true)

      const { data, error } = await supabase
        .from('Users')
        .select('id, UserName, email_address, ParentUserId, TeamRole')
        .eq('ParentUserId', ownerUserId)
        .order('UserName', { ascending: true })

      if (error) throw error
      setTeamMembers(data || [])
    } catch (error) {
      console.error('Error fetching team members:', error.message)
      setTeamError('Failed to load team members')
    } finally {
      setTeamLoading(false)
    }
  }

  async function handleCreateTeamMember(e) {
    e.preventDefault()
    if (!isOwner || !ownerUserId) return

    const username = String(teamMemberForm.username || '').trim()
    const email = String(teamMemberForm.email || '').trim().toLowerCase()
    const password = String(teamMemberForm.password || '').trim()

    if (!username || !email || !password) {
      setTeamError('Please provide username, email, and password.')
      return
    }

    if (password.length < 8) {
      setTeamError('Password must be at least 8 characters.')
      return
    }

    try {
      setCreatingTeamMember(true)
      setTeamError('')
      setTeamMessage('')

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw new Error(sessionError.message || 'Unable to validate your session')

      const accessToken = sessionData?.session?.access_token
      if (!accessToken) {
        throw new Error('Your login session is missing or expired. Please log out and log in again, then retry.')
      }

      const { data, error } = await supabase.functions.invoke('create_team_member', {
        body: {
          ownerUserId,
          username,
          email,
          password
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {})
        }
      })

      if (error) {
        let functionMessage = error.message || 'Unable to create team member'
        const responseStatus = error.context?.status

        if (error.context?.json) {
          try {
            const contextPayload = await error.context.json()
            if (contextPayload?.error) {
              functionMessage = contextPayload.error
            }
          } catch {
            if (error.context?.text) {
              try {
                const contextText = await error.context.text()
                if (contextText) {
                  functionMessage = contextText
                }
              } catch {
                // Keep fallback error message.
              }
            }
          }
        }

        if (responseStatus === 401 && functionMessage.toLowerCase().includes('non-2xx')) {
          functionMessage = 'Unauthorized request (401). Please log out, log back in, then try adding the team member again.'
        }

        throw new Error(functionMessage)
      }

      if (!data?.ok) {
        throw new Error(data?.error || 'Unable to create team member')
      }

      setTeamMessage(`Team member ${username} created.`)
      setTeamMemberForm({ username: '', email: '', password: '' })
      await fetchTeamMembers()
    } catch (error) {
      setTeamError(error.message || 'Unable to create team member')
    } finally {
      setCreatingTeamMember(false)
    }
  }

  if (!isOwner) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        <p>Only account owners can manage team members.</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem', border: '1px solid #d6e4ff', borderRadius: '10px', padding: '1rem', background: '#f8fbff', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>Team Members ({teamMembers.length})</strong>
        </div>

        <div>
          {teamError && <div style={{ color: '#b42318', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px' }}>{teamError}</div>}
          {teamMessage && <div style={{ color: '#027a48', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>{teamMessage}</div>}

          <form onSubmit={handleCreateTeamMember} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem', width: '100%' }}>
            <input
              type="text"
              placeholder="Username"
              value={teamMemberForm.username}
              onChange={(e) => setTeamMemberForm((prev) => ({ ...prev, username: e.target.value }))}
              required
              style={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="email"
              placeholder="Email"
              value={teamMemberForm.email}
              onChange={(e) => setTeamMemberForm((prev) => ({ ...prev, email: e.target.value }))}
              required
              style={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem'
              }}
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={teamMemberForm.password}
              onChange={(e) => setTeamMemberForm((prev) => ({ ...prev, password: e.target.value }))}
              minLength={8}
              required
              style={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.9rem'
              }}
            />
            <button
              type="submit"
              disabled={creatingTeamMember}
              style={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '0.5rem 1rem',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: creatingTeamMember ? 'not-allowed' : 'pointer',
                opacity: creatingTeamMember ? 0.6 : 1
              }}
            >
              {creatingTeamMember ? 'Creating...' : 'Add Team Member'}
            </button>
          </form>

          {teamLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>Loading team...</div>
          ) : teamMembers.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>No team members yet.</div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '320px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d6e4ff' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Username</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => (
                    <tr key={member.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                      <td style={{ padding: '0.75rem 0.5rem', wordBreak: 'break-word' }}>{member.UserName || '—'}</td>
                      <td style={{ padding: '0.75rem 0.5rem', wordBreak: 'break-word' }}>{member.email_address || '—'}</td>
                      <td style={{ padding: '0.75rem 0.5rem', wordBreak: 'break-word' }}>{member.TeamRole || 'cleaner'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Team
