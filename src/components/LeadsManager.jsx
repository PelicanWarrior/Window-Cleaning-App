import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './LeadsManager.css'

const statusOptions = [
  'new',
  'queued',
  'sent_e1',
  'sent_e2',
  'sent_e3',
  'replied',
  'won',
  'closed'
]

const APP_URL = 'https://www.pelicanwindowcleaning.co.uk/'

const emailStepByStatus = {
  new: {
    nextStatus: 'sent_e1',
    sequenceStep: 'email_1',
    followUpDays: 3,
    subject: (lead) => `3 months free for ${lead.business_name}`,
    body: (lead) => {
      const greeting = lead.owner_name?.trim()
        ? `Hi ${lead.owner_name.trim()},`
        : 'Hi there,'

      return `${greeting}
I run a simple app built for window cleaning companies to manage rounds, customer details, quotes, reminders and invoicing in one place.

I'm offering you and your company 3 months free (plus help with setup/import) in exchange for honest feedback.

You can view the app here: ${APP_URL}

Would you be open to trying it?

Thanks,
Gavin Grainger
Business Owner
${APP_URL}`
    }
  },
  sent_e1: {
    nextStatus: 'sent_e2',
    sequenceStep: 'email_2',
    followUpDays: 4,
    subject: (lead) => `Re: 3 months free for ${lead.business_name}`,
    body: (lead) => {
      const greeting = lead.owner_name?.trim()
        ? `Hi ${lead.owner_name.trim()},`
        : 'Hi there,'

      return `${greeting}
Just following up in case this got buried.

Most cleaners I speak to want to reduce admin and stop juggling notes/spreadsheets.
The app helps with:
- recurring round scheduling
- customer/job history
- quotes + invoicing in one place

Still happy to offer 3 months free and help get you set up.
You can view the app here: ${APP_URL}
Open to giving it a try?

Best,
Gavin Grainger
Business Owner
${APP_URL}`
    }
  },
  sent_e2: {
    nextStatus: 'sent_e3',
    sequenceStep: 'email_3',
    followUpDays: 7,
    subject: () => 'Close this out?',
    body: (lead) => {
      const greeting = lead.owner_name?.trim()
        ? `Hi ${lead.owner_name.trim()},`
        : 'Hi there,'

      return `${greeting}
I don't want to keep bothering you, so I'll close this out after this email.

If useful, I can still offer ${lead.business_name} 3 months free + setup help.
If timing isn't right, just reply "later" and I'll check back in a few months.

You can view the app here: ${APP_URL}

Worth trying it, yes/no?

Thanks,
Gavin Grainger
Business Owner
${APP_URL}`
    }
  }
}

function toIsoDateFromNow(daysToAdd) {
  const date = new Date()
  date.setDate(date.getDate() + daysToAdd)
  return date.toISOString().slice(0, 10)
}

function buildEditableLeadPayload(lead) {
  return {
    owner_name: (lead.owner_name || '').trim() || null,
    email: (lead.email || '').trim() || null,
    phone: (lead.phone || '').trim() || null,
    website: (lead.website || '').trim() || null,
    status: (lead.status || 'new').trim() || 'new',
    sequence_step: (lead.sequence_step || '').trim() || null,
    next_follow_up: (lead.next_follow_up || '').trim() || null,
    response_status: (lead.response_status || '').trim() || null,
    notes: (lead.notes || '').trim() || null
  }
}

