import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './LeadsManager.css'

const statusOptions = [
  'new',
  'queued',
  'sent_e1',
  'sent_e2',
  'not_replied',
  'sent_e3',
  'replied',
  'registered',
  'registered_with_customers',
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
    nextStatus: 'not_replied',
    sequenceStep: 'email_3',
    followUpDays: null,
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
  },
  registered: {
    nextStatus: 'registered',
    sequenceStep: 'registered_nudge',
    followUpDays: 7,
    subject: (lead) => `You're all set — just one more step`,
    body: (lead) => {
      const greeting = lead.owner_name?.trim()
        ? `Hi ${lead.owner_name.trim()},`
        : 'Hi there,'

      return `${greeting}
Great news — you've already signed up to Pelican, which is the hard part done.

I noticed you haven't added any customers yet. It only takes a couple of minutes to get your first round set up, and I'm happy to help you do it.

Here's what you can do right now:
- Add your first customer manually (takes 30 seconds)
- Or send me your list and I'll import it for you

Once your customers are in, you'll be able to manage your rounds, send quotes and invoices, and track everything in one place.

Just reply to this email if you'd like a hand — I'm here.

You can log back in here: ${APP_URL}

Thanks,
Gavin Grainger
Business Owner
${APP_URL}`
    }
  },
  registered_with_customers: {
    nextStatus: 'registered_with_customers',
    sequenceStep: 'registered_with_customers_nudge',
    followUpDays: 14,
    subject: () => 'Great progress so far',
    body: (lead) => {
      const greeting = lead.owner_name?.trim()
        ? `Hi ${lead.owner_name.trim()},`
        : 'Hi there,'

      return `${greeting}
Great progress so far - I can see you've registered and already added a few customers, which is exactly the right start.

Once you keep building from here, Pelican becomes much more useful day-to-day for:
- planning recurring work
- tracking completed jobs and payments
- keeping all customer details in one place

If you'd like, I can help you with the next step and get the rest of your round set up faster.

Just reply and let me know if you want a hand.

You can log back in here: ${APP_URL}

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
    business_name: (lead.business_name || '').trim(),
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

function getNextCustomLeadId(leads) {
  const prefix = 'CUS-'
  const used = new Set(
    leads
      .map((lead) => String(lead.lead_id || '').trim())
      .filter((id) => id.startsWith(prefix))
  )

  let candidate = 1
  while (candidate <= 99999) {
    const id = `${prefix}${String(candidate).padStart(3, '0')}`
    if (!used.has(id)) return id
    candidate += 1
  }

  return `${prefix}${Date.now()}`
}

function LeadsManager({ user }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingLeadId, setSavingLeadId] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeListTab, setActiveListTab] = useState('leads')
  const [isAddingLead, setIsAddingLead] = useState(false)
  const [newLead, setNewLead] = useState({
    lead_id: '',
    business_name: '',
    area: '',
    owner_name: '',
    email: '',
    phone: '',
    website: '',
    status: 'new',
    sequence_step: '',
    next_follow_up: '',
    response_status: '',
    notes: ''
  })

  useEffect(() => {
    if (!user?.admin) return
    fetchLeads()
  }, [user?.admin])

  async function fetchLeads() {
    setLoading(true)
    setStatusMessage('')

    try {
      const PAGE_SIZE = 1000
      let allLeads = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('Leads')
          .select('*')
          .order('lead_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error
        if (!data || data.length === 0) break
        allLeads = allLeads.concat(data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      setLeads(allLeads)
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

  async function handleStatusChange(lead, value) {
    const updatedLead = {
      ...lead,
      status: value,
      next_follow_up: value === 'not_replied' ? '' : lead.next_follow_up
    }

    setLeads((prev) => prev.map((row) => {
      if (row.id !== lead.id) return row
      return updatedLead
    }))

    // If the new status has an email template, open Gmail automatically then
    // let sendNextEmail handle saving. Otherwise just save immediately.
    if (emailStepByStatus[value]) {
      await sendNextEmail(updatedLead)
    } else {
      await saveLead(updatedLead)
    }
  }

  function normalizeDate(value) {
    const trimmed = (value || '').trim()
    return trimmed || null
  }

  function handleNewLeadChange(field, value) {
    setNewLead((prev) => ({ ...prev, [field]: value }))
  }

  function resetNewLead() {
    setNewLead({
      lead_id: '',
      business_name: '',
      area: '',
      owner_name: '',
      email: '',
      phone: '',
      website: '',
      status: 'new',
      sequence_step: '',
      next_follow_up: '',
      response_status: '',
      notes: ''
    })
  }

  async function addLead() {
    const businessName = (newLead.business_name || '').trim()
    if (!businessName) {
      setStatusMessage('Business name is required to add a lead')
      return
    }

    const leadIdInput = (newLead.lead_id || '').trim()
    const nextLeadId = leadIdInput || getNextCustomLeadId(leads)

    const payload = {
      lead_id: nextLeadId,
      business_name: businessName,
      area: (newLead.area || '').trim() || null,
      owner_name: (newLead.owner_name || '').trim() || null,
      email: (newLead.email || '').trim() || null,
      phone: (newLead.phone || '').trim() || null,
      website: (newLead.website || '').trim() || null,
      source_url: null,
      status: (newLead.status || 'new').trim() || 'new',
      sequence_step: (newLead.sequence_step || '').trim() || null,
      next_follow_up: normalizeDate(newLead.next_follow_up),
      response_status: (newLead.response_status || '').trim() || null,
      notes: (newLead.notes || '').trim() || null
    }

    setIsAddingLead(true)
    setStatusMessage('')

    try {
      const { data, error } = await supabase
        .from('Leads')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw error

      setLeads((prev) => [...prev, data].sort((a, b) => String(a.lead_id).localeCompare(String(b.lead_id))))
      resetNewLead()
      setStatusMessage(`Added ${payload.lead_id}`)
    } catch (error) {
      console.error('Error adding lead:', error.message)
      setStatusMessage(`Could not add lead: ${error.message}`)
    } finally {
      setIsAddingLead(false)
    }
  }

  async function saveLead(lead) {
    const businessName = (lead.business_name || '').trim()
    if (!businessName) {
      setStatusMessage('Business name is required')
      return
    }

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

    const nextFollowUp = Number.isFinite(step.followUpDays)
      ? toIsoDateFromNow(step.followUpDays)
      : null
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

  async function handleSendNextEmailClick(lead) {
    const recipient = (lead.email || '').trim().toLowerCase()

    if (recipient) {
      const duplicateLeads = leads.filter((row) => {
        if (row.id === lead.id) return false
        return (row.email || '').trim().toLowerCase() === recipient
      })

      if (duplicateLeads.length > 0) {
        const sampleIds = duplicateLeads
          .map((row) => row.lead_id)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ')
        const idsNote = sampleIds ? `\nMatching lead(s): ${sampleIds}` : ''
        const shouldSend = window.confirm(
          `There is a duplicate email address on another lead. Do you still want to send?${idsNote}`
        )

        if (!shouldSend) {
          setStatusMessage('Email send cancelled (duplicate email detected).')
          return
        }
      }
    }

    await sendNextEmail(lead)
  }

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const today = toIsoDateFromNow(0)

    return leads.filter((lead) => {
      if (activeListTab === 'followup') {
        const followUpDate = (lead.next_follow_up || '').trim()
        const isClosed = (lead.status || '') === 'closed'
        if (!followUpDate || followUpDate > today || isClosed) {
          return false
        }
      }

      if (activeListTab === 'leads' && (lead.status || 'new') !== 'new') {
        return false
      }

      const matchesStatus = activeListTab === 'leads'
        ? true
        : statusFilter === 'all' || (lead.status || 'new') === statusFilter
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
        <button
          type="button"
          className={`leads-inner-tab ${activeListTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveListTab('all')}
        >
          All Leads
        </button>
      </div>

      <div className="leads-toolbar">
        <input
          type="text"
          placeholder="Search business, email, phone, notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          disabled={activeListTab === 'leads'}
        >
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="add-lead-card">
        <h3>Add New Lead</h3>
        <div className="add-lead-grid">
          <input
            type="text"
            placeholder="Lead ID (optional, e.g. CUS-001)"
            value={newLead.lead_id}
            onChange={(e) => handleNewLeadChange('lead_id', e.target.value)}
          />
          <input
            type="text"
            placeholder="Business name *"
            value={newLead.business_name}
            onChange={(e) => handleNewLeadChange('business_name', e.target.value)}
          />
          <input
            type="text"
            placeholder="Area"
            value={newLead.area}
            onChange={(e) => handleNewLeadChange('area', e.target.value)}
          />
          <input
            type="text"
            placeholder="Owner name"
            value={newLead.owner_name}
            onChange={(e) => handleNewLeadChange('owner_name', e.target.value)}
          />
          <input
            type="email"
            placeholder="Email"
            value={newLead.email}
            onChange={(e) => handleNewLeadChange('email', e.target.value)}
          />
          <input
            type="text"
            placeholder="Phone"
            value={newLead.phone}
            onChange={(e) => handleNewLeadChange('phone', e.target.value)}
          />
          <input
            type="text"
            placeholder="Website"
            value={newLead.website}
            onChange={(e) => handleNewLeadChange('website', e.target.value)}
          />
          <select
            value={newLead.status}
            onChange={(e) => handleNewLeadChange('status', e.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Sequence step"
            value={newLead.sequence_step}
            onChange={(e) => handleNewLeadChange('sequence_step', e.target.value)}
          />
          <input
            type="date"
            value={newLead.next_follow_up}
            onChange={(e) => handleNewLeadChange('next_follow_up', e.target.value)}
          />
          <input
            type="text"
            placeholder="Response status"
            value={newLead.response_status}
            onChange={(e) => handleNewLeadChange('response_status', e.target.value)}
          />
          <input
            type="text"
            placeholder="Notes"
            value={newLead.notes}
            onChange={(e) => handleNewLeadChange('notes', e.target.value)}
          />
        </div>
        <div className="add-lead-actions">
          <button type="button" className="save-btn" onClick={addLead} disabled={isAddingLead}>
            {isAddingLead ? 'Adding...' : 'Add Lead'}
          </button>
          <button type="button" className="refresh-btn" onClick={resetNewLead} disabled={isAddingLead}>
            Clear
          </button>
        </div>
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
                      <div className="business-title-row">
                        <input
                          type="text"
                          className="business-name-input"
                          value={lead.business_name || ''}
                          onChange={(e) => handleFieldChange(lead.id, 'business_name', e.target.value)}
                        />
                        <button
                          type="button"
                          className="save-mini-btn"
                          onClick={() => saveLead(lead)}
                          disabled={savingLeadId === lead.id}
                          title="Save lead"
                          aria-label="Save lead"
                        >
                          S
                        </button>
                      </div>
                      <span>{lead.area}</span>
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
                    <div className="status-cell">
                      <select
                        value={lead.status || 'new'}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="send-next-icon-btn"
                        onClick={() => handleSendNextEmailClick(lead)}
                        disabled={savingLeadId === lead.id}
                        title="Send next email"
                        aria-label="Send next email"
                      >
                        ✉
                      </button>
                    </div>
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