function LeadsManager({ user }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingLeadId, setSavingLeadId] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeListTab, setActiveListTab] = useState('leads')

  useEffect(() => {
    if (!user?.admin) return
    fetchLeads()
  }, [user?.admin])

  async function fetchLeads() {
    setLoading(true)
    setStatusMessage('')

    try {
      const { data, error } = await supabase
        .from('Leads')
        .select('*')
        .order('lead_id', { ascending: true })

      if (error) throw error
      setLeads(data || [])
    } catch (error) {
      console.error('Error loading leads:', error.message)
      setStatusMessage(`Could not load leads: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleFieldChange(id, field, value) {
    setLeads((prev) => prev.map((lead) => {
      if (lead.id !== id) return lead
      return { ...lead, [field]: value }
    }))
  }

  function normalizeDate(value) {
    const trimmed = (value || '').trim()
    return trimmed || null
  }

  async function saveLead(lead) {
    setSavingLeadId(lead.id)
    setStatusMessage('')

    const payload = {
      ...buildEditableLeadPayload(lead),
      next_follow_up: normalizeDate(lead.next_follow_up)
    }

    try {
      const { error } = await supabase
        .from('Leads')
        .update(payload)
        .eq('id', lead.id)

      if (error) throw error
      setStatusMessage(`Saved ${lead.lead_id}`)
    } catch (error) {
      console.error('Error saving lead:', error.message)
      setStatusMessage(`Could not save ${lead.lead_id}: ${error.message}`)
    } finally {
      setSavingLeadId(null)
    }
  }

  async function sendNextEmail(lead) {
    const currentStatus = lead.status || 'new'
    const step = emailStepByStatus[currentStatus]

    if (!step) {
      setStatusMessage(`No email template for status: ${currentStatus}`)
      return
    }

    const recipient = (lead.email || '').trim()
    if (!recipient) {
      setStatusMessage(`Add an email address before sending ${lead.lead_id}`)
      return
    }

    const subject = step.subject(lead)
    const body = step.body(lead)
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    window.open(gmailUrl, '_blank', 'noopener,noreferrer')

    const nextFollowUp = toIsoDateFromNow(step.followUpDays)
    const payload = {
      ...buildEditableLeadPayload(lead),
      status: step.nextStatus,
      sequence_step: step.sequenceStep,
      last_contacted: toIsoDateFromNow(0),
      next_follow_up: nextFollowUp
    }

    setSavingLeadId(lead.id)
    setStatusMessage('')

    try {
      const { error } = await supabase
        .from('Leads')
        .update(payload)
        .eq('id', lead.id)

      if (error) throw error

      setLeads((prev) => prev.map((row) => {
        if (row.id !== lead.id) return row
        return {
          ...row,
          ...payload
        }
      }))

      setStatusMessage(`Opened Gmail and updated ${lead.lead_id} to ${step.nextStatus}`)
    } catch (error) {
      console.error('Error updating lead after opening email:', error.message)
      setStatusMessage(`Email opened, but failed to update ${lead.lead_id}: ${error.message}`)
    } finally {
      setSavingLeadId(null)
    }
  }

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const today = toIsoDateFromNow(0)

    return leads.filter((lead) => {
      if (activeListTab === 'followup' && (lead.next_follow_up || '') !== today) {
        return false
      }

      const matchesStatus = statusFilter === 'all' || (lead.status || 'new') === statusFilter
      if (!matchesStatus) return false

      if (!query) return true

      const haystack = [
        lead.lead_id,
        lead.business_name,
        lead.owner_name,
        lead.email,
        lead.phone,
        lead.area,
        lead.notes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [leads, searchTerm, statusFilter, activeListTab])

  if (!user?.admin) {
    return (
      <div className="leads-manager">
        <h2>Leads</h2>
        <p>Admin access only.</p>
      </div>
    )
  }

  return (
    <div className="leads-manager">
      <div className="leads-header">
        <h2>Leads</h2>
        <button className="refresh-btn" onClick={fetchLeads} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="leads-inner-tabs" role="tablist" aria-label="Leads views">
        <button
          type="button"
          className={`leads-inner-tab ${activeListTab === 'leads' ? 'active' : ''}`}
          onClick={() => setActiveListTab('leads')}
        >
          Leads
        </button>
        <button
          type="button"
          className={`leads-inner-tab ${activeListTab === 'followup' ? 'active' : ''}`}
          onClick={() => setActiveListTab('followup')}
        >
          Follow-Up
        </button>
      </div>

      <div className="leads-toolbar">
        <input
          type="text"
          placeholder="Search business, email, phone, notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      {statusMessage && <p className="leads-status-message">{statusMessage}</p>}

      {loading ? (
        <p>Loading leads...</p>
      ) : (
        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Business</th>
                <th>Owner</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Step</th>
                <th>Next Follow-up</th>
                <th>Response</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.lead_id}</td>
                  <td>
                    <div className="business-cell">
                      <strong>{lead.business_name}</strong>
                      <span>{lead.area}</span>
                      <div className="action-buttons">
                        <button
                          className="send-next-btn"
                          onClick={() => sendNextEmail(lead)}
                          disabled={savingLeadId === lead.id}
                        >
                          Send Next Email
                        </button>
                        <button
                          className="save-btn"
                          onClick={() => saveLead(lead)}
                          disabled={savingLeadId === lead.id}
                        >
                          {savingLeadId === lead.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={lead.owner_name || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'owner_name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="email"
                      value={lead.email || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'email', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={lead.phone || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'phone', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      value={lead.status || 'new'}
                      onChange={(e) => handleFieldChange(lead.id, 'status', e.target.value)}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={lead.sequence_step || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'sequence_step', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={lead.next_follow_up || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'next_follow_up', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={lead.response_status || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'response_status', e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      value={lead.notes || ''}
                      onChange={(e) => handleFieldChange(lead.id, 'notes', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default LeadsManager
