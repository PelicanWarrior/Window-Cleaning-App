import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import './WorkloadManager.css'
import { formatCurrency, formatDateByCountry, getCurrencyConfig } from '../lib/format'
import { createGoCardlessFlow, collectGoCardlessPayment } from '../lib/gocardless'
import { openMessageViaMethod } from '../lib/contactDelivery'
import { createInvoiceAttachment } from '../lib/invoiceAttachment'
import { getOwnerUserId, isOwnerUser } from '../lib/team'
import {
  flushOfflineMutationQueue,
  formatCacheTimestamp,
  getOfflineCacheKey,
  isLikelyOfflineError,
  queueOfflineMutation,
  readOfflineCache,
  writeOfflineCache
} from '../lib/offlineCache'
import InvoiceModal from './InvoiceModal'
import SendMessageMethodModal from './SendMessageMethodModal'
import CustomerDetailsModal from './CustomerDetailsModal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import axios from 'axios'
import Tesseract from 'tesseract.js'

function WorkloadManager({ user }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [customers, setCustomers] = useState([])
  const [offlineCacheInfo, setOfflineCacheInfo] = useState({ usingCache: false, savedAt: null })
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [messageFooter, setMessageFooter] = useState('')
  const [messageFooterIncludeEmployee, setMessageFooterIncludeEmployee] = useState(false)
  const [invoiceFooterIncludeEmployee, setInvoiceFooterIncludeEmployee] = useState(false)
  const [selectedLetters, setSelectedLetters] = useState({})
  const [selectedLetterAll, setSelectedLetterAll] = useState('')
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([])
  const [activeView, setActiveView] = useState('Calendar')
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedDatePickers, setExpandedDatePickers] = useState({})
  const [bulkDatePickerOpen, setBulkDatePickerOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [customerPayLetter, setCustomerPayLetter] = useState(null)
  const [quoteTurnedIntoJobLetter, setQuoteTurnedIntoJobLetter] = useState(null)
  const [sendMessageModal, setSendMessageModal] = useState({ show: false, customer: null, subject: '', body: '', historyMessage: '' })
  const [userRouteOrder, setUserRouteOrder] = useState('')
  const [orderedCustomers, setOrderedCustomers] = useState([])
  const [draggedCustomerId, setDraggedCustomerId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [draggedRoute, setDraggedRoute] = useState('')
  const [routeDragOver, setRouteDragOver] = useState('')
  const [calendarCollapsed, setCalendarCollapsed] = useState(false)
  const [editingPriceCustomerId, setEditingPriceCustomerId] = useState(null)
  const [editingPriceValue, setEditingPriceValue] = useState('')
  const [mobileMenuOpenCustomerId, setMobileMenuOpenCustomerId] = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [isEditingModal, setIsEditingModal] = useState(false)
  const [modalEditData, setModalEditData] = useState({})
  const [preferredDaysSelected, setPreferredDaysSelected] = useState({})
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const dayShortcuts = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']
  const [showServices, setShowServices] = useState(false)
  const [customerServices, setCustomerServices] = useState([])
  const [isAddingService, setIsAddingService] = useState(false)
  const [newServiceData, setNewServiceData] = useState({ Service: '', Price: '', Description: '' })
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(null)
  const serviceDropdownRefs = useRef({})
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [editServiceData, setEditServiceData] = useState({})
  const [showHistory, setShowHistory] = useState(false)
  const [customerHistory, setCustomerHistory] = useState([])
  const [showInvoices, setShowInvoices] = useState(false)
  const [customerInvoices, setCustomerInvoices] = useState([])
  const [invoiceActionMenuId, setInvoiceActionMenuId] = useState(null)
  const [invoiceDetailsModal, setInvoiceDetailsModal] = useState({ show: false, invoice: null, items: [] })
  const [cancelServiceModal, setCancelServiceModal] = useState({ show: false, reason: '' })
  const [bookJobModal, setBookJobModal] = useState({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })
  const [invoiceModal, setInvoiceModal] = useState({ show: false, customer: null })
  const [goCardlessLoadingCustomerId, setGoCardlessLoadingCustomerId] = useState(null)
  const [gcConfirmModal, setGcConfirmModal] = useState({ open: false, customer: null, amount: '' })
  const [selectedRoutes, setSelectedRoutes] = useState([])
  const [calendarView, setCalendarView] = useState('Monthly')
  const [weeklyWeather, setWeeklyWeather] = useState({})
  const [teamMembers, setTeamMembers] = useState([])
  const isAdmin = Boolean(user?.admin)
  const ownerUserId = getOwnerUserId(user)
  const isOwner = isOwnerUser(user)
  const hasEmployees = isOwner && teamMembers.length > 0
  const workloadCustomerCacheKey = ownerUserId
    ? getOfflineCacheKey('workload-customers', ownerUserId, isOwner ? 'owner' : `employee-${user?.id || 'unknown'}`)
    : null
  const workloadMutationQueueKey = ownerUserId
    ? getOfflineCacheKey('workload-customer-mutations', ownerUserId, isOwner ? 'owner' : `employee-${user?.id || 'unknown'}`)
    : null
  const syncingMutationsRef = useRef(false)
  const [personalCalendarItems, setPersonalCalendarItems] = useState([])
  const [showPersonalItemModal, setShowPersonalItemModal] = useState(false)
  const [savingPersonalItem, setSavingPersonalItem] = useState(false)
  const [personalItemForm, setPersonalItemForm] = useState({ Date: '', Item: '', Description: '' })
  const [showPersonalImportModal, setShowPersonalImportModal] = useState(false)
  const [processingPersonalImport, setProcessingPersonalImport] = useState(false)
  const [importPersonalItemsPreview, setImportPersonalItemsPreview] = useState([])
  const [importPersonalItemsAll, setImportPersonalItemsAll] = useState([])
  const [importPersonalFileName, setImportPersonalFileName] = useState('')
  const [importPersonalError, setImportPersonalError] = useState('')
  const [importPersonalDuplicateCount, setImportPersonalDuplicateCount] = useState(0)
  const [importPersonalAssumedYearCount, setImportPersonalAssumedYearCount] = useState(0)

  const applyQueuedCustomerMutation = async (mutation) => {
    if (!mutation?.type) return

    if (mutation.type === 'update') {
      const { error } = await supabase
        .from('Customers')
        .update(mutation.changes || {})
        .eq('id', mutation.customerId)
        .eq('UserId', ownerUserId)
      if (error) throw error
      return
    }

    if (mutation.type === 'delete') {
      const { error } = await supabase
        .from('Customers')
        .delete()
        .eq('id', mutation.customerId)
        .eq('UserId', ownerUserId)
      if (error) throw error
    }
  }

  const queueWorkloadCustomerMutation = (mutation, queuedMessage) => {
    if (!workloadMutationQueueKey) return false

    queueOfflineMutation(workloadMutationQueueKey, mutation)
    if (queuedMessage) {
      alert(`${queuedMessage} It will sync automatically when internet returns.`)
    }
    return true
  }
  useEffect(() => {
    if (!serviceDropdownOpen) return

    const dropdownElement = serviceDropdownRefs.current[serviceDropdownOpen]
    if (!dropdownElement) return

    requestAnimationFrame(() => {
      dropdownElement.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' })
    })
  }, [serviceDropdownOpen])

  useEffect(() => {
    if (!mobileMenuOpenCustomerId) return

    const handleOutsideMenuClick = (event) => {
      if (event.target.closest('.mobile-menu-container')) return
      setMobileMenuOpenCustomerId(null)
    }

    document.addEventListener('mousedown', handleOutsideMenuClick)
    document.addEventListener('touchstart', handleOutsideMenuClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideMenuClick)
      document.removeEventListener('touchstart', handleOutsideMenuClick)
    }
  }, [mobileMenuOpenCustomerId])

  useEffect(() => {
    if (showCustomerModal) return
    setShowServices(false)
    setShowHistory(false)
    setShowInvoices(false)
    setCustomerInvoices([])
    setInvoiceActionMenuId(null)
    setInvoiceDetailsModal({ show: false, invoice: null, items: [] })
  }, [showCustomerModal])

  const getFullAddress = (customer) => {
    const parts = [
      customer.Address || '',
      customer.Address2 || '',
      customer.Address3 || '',
      customer.Postcode || ''
    ].filter(Boolean)
    return parts.join(', ')
  }

  const parsePreferredDays = (preferredDaysString) => {
    if (!preferredDaysString) return {}
    const days = preferredDaysString.split(',').map(d => d.trim())
    const parsed = {}
    daysOfWeek.forEach(day => {
      parsed[day] = days.includes(day)
    })
    return parsed
  }

  const formatPreferredDays = (daysObject) => {
    const selected = daysOfWeek.filter(day => daysObject[day])
    return selected.length > 0 ? selected.join(', ') : ''
  }

  const getAdditionalServices = (customer) => {
    if (!customer.NextServices) return ''
    const services = customer.NextServices.split(',').map(s => s.trim())
    const additionalServices = services.filter(s => s !== 'Windows')
    return additionalServices.length > 0 ? ` (Inc ${additionalServices.join(', ')})` : ''
  }

  const isDayMatchingPreferredDays = (selectedDate, preferredDaysString) => {
    if (!selectedDate || !preferredDaysString) return true
    const date = new Date(selectedDate)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const currentDayName = dayNames[date.getDay()]
    const preferredDays = preferredDaysString.split(',').map(d => d.trim())
    return preferredDays.includes(currentDayName)
  }

  const toLocalDateKey = (dateObj) => {
    if (!(dateObj instanceof Date)) return ''
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const normalizeDateKey = (value) => {
    if (!value && value !== 0) return ''
    if (value instanceof Date) return toLocalDateKey(value)
    if (typeof value === 'number') {
      return toLocalDateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), value))
    }
    if (typeof value === 'string') {
      return value.includes('T') ? value.split('T')[0] : value
    }
    return ''
  }

  const parseDateKeyToLocalDate = (value) => {
    const dateKey = normalizeDateKey(value)
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
    if (!match) return null

    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    return new Date(year, month, day)
  }

  const getPersonalItemsForDate = (dayOrDate) => {
    if (!isAdmin || !personalCalendarItems.length) return []
    const dateKey = normalizeDateKey(dayOrDate)
    return personalCalendarItems.filter((item) => normalizeDateKey(item.Date) === dateKey)
  }

  const getSelectedCalendarDateString = () => {
    if (selectedDate) {
      const selectedLocalDate = parseDateKeyToLocalDate(selectedDate)
      if (selectedLocalDate) return toLocalDateKey(selectedLocalDate)
    }
    return toLocalDateKey(currentDate)
  }

  // Get employee name by assigned user ID
  const getEmployeeNameById = (userId) => {
    if (!userId) return 'Unassigned'
    if (Number(userId) === Number(ownerUserId)) return user?.UserName || 'Owner'
    const member = teamMembers.find((m) => Number(m.id) === Number(userId))
    return member ? (member.UserName || member.email_address || `User ${member.id}`) : 'Unknown Employee'
  }

  const currentAccountLabel = user?.UserName || user?.email_address || 'Current Account'

  // Group customers by assigned user ID
  const groupCustomersByAssignee = (customers) => {
    if (!isOwner || !hasEmployees || customers.length === 0) return [{ assigneeId: null, assigneeName: '', customers }]
    
    const grouped = {}
    const ordered = []
    
    customers.forEach((customer) => {
      const assigneeId = customer.AssignedUserId || 'unassigned'
      if (!grouped[assigneeId]) {
        grouped[assigneeId] = {
          assigneeId: customer.AssignedUserId || null,
          assigneeName: getEmployeeNameById(customer.AssignedUserId),
          customers: []
        }
        ordered.push(assigneeId)
      }
      grouped[assigneeId].customers.push(customer)
    })
    
    return ordered.map(key => grouped[key])
  }

  // Calculate total income for a group of customers
  const getGroupTotalIncome = (customers) => {
    return customers.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)
  }

  const openPersonalItemModal = () => {
    if (!isAdmin) return
    setPersonalItemForm({
      Date: getSelectedCalendarDateString(),
      Item: '',
      Description: ''
    })
    setShowPersonalItemModal(true)
  }

  const closePersonalItemModal = () => {
    setShowPersonalItemModal(false)
    setSavingPersonalItem(false)
    setPersonalItemForm({ Date: '', Item: '', Description: '' })
  }

  const openPersonalImportModal = () => {
    if (!isAdmin) return
    setShowPersonalImportModal(true)
    setImportPersonalItemsPreview([])
    setImportPersonalItemsAll([])
    setImportPersonalFileName('')
    setImportPersonalError('')
    setImportPersonalDuplicateCount(0)
    setImportPersonalAssumedYearCount(0)
    setProcessingPersonalImport(false)
  }

  const closePersonalImportModal = () => {
    setShowPersonalImportModal(false)
    setImportPersonalItemsPreview([])
    setImportPersonalItemsAll([])
    setImportPersonalFileName('')
    setImportPersonalError('')
    setImportPersonalDuplicateCount(0)
    setImportPersonalAssumedYearCount(0)
    setProcessingPersonalImport(false)
  }

  const cleanPersonalItemLabel = (label) => {
    return (label || '')
      .replace(/\b\d{4}\b/g, '')
      .replace(/\bdays?\b/gi, '')
      .replace(/\bdates?\b/gi, '')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[:\-–]+$/g, '')
      .trim()
  }

  const parseHumanDate = (rawDate, fallbackYear = new Date().getFullYear()) => {
    if (!rawDate) return null

    const value = String(rawDate).trim()
    if (!value) return null

    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    }

    const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (slash) {
      const year = slash[3].length === 2 ? Number(`20${slash[3]}`) : Number(slash[3])
      return new Date(year, Number(slash[2]) - 1, Number(slash[1]))
    }

    const slashNoYear = value.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (slashNoYear) {
      return new Date(Number(fallbackYear), Number(slashNoYear[2]) - 1, Number(slashNoYear[1]))
    }

    const normalized = value
      .replace(/,/g, ' ')
      .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/ig, '')
      .replace(/(\d{1,2})(st|nd|rd|th)\b/ig, '$1')
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/sep\s*tember|sept\s*ember/ig, 'september')
      .replace(/oct\s*ober/ig, 'october')
      .replace(/nov\s*ember/ig, 'november')
      .replace(/dec\s*ember/ig, 'december')
      .replace(/jan\s*uary/ig, 'january')
      .replace(/feb\s*ruary/ig, 'february')
      .replace(/mar\s*ch/ig, 'march')
      .replace(/apr\s*il/ig, 'april')
      .replace(/ju\s*ne/ig, 'june')
      .replace(/ju\s*ly/ig, 'july')
      .replace(/aug\s*ust/ig, 'august')
      .replace(/\s+/g, ' ')
      .trim()

    const textMatch = normalized.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?$/)
    if (!textMatch) return null

    const monthLookup = {
      january: 0, jan: 0,
      february: 1, feb: 1,
      march: 2, mar: 2,
      april: 3, apr: 3,
      may: 4,
      june: 5, jun: 5,
      july: 6, jul: 6,
      august: 7, aug: 7,
      september: 8, sept: 8, sep: 8,
      october: 9, oct: 9,
      november: 10, nov: 10,
      december: 11, dec: 11
    }

    const day = Number(textMatch[1])
    const month = monthLookup[textMatch[2].toLowerCase()]
    const year = textMatch[3] ? Number(textMatch[3]) : Number(fallbackYear)

    if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null
    return new Date(year, month, day)
  }

  const listDatesInRange = (startDate, endDate) => {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return []
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return []
    if (endDate < startDate) return []

    const days = []
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    while (cursor <= endDate) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return days
  }

  const buildPersonalImportEntry = (dateObj, item, description = '') => {
    const dateValue = normalizeDateKey(dateObj)
    const itemValue = cleanPersonalItemLabel(item)
    if (!dateValue || !itemValue) return null

    return {
      Date: dateValue,
      Item: itemValue,
      Description: (description || '').trim()
    }
  }

  const dedupePersonalImportEntries = (entries) => {
    const seen = new Set()
    const deduped = []

    entries.forEach((entry) => {
      if (!entry?.Date || !entry?.Item) return
      const key = `${entry.Date}|${entry.Item.toLowerCase()}`
      if (seen.has(key)) return
      seen.add(key)
      deduped.push(entry)
    })

    return deduped
  }

  const extractPersonalItemsFromText = (rawText) => {
    if (!rawText) return []

    const lines = String(rawText)
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)

    const entries = []
    let currentHeading = ''
    let currentYear = currentDate.getFullYear()

    const headingRegex = /(.+?\bterm)\s+dates?\s+(\d{4})/i
    const rangeRegex = /((?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?)\s*(?:to|\-|–|—)\s*((?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?)(.*)$/i
    const singleRegex = /((?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?)(.*)$/i

    lines.forEach((rawLine) => {
      let line = rawLine
        .replace(/\|/g, ' ')
        .replace(/\(\s*\d+\s*days?\s*\)/ig, '')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .replace(/([A-Za-z])(\d)/g, '$1 $2')
        .trim()

      if (!line) return

      const headingMatch = line.match(headingRegex)
      if (headingMatch) {
        currentHeading = cleanPersonalItemLabel(headingMatch[1])
        currentYear = Number(headingMatch[2])
        line = line.replace(headingMatch[0], '').trim()
        if (!line) return
      }

      if (!/\d/.test(line)) return

      let label = ''
      let dateText = line

      if (line.includes(':')) {
        const [left, ...rest] = line.split(':')
        label = cleanPersonalItemLabel(left)
        dateText = rest.join(':').trim()
      }

      const rangeMatch = dateText.match(rangeRegex)
      if (rangeMatch) {
        const startFragment = rangeMatch[1]
        const endFragment = rangeMatch[2]
        const trailingLabel = cleanPersonalItemLabel(rangeMatch[3])

        const endDate = parseHumanDate(endFragment, currentYear)
        const startDate = parseHumanDate(startFragment, endDate ? endDate.getFullYear() : currentYear)
        if (!startDate || !endDate) return

        const itemLabel = label || trailingLabel || currentHeading || 'Personal Item'
        listDatesInRange(startDate, endDate).forEach((dateObj) => {
          const entry = buildPersonalImportEntry(dateObj, itemLabel, rawLine)
          if (entry) entries.push(entry)
        })
        return
      }

      const singleMatch = dateText.match(singleRegex)
      if (!singleMatch) return

      const singleDate = parseHumanDate(singleMatch[1], currentYear)
      if (!singleDate) return

      const trailingLabel = cleanPersonalItemLabel(singleMatch[2])
      const itemLabel = label || trailingLabel || currentHeading || 'Personal Item'
      const entry = buildPersonalImportEntry(singleDate, itemLabel, rawLine)
      if (entry) entries.push(entry)
    })

    return dedupePersonalImportEntries(entries)
  }

  const parseCsvLine = (line, delimiter) => {
    const result = []
    let current = ''
    let inQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      const nextChar = line[index + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          index += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result
  }

  const extractPersonalItemsFromCsv = (rawCsv) => {
    if (!rawCsv) return { entries: [], assumedYearCount: 0 }

    const lines = String(rawCsv)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) return { entries: [], assumedYearCount: 0 }

    const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ','
    const rows = lines.map((line) => parseCsvLine(line, delimiter))

    if (!rows.length) return { entries: [], assumedYearCount: 0 }

    const firstRow = rows[0].map((cell) => cell.toLowerCase())
    const hasHeader = firstRow.some((cell) => /date|item|header|title|description|start|end|from|to|term|event/.test(cell))

    const entries = []
    let assumedYearCount = 0

    if (hasHeader) {
      const header = rows[0].map((cell) => cell.toLowerCase().replace(/\s+/g, ''))
      const dataRows = rows.slice(1)

      dataRows.forEach((row) => {
        const getValue = (...keys) => {
          const idx = header.findIndex((column) => keys.includes(column))
          return idx >= 0 ? (row[idx] || '').trim() : ''
        }

        const item = cleanPersonalItemLabel(getValue('item', 'header', 'title', 'name', 'term', 'event'))
        const description = getValue('description', 'notes', 'note', 'details')
        const dateValue = getValue('date', 'day')
        const startValue = getValue('start', 'startdate', 'from')
        const endValue = getValue('end', 'enddate', 'to')

        if (/^\d{1,2}\/\d{1,2}$/.test(startValue)) assumedYearCount += 1
        if (/^\d{1,2}\/\d{1,2}$/.test(endValue)) assumedYearCount += 1
        if (/^\d{1,2}\/\d{1,2}$/.test(dateValue)) assumedYearCount += 1

        if (startValue && endValue) {
          const endDate = parseHumanDate(endValue, currentDate.getFullYear())
          const startDate = parseHumanDate(startValue, endDate ? endDate.getFullYear() : currentDate.getFullYear())
          if (!startDate || !endDate) return

          listDatesInRange(startDate, endDate).forEach((dateObj) => {
            const entry = buildPersonalImportEntry(dateObj, item || 'Personal Item', description)
            if (entry) entries.push(entry)
          })
          return
        }

        if (dateValue) {
          const dateObj = parseHumanDate(dateValue, currentDate.getFullYear())
          if (!dateObj) return
          const entry = buildPersonalImportEntry(dateObj, item || 'Personal Item', description)
          if (entry) entries.push(entry)
        }
      })
    } else {
      const text = rows.map((row) => row.filter(Boolean).join(' ')).join('\n')
      return { entries: extractPersonalItemsFromText(text), assumedYearCount: 0 }
    }

    return { entries: dedupePersonalImportEntries(entries), assumedYearCount }
  }

  const handlePersonalImportFileChange = async (event) => {
    if (!isAdmin) return

    const file = event.target.files?.[0]
    if (!file) return

    setImportPersonalError('')
    setImportPersonalDuplicateCount(0)
    setImportPersonalAssumedYearCount(0)
    setImportPersonalFileName(file.name)
    setProcessingPersonalImport(true)

    try {
      let parsedEntries = []
      const lowerFileName = file.name.toLowerCase()

      if (lowerFileName.endsWith('.csv') || file.type.includes('csv')) {
        const csvText = await file.text()
        const csvResult = extractPersonalItemsFromCsv(csvText)
        parsedEntries = csvResult.entries
        setImportPersonalAssumedYearCount(csvResult.assumedYearCount)
      } else if (file.type.startsWith('image/')) {
        const ocrResult = await Tesseract.recognize(file, 'eng')
        parsedEntries = extractPersonalItemsFromText(ocrResult?.data?.text || '')
      } else {
        setImportPersonalError('Unsupported file type. Please upload an image or CSV file.')
      }

      const existingKeys = new Set(
        personalCalendarItems.map((item) => `${normalizeDateKey(item.Date)}|${(item.Item || '').trim().toLowerCase()}`)
      )

      const filteredEntries = parsedEntries.filter(
        (entry) => !existingKeys.has(`${entry.Date}|${(entry.Item || '').toLowerCase()}`)
      )

      const duplicateCount = parsedEntries.length - filteredEntries.length
      setImportPersonalDuplicateCount(duplicateCount)

      if (parsedEntries.length === 0) {
        setImportPersonalError('No dates were detected. Try a clearer image or a CSV with date columns.')
      } else if (filteredEntries.length === 0) {
        setImportPersonalError('All detected items already exist (same date + header).')
      }

      setImportPersonalItemsAll(filteredEntries)
      setImportPersonalItemsPreview(filteredEntries.slice(0, 25))
    } catch (error) {
      console.error('Error parsing personal import file:', error.message)
      setImportPersonalError('Could not parse this file. Please check the format and try again.')
      setImportPersonalDuplicateCount(0)
      setImportPersonalAssumedYearCount(0)
      setImportPersonalItemsAll([])
      setImportPersonalItemsPreview([])
    } finally {
      setProcessingPersonalImport(false)
      event.target.value = ''
    }
  }

  const handleImportPersonalItems = async () => {
    if (!isAdmin || importPersonalItemsAll.length === 0) return

    try {
      setProcessingPersonalImport(true)

      const existingKeys = new Set(
        personalCalendarItems.map((item) => `${normalizeDateKey(item.Date)}|${(item.Item || '').trim().toLowerCase()}`)
      )

      const rowsToInsert = importPersonalItemsAll
        .filter((entry) => !existingKeys.has(`${entry.Date}|${entry.Item.toLowerCase()}`))
        .map((entry) => ({
          Date: entry.Date,
          Item: entry.Item,
          Description: entry.Description || null,
          UserID: user.id
        }))

      if (rowsToInsert.length === 0) {
        setImportPersonalError('All detected items already exist.')
        setProcessingPersonalImport(false)
        return
      }

      const chunkSize = 500
      for (let index = 0; index < rowsToInsert.length; index += chunkSize) {
        const chunk = rowsToInsert.slice(index, index + chunkSize)
        const { error } = await supabase.from('Calender').insert(chunk)
        if (error) throw error
      }

      await fetchPersonalCalendarItems()
      closePersonalImportModal()
    } catch (error) {
      console.error('Error importing personal items:', error.message)
      setImportPersonalError('Import failed while saving to Supabase. Please try again.')
      setProcessingPersonalImport(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
    fetchTeamMembers()
    fetchMessagesAndFooter()
    fetchPersonalCalendarItems()
    fetchCalendarView()
    fetchCustomerPayLetter()
    fetchQuoteTurnedIntoJobLetter()
    fetchAndInitializeUserRouteOrder()
    fetchCalendarDate()
    fetchCalendarPosition()
    fetchCalendarViewMode()
  }, [user])

  useEffect(() => {
    if (!workloadMutationQueueKey || syncingMutationsRef.current) return

    const syncQueuedMutations = async () => {
      if (syncingMutationsRef.current) return
      syncingMutationsRef.current = true

      try {
        const result = await flushOfflineMutationQueue(workloadMutationQueueKey, applyQueuedCustomerMutation)
        if (result.processed > 0) {
          fetchCustomers()
        }
      } finally {
        syncingMutationsRef.current = false
      }
    }

    syncQueuedMutations()
    window.addEventListener('online', syncQueuedMutations)

    return () => {
      window.removeEventListener('online', syncQueuedMutations)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workloadMutationQueueKey, ownerUserId])

  useEffect(() => {
    setSelectedLetterAll('')
  }, [selectedDate, currentDate])

  useEffect(() => {
    setSelectedCustomerIds([])
  }, [selectedDate, currentDate])

  // Fetch weather when calendar view is Weekly or when currentDate changes in weekly view
  useEffect(() => {
    console.log('useEffect triggered - calendarView:', calendarView, 'user.Postcode:', user?.Postcode, 'currentDate:', currentDate)
    if (calendarView === 'Weekly') {
      const postcode = user?.Postcode?.trim()
      if (postcode) {
        console.log('Calling fetchWeatherData with postcode:', postcode)
        fetchWeatherData()
      } else {
        console.log('Postcode not available or empty, skipping weather fetch. user?.Postcode=', user?.Postcode)
        setWeeklyWeather({})
      }
    } else {
      setWeeklyWeather({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarView, currentDate])

  // Fetch and initialize user route order from Users table
  async function fetchAndInitializeUserRouteOrder() {
    if (!ownerUserId) return

    try {
      const { data, error } = await supabase
        .from('Users')
        .select('RouteOrder')
        .eq('id', ownerUserId)
        .single()

      if (error) throw error

      let routeOrderStr = data?.RouteOrder || ''

      // Ensure all current customers are in RouteOrder
      const { data: customersData } = await supabase
        .from('Customers')
        .select('id')
        .eq('UserId', ownerUserId)

      if (customersData && isOwner) {
        const existingIds = new Set(
          routeOrderStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
        )
        const allCustomerIds = customersData.map(c => c.id)
        const missingIds = allCustomerIds.filter(id => !existingIds.has(id))

        if (missingIds.length > 0) {
          routeOrderStr = routeOrderStr
            ? `${routeOrderStr},${missingIds.join(',')}`
            : missingIds.join(',')

          // Update Users table with new RouteOrder
          const { error: updateError } = await supabase
            .from('Users')
            .update({ RouteOrder: routeOrderStr })
            .eq('id', ownerUserId)
          if (updateError) throw updateError
        }
      }

      setUserRouteOrder(routeOrderStr)
    } catch (error) {
      console.error('Error fetching/initializing route order:', error.message)
    }
  }

  // Derive ordered customers (non-quote jobs) for a specific day based on user's RouteOrder
  const getOrderedCustomersForDate = (day) => {
    const dayCustomers = getJobsForDate(day)
    if (!userRouteOrder || dayCustomers.length === 0) {
      return dayCustomers
    }

    const idToCustomer = new Map(dayCustomers.map(c => [c.id, c]))
    const routeIds = userRouteOrder.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id))

    // In-order customers from route
    const orderedFromRoute = routeIds
      .map(id => idToCustomer.get(id))
      .filter(Boolean)

    // Append any remaining customers not included in route
    const remaining = dayCustomers.filter(c => !routeIds.includes(c.id))
    return [...orderedFromRoute, ...remaining]
  }

  // Derive ordered customers for selected date based on user's RouteOrder
  const deriveOrderedCustomers = () => {
    if (!selectedDate) {
      setOrderedCustomers([])
      return
    }

    const dayCustomers = getJobsForDate(selectedDate)
    if (!userRouteOrder) {
      setOrderedCustomers(dayCustomers)
      return
    }

    const idToCustomer = new Map(dayCustomers.map(c => [c.id, c]))
    const routeIds = userRouteOrder.split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id))

    // In-order customers from route
    const orderedFromRoute = routeIds
      .map(id => idToCustomer.get(id))
      .filter(Boolean)

    // Append any remaining customers not included in route
    const remaining = dayCustomers.filter(c => !routeIds.includes(c.id))
    setOrderedCustomers([...orderedFromRoute, ...remaining])
  }

  // Recompute orderedCustomers whenever customers, userRouteOrder, or selectedDate change
  useEffect(() => {
    deriveOrderedCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, userRouteOrder, selectedDate])

  async function fetchCustomers() {
    if (!ownerUserId) return

    try {
      let query = supabase
        .from('Customers')
        .select('*')
        .eq('UserId', ownerUserId)

      if (!isOwner && user?.id) {
        query = query.eq('AssignedUserId', user.id)
      }

      query = query.order('NextClean', { ascending: true })

      const { data, error } = await query
      
      if (error) throw error
      const latestCustomers = data || []
      setCustomers(latestCustomers)
      setOfflineCacheInfo({ usingCache: false, savedAt: null })

      if (workloadCustomerCacheKey) {
        writeOfflineCache(workloadCustomerCacheKey, latestCustomers)
      }
    } catch (error) {
      if (workloadCustomerCacheKey && isLikelyOfflineError(error)) {
        const cached = readOfflineCache(workloadCustomerCacheKey)
        if (cached?.data) {
          setCustomers(cached.data)
          setOfflineCacheInfo({ usingCache: true, savedAt: cached.savedAt || null })
          return
        }
      }

      console.error('Error fetching customers:', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTeamMembers() {
    if (!isOwner || !ownerUserId) {
      setTeamMembers([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('Users')
        .select('id, UserName, email_address, TeamRole')
        .eq('ParentUserId', ownerUserId)
        .order('UserName', { ascending: true })

      if (error) throw error
      setTeamMembers(data || [])
    } catch (error) {
      console.error('Error fetching team members:', error.message)
      setTeamMembers([])
    }
  }

  async function fetchPersonalCalendarItems() {
    if (!isAdmin || !user?.id) {
      setPersonalCalendarItems([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('Calender')
        .select('id, Date, Item, Description, UserID')
        .eq('UserID', user.id)
        .order('Date', { ascending: true })
        .order('id', { ascending: true })

      if (error) throw error
      setPersonalCalendarItems(data || [])
    } catch (error) {
      console.error('Error fetching personal calender items:', error.message)
      setPersonalCalendarItems([])
    }
  }

  async function handleSavePersonalItem() {
    if (!isAdmin) return

    const itemTitle = (personalItemForm.Item || '').trim()
    const itemDescription = (personalItemForm.Description || '').trim()

    if (!personalItemForm.Date || !itemTitle) {
      alert('Please add both a date and header for your personal item.')
      return
    }

    try {
      setSavingPersonalItem(true)

      const { error } = await supabase
        .from('Calender')
        .insert({
          Date: personalItemForm.Date,
          Item: itemTitle,
          Description: itemDescription || null,
          UserID: user.id
        })

      if (error) throw error

      await fetchPersonalCalendarItems()
      closePersonalItemModal()
    } catch (error) {
      console.error('Error creating personal calender item:', error.message)
      alert('Failed to save personal item. Please try again.')
      setSavingPersonalItem(false)
    }
  }

  async function handleDeletePersonalItem(itemId) {
    if (!isAdmin || !itemId) return

    try {
      const { error } = await supabase
        .from('Calender')
        .delete()
        .eq('id', itemId)
        .eq('UserID', user.id)

      if (error) throw error

      setPersonalCalendarItems((prev) => prev.filter((item) => item.id !== itemId))
    } catch (error) {
      console.error('Error deleting personal calender item:', error.message)
      alert('Failed to delete personal item. Please try again.')
    }
  }

  async function fetchMessagesAndFooter() {
    if (!ownerUserId) return

    try {
      const [{ data: messagesData, error: messagesError }, { data: userData, error: userError }] = await Promise.all([
        supabase
          .from('Messages')
          .select('*')
          .eq('UserId', ownerUserId)
          .order('MessageTitle', { ascending: true }),
        supabase
          .from('Users')
          .select('MessageFooter, MessageFooterIncludeEmployee, InvoiceFooterIncludeEmployee')
          .eq('id', ownerUserId)
          .single()
      ])

      if (messagesError) throw messagesError
      if (userError) throw userError

      setMessages(messagesData || [])
      setMessageFooter(userData?.MessageFooter || '')
      setMessageFooterIncludeEmployee(userData?.MessageFooterIncludeEmployee || false)
      setInvoiceFooterIncludeEmployee(userData?.InvoiceFooterIncludeEmployee || false)
    } catch (error) {
      console.error('Error fetching messages/footer:', error.message)
    }
  }

  async function fetchCalendarView() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderView')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setActiveView(data?.CalenderView || 'Calendar')
    } catch (error) {
      console.error('Error fetching calendar view:', error.message)
      setActiveView('Calendar')
    }
  }

  async function fetchCustomerPayLetter() {
    if (!ownerUserId) return

    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CustomerPayLetter')
        .eq('id', ownerUserId)
        .single()

      if (error) throw error
      setCustomerPayLetter(data?.CustomerPayLetter || null)
    } catch (error) {
      console.error('Error fetching customer pay letter:', error.message)
    }
  }

  async function fetchQuoteTurnedIntoJobLetter() {
    if (!ownerUserId) return

    try {
      const { data, error } = await supabase
        .from('Users')
        .select('QuoteTurnedIntoJobLetter')
        .eq('id', ownerUserId)
        .single()

      if (error) throw error
      setQuoteTurnedIntoJobLetter(data?.QuoteTurnedIntoJobLetter || null)
    } catch (error) {
      console.error('Error fetching quote turned into job letter:', error.message)
    }
  }

  async function fetchCalendarDate() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderDate')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      if (data?.CalenderDate) {
        const savedDate = parseDateKeyToLocalDate(data.CalenderDate)
        if (!savedDate) {
          setCurrentDate(new Date())
          setSelectedDate(toLocalDateKey(new Date()))
          return
        }
        // Set currentDate to the actual saved date (not just the 1st of month)
        setCurrentDate(savedDate)
        setSelectedDate(toLocalDateKey(savedDate))
      } else {
        // If no saved date, use today
        setCurrentDate(new Date())
        setSelectedDate(toLocalDateKey(new Date()))
      }
    } catch (error) {
      console.error('Error fetching calendar date:', error.message)
      setSelectedDate(toLocalDateKey(new Date()))
    }
  }

  async function fetchCalendarPosition() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderPosition')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      if (data?.CalenderPosition === 'Up') {
        setCalendarCollapsed(true)
      } else {
        setCalendarCollapsed(false)
      }
    } catch (error) {
      console.error('Error fetching calendar position:', error.message)
    }
  }

  async function updateCalendarPosition(position) {
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CalenderPosition: position })
        .eq('id', user.id)

      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar position:', error.message)
    }
  }

  async function fetchCalendarViewMode() {
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('CalenderView')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      if (data?.CalenderView) {
        setCalendarView(data.CalenderView)
      }
    } catch (error) {
      console.error('Error fetching calendar view mode:', error.message)
    }
  }

  async function updateCalendarViewMode(view) {
    setCalendarView(view)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CalenderView: view })
        .eq('id', user.id)

      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar view mode:', error.message)
    }
  }

  async function fetchWeatherData() {
    try {
      const postcode = user?.Postcode?.trim()
      if (!postcode || calendarView !== 'Weekly') {
        console.log('Weather fetch skipped - Postcode:', postcode, 'CalendarView:', calendarView)
        return
      }
      
      console.log('Fetching weather for postcode:', postcode)
      
      // Get week start and end dates
      const weekStart = getWeekStart(currentDate)
      const weekEnd = getWeekEnd(currentDate)
      
      // MetOffice DataPoint API requires a Latitude and Longitude
      // First, we'll use a free geocoding service to convert postcode to coordinates
      try {
        const response = await axios.get(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
        
        if (!response.data.result) {
          console.warn('Could not find coordinates for postcode:', postcode, 'Response:', response.data)
          setWeeklyWeather({})
          return
        }

        const { latitude, longitude } = response.data.result
        
        console.log('Found coordinates:', { latitude, longitude })
        
        // Fetch weather from Open-Meteo API which is free and doesn't require authentication
        // Simplified parameters to avoid parsing errors
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max&timezone=auto`
        console.log('Weather API URL:', weatherUrl)
        
        const weatherResponse = await axios.get(weatherUrl)

        if (!weatherResponse.data.daily) {
          console.warn('Could not fetch weather data from Open-Meteo')
          setWeeklyWeather({})
          return
        }

        const weatherData = {}
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Map weather codes to emoji/description
        const getWeatherIcon = (code) => {
          if (code === 0) return '☀️' // Clear sky
          if (code === 1 || code === 2) return '🌤️' // Mainly clear / Partly cloudy
          if (code === 3) return '☁️' // Overcast
          if (code === 45 || code === 48) return '🌫️' // Foggy
          if (code === 51 || code === 53 || code === 55 || code === 61 || code === 63 || code === 65) return '🌧️' // Drizzle / Rain
          if (code === 71 || code === 73 || code === 75 || code === 77 || code === 80 || code === 81 || code === 82) return '❄️' // Snow
          if (code === 85 || code === 86) return '🌨️' // Showers
          if (code === 95 || code === 96 || code === 99) return '⛈️' // Thunderstorm
          return '🌤️' // Default
        }

        // Process each day in the week
        weatherResponse.data.daily.time.forEach((dateStr, index) => {
          const date = new Date(dateStr)
          date.setHours(0, 0, 0, 0)
          
          // Only include current and future dates, within the week range
          if (date >= today && date <= weekEnd) {
            weatherData[dateStr] = {
              icon: getWeatherIcon(weatherResponse.data.daily.weather_code[index]),
              temp_max: Math.round(weatherResponse.data.daily.temperature_2m_max[index]),
              weather_code: weatherResponse.data.daily.weather_code[index]
            }
          }
        })

        console.log('Weather data fetched and processed:', weatherData)
        setWeeklyWeather(weatherData)
      } catch (apiError) {
        console.error('API error while fetching weather:', apiError.message)
        if (apiError.response) {
          console.error('API response status:', apiError.response.status)
          console.error('API response data:', apiError.response.data)
        }
        setWeeklyWeather({})
      }
    } catch (error) {
      console.error('Error in fetchWeatherData:', error.message)
      setWeeklyWeather({})
    }
  }

  async function updateCalendarView(view) {
    setActiveView(view)
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CalenderView: view })
        .eq('id', user.id)

      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar view:', error.message)
    }
  }

  // Get the first day of the month
  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }

  // Get the last day of the month
  const getLastDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
  }

  // Get days in month
  const getDaysInMonth = (date) => {
    return getLastDayOfMonth(date).getDate()
  }

  // Get the Monday start of the current week
  const getWeekStart = (date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - (day === 0 ? 6 : day - 1)
    return new Date(d.getFullYear(), d.getMonth(), diff)
  }

  // Get the Sunday end of the current week (Monday to Sunday)
  const getWeekEnd = (date) => {
    const start = getWeekStart(date)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return end
  }

  // Get the day of week for the first day (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfWeek = (date) => {
    return getFirstDayOfMonth(date).getDay()
  }

  // Change to previous month or week
  const previousMonth = () => {
    let newDate
    if (calendarView === 'Weekly') {
      newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7)
    } else {
      newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    }
    setCurrentDate(newDate)
    setSelectedDate(null)
    // Save the new date to database
    saveCalendarDate(newDate)
  }

  // Change to next month or week
  const nextMonth = () => {
    let newDate
    if (calendarView === 'Weekly') {
      newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7)
    } else {
      newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    }
    setCurrentDate(newDate)
    setSelectedDate(null)
    // Save the new date to database
    saveCalendarDate(newDate)
  }

  // Helper function to save calendar date to database
  const saveCalendarDate = async (dateToSave) => {
    try {
      const selectedDateStr = toLocalDateKey(dateToSave)
      const { error } = await supabase
        .from('Users')
        .update({ CalenderDate: selectedDateStr })
        .eq('id', user.id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error saving calendar date:', error.message)
    }
  }

  const isQuoteCustomer = (customer) => customer.Quote === true

  // Check if a date has any jobs scheduled (non-quote)
  const hasJobsOnDate = (dayOrDate) => {
    const dateStr = normalizeDateKey(dayOrDate)
    return customers.some(customer => {
      if (!customer.NextClean || isQuoteCustomer(customer)) return false
      const nextCleanDate = normalizeDateKey(customer.NextClean)
      return nextCleanDate === dateStr
    })
  }

  const hasQuotesOnDate = (dayOrDate) => {
    const dateStr = normalizeDateKey(dayOrDate)
    return customers.some(customer => {
      if (!customer.NextClean || !isQuoteCustomer(customer)) return false
      const nextCleanDate = normalizeDateKey(customer.NextClean)
      return nextCleanDate === dateStr
    })
  }

  // Get customers for a specific date
  const getCustomersForDate = (dayOrDate) => {
    const dateStr = normalizeDateKey(dayOrDate)
    return customers.filter(customer => {
      if (!customer.NextClean) return false
      const nextCleanDate = normalizeDateKey(customer.NextClean)
      return nextCleanDate === dateStr
    })
  }

  const getJobsForDate = (dayOrDate) => getCustomersForDate(dayOrDate).filter(c => !isQuoteCustomer(c))
  const getQuotesForDate = (dayOrDate) => getCustomersForDate(dayOrDate).filter(c => isQuoteCustomer(c))

  // Handle day click
  const handleDayClick = async (dayOrDate) => {
    const selectedDateStr = normalizeDateKey(dayOrDate)
    if (!selectedDateStr) return

    setSelectedDate(selectedDateStr)
    
    // Save the selected date to CalenderDate in Users table
    try {
      const { error } = await supabase
        .from('Users')
        .update({ CalenderDate: selectedDateStr })
        .eq('id', user.id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error updating calendar date:', error.message)
    }
  }

  // Sync customer price from CustomerPrices and update NextServices
  const syncCustomerPriceAndServices = async (customerId) => {
    try {
      // Fetch Windows service price from CustomerPrices
      const { data: priceData, error: priceError } = await supabase
        .from('CustomerPrices')
        .select('Price')
        .eq('CustomerID', customerId)
        .eq('Service', 'Windows')
        .single()

      if (priceError && priceError.code !== 'PGRST116') throw priceError

      // Build update object
      const updateObj = { NextServices: 'Windows' }
      if (priceData) {
        updateObj.Price = priceData.Price
      }

      console.log('Updating customer', customerId, 'with:', updateObj)

      // Update customer with NextServices (and Price if available)
      const { error: updateError } = await supabase
        .from('Customers')
        .update(updateObj)
        .eq('id', customerId)

      if (updateError) throw updateError
      
      console.log('Update successful, refreshing customers')
      // Refresh customers list
      await fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId,
            changes: { NextServices: 'Windows' }
          },
          'Service sync saved offline.'
        )
        return
      }

      console.error('Error syncing customer price:', error)
    }
  }

  // Create a customer history record
  const createCustomerHistory = async (customerId, message) => {
    try {
      const { error } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: customerId,
          Message: message
        })
      
      if (error) throw error
    } catch (error) {
      console.error('Error creating customer history:', error)
    }
  }

  // Handle Done and Paid
  const handleDoneAndPaid = async (customer, options = {}) => {
    let nextDateValue = ''

    try {
      const currentWorkDate = parseDateKeyToLocalDate(selectedDate) || new Date(currentDate)
      const weeksToAdd = parseInt(customer.Weeks) || 0
      const nextCleanDate = new Date(currentWorkDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      
      // Create history record first
      const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const employeeHistorySuffix = messageFooterIncludeEmployee && user?.ParentUserId && user?.UserName
        ? ` from ${user.UserName}`
        : ''
      const historySuffix = typeof options.historySuffix === 'string' && options.historySuffix.trim()
        ? ` ${options.historySuffix.trim()}`
        : ''
      const hasPaidAmountOverride = options.paidAmount !== undefined && options.paidAmount !== null && Number.isFinite(Number(options.paidAmount))
      const paidAmountText = hasPaidAmountOverride
        ? Number(options.paidAmount).toFixed(2)
        : customer.Price
      const historyMessage = `${customer.NextServices} done, Paid ${symbol}${paidAmountText}${employeeHistorySuffix}${historySuffix}`
      await createCustomerHistory(customer.id, historyMessage)
      
      nextDateValue = toLocalDateKey(nextCleanDate)

      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: nextDateValue
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      fetchCustomers()

      // Check if CustomerPayLetter is set and ask to send message
      if (customerPayLetter) {
        const paymentMessage = messages.find((m) => String(m.id) === String(customerPayLetter))
        if (paymentMessage) {
          openSendMethodModal({
            customer,
            subject: paymentMessage.MessageTitle,
            body: buildPaymentMessageBody(customer, paymentMessage),
            historyMessage: `Message ${paymentMessage.MessageTitle} sent`
          })
        }
      }
      
      // Always sync price and services after marking as done
      await syncCustomerPriceAndServices(customer.id)
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: customer.id,
            changes: { NextClean: nextDateValue }
          },
          'Done & paid saved offline.'
        )

        if (queued) {
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(customer.id)
              ? { ...row, NextClean: nextDateValue }
              : row
          )))
          return
        }
      }

      console.error('Error updating customer:', error.message)
    }
  }

  // Handle Done and Not Paid
  const handleDoneAndNotPaid = async (customer) => {
    let nextDateValue = ''
    let newOutstanding = parseFloat(customer.Outstanding) || 0

    try {
      const currentWorkDate = parseDateKeyToLocalDate(selectedDate) || new Date(currentDate)
      const weeksToAdd = parseInt(customer.Weeks) || 0
      const nextCleanDate = new Date(currentWorkDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      
      // Create history record first
      const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const employeeHistorySuffix = messageFooterIncludeEmployee && user?.ParentUserId && user?.UserName
        ? ` from ${user.UserName}`
        : ''
      const historyMessage = `${customer.NextServices} done, Not Paid ${symbol}${customer.Price}${employeeHistorySuffix}`
      await createCustomerHistory(customer.id, historyMessage)
      
      newOutstanding = (parseFloat(customer.Outstanding) || 0) + (parseFloat(customer.Price) || 0)
      
      nextDateValue = toLocalDateKey(nextCleanDate)

      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: nextDateValue,
          Outstanding: newOutstanding
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      fetchCustomers()

      // Check if CustomerPayLetter is set and ask to send message
      if (customerPayLetter) {
        const paymentMessage = messages.find((m) => String(m.id) === String(customerPayLetter))
        if (paymentMessage) {
          // Update customer object with new outstanding amount for message
          const updatedCustomer = { ...customer, Outstanding: newOutstanding }
          openSendMethodModal({
            customer: updatedCustomer,
            subject: paymentMessage.MessageTitle,
            body: buildPaymentMessageBody(updatedCustomer, paymentMessage),
            historyMessage: `Message ${paymentMessage.MessageTitle} sent`
          })
        }
      }
      
      // Always sync price and services after marking as done
      await syncCustomerPriceAndServices(customer.id)
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: customer.id,
            changes: { NextClean: nextDateValue, Outstanding: newOutstanding }
          },
          'Done & not paid saved offline.'
        )

        if (queued) {
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(customer.id)
              ? { ...row, NextClean: nextDateValue, Outstanding: newOutstanding }
              : row
          )))
          return
        }
      }

      console.error('Error updating customer:', error.message)
    }
  }

  const handleSetupGoCardlessMandate = async (customer) => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }

    try {
      setGoCardlessLoadingCustomerId(customer.id)
      const data = await createGoCardlessFlow({
        userId: user.id,
        customerId: customer.id,
      })
      window.location.assign(data.url)
    } catch (error) {
      alert(error.message || 'Unable to start GoCardless setup.')
    } finally {
      setGoCardlessLoadingCustomerId(null)
    }
  }

  const openGcConfirmModal = (customer) => {
    if (!user?.GoCardlessConnected) {
      alert('Connect GoCardless first in Settings > Payments.')
      return
    }
    const activeMandateStatuses = new Set(['pending_submission', 'submitted', 'active', 'created'])
    const mandateStatus = String(customer.GoCardlessMandateStatus || '').toLowerCase()
    if (!customer.GoCardlessMandateId || !activeMandateStatuses.has(mandateStatus)) {
      alert('Customer does not have an active Direct Debit mandate. Set one up first.')
      return
    }
    const price = parseFloat(customer.Price) || 0
    const outstanding = parseFloat(customer.Outstanding) || 0
    const total = (price + outstanding).toFixed(2)
    setGcConfirmModal({ open: true, customer, amount: total })
  }

  const handleDoneAndCollectGoCardless = async (customer, amountOverride) => {
    if (!user?.GoCardlessConnected) return

    try {
      setGoCardlessLoadingCustomerId(customer.id)

      // Auto-create an invoice for the agreed amount
      const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const price = amountOverride !== undefined ? parseFloat(amountOverride) || 0 : parseFloat(customer.Price) || 0
      const invoiceDate = new Date().toISOString().split('T')[0]

      // Get next invoice number
      const { data: custIds } = await supabase.from('Customers').select('id').eq('UserId', user.id)
      const ids = (custIds || []).map((c) => c.id)
      let nextInvoiceId = '1'
      if (ids.length > 0) {
        const { data: invs } = await supabase
          .from('CustomerInvoices')
          .select('InvoiceID')
          .in('CustomerID', ids)
          .order('id', { ascending: false })
          .limit(100)
        const nums = (invs || [])
          .map((r) => { const m = String(r.InvoiceID || '').match(/(\d+)/g); return m ? parseInt(m[m.length - 1], 10) : null })
          .filter((n) => n !== null)
        if (nums.length > 0) nextInvoiceId = String(Math.max(...nums) + 1)
      }

      // Create invoice record
      const { data: invData, error: invErr } = await supabase
        .from('CustomerInvoices')
        .insert({ CustomerID: customer.id, InvoiceID: nextInvoiceId, InvoiceDate: invoiceDate })
        .select()
        .single()
      if (invErr) throw new Error(invErr.message || 'Failed to create invoice')

      // Create invoice line item
      const serviceName = customer.NextServices || 'Window Cleaning'
      await supabase.from('CustomerInvoiceJobs').insert({
        InvoiceID: invData.id,
        Service: serviceName,
        Price: parseFloat(price) || 0,
      })

      // Collect payment via GoCardless
      await collectGoCardlessPayment({
        userId: user.id,
        customerId: customer.id,
        invoiceId: invData.id,
      })

      // Mark as done and annotate history entry source
      await handleDoneAndPaid(customer, { historySuffix: 'via GoCardless', paidAmount: price })

      setGcConfirmModal({ open: false, customer: null, amount: '' })
      alert(`Payment of ${symbol}${price.toFixed(2)} submitted via Direct Debit.`)
    } catch (error) {
      alert(error.message || 'Unable to collect GoCardless payment.')
    } finally {
      setGoCardlessLoadingCustomerId(null)
    }
  }

  // Update customer price
  const handleUpdatePrice = async (customerId, newPrice) => {
    try {
      const numericPrice = parseFloat(newPrice)
      if (isNaN(numericPrice) || numericPrice < 0) {
        alert('Please enter a valid price')
        return
      }

      const { error } = await supabase
        .from('Customers')
        .update({ Price: numericPrice })
        .eq('id', customerId)

      if (error) throw error

      setEditingPriceCustomerId(null)
      setEditingPriceValue('')
      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId,
            changes: { Price: parseFloat(newPrice) }
          },
          'Price update saved offline.'
        )

        if (queued) {
          setEditingPriceCustomerId(null)
          setEditingPriceValue('')
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(customerId)
              ? { ...row, Price: parseFloat(newPrice) }
              : row
          )))
          return
        }
      }

      console.error('Error updating price:', error.message)
      alert('Failed to update price')
    }
  }

  // Update customer assigned user
  const handleAssignUserChange = async (customerId, newAssignedUserId) => {
    try {
      const { error } = await supabase
        .from('Customers')
        .update({ AssignedUserId: newAssignedUserId || null })
        .eq('id', customerId)

      if (error) throw error

      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId,
            changes: { AssignedUserId: newAssignedUserId || null }
          },
          'Assignment update saved offline.'
        )

        if (queued) {
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(customerId)
              ? { ...row, AssignedUserId: newAssignedUserId || null }
              : row
          )))
          return
        }
      }

      console.error('Error updating assigned user:', error.message)
      alert('Failed to update assignment')
    }
  }

  const buildPaymentMessageBody = (customer, message) => {
    const formalName = getFormalCustomerName(customer.CustomerName)
    const bodyParts = [`Dear ${formalName}`]
    
    if (message?.Message) {
      let messageContent = message.Message
      // Replace currency placeholder dynamically based on user country
      if (message.IncludePrice) {
        const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
        if (messageContent.includes(symbol)) {
          messageContent = messageContent.replaceAll(symbol, `${symbol}${customer.Outstanding}`)
        }
      }
      bodyParts.push(messageContent)
    }
    
    if (messageFooterIncludeEmployee && user?.ParentUserId && user?.UserName) bodyParts.push(user.UserName)
    if (messageFooter) bodyParts.push(messageFooter)

    return bodyParts.join('\n')
  }

  const closeSendMessageModal = () => {
    setSendMessageModal({ show: false, customer: null, subject: '', body: '', historyMessage: '' })
  }

  const openSendMethodModal = ({ customer, subject, body, historyMessage }) => {
    setSendMessageModal({
      show: true,
      customer,
      subject: subject || 'Message',
      body: body || '',
      historyMessage: historyMessage || 'Message sent'
    })
  }

  const handleSendMessageModalConfirm = async (method, selectedInvoice) => {
    let attachment = null
    if (selectedInvoice) {
      const attachmentResult = await createInvoiceAttachment({
        invoice: selectedInvoice,
        customer: sendMessageModal.customer,
        user
      })

      if (!attachmentResult.ok) {
        alert(attachmentResult.error || 'Unable to prepare invoice attachment.')
        return
      }

      attachment = {
        blob: attachmentResult.blob,
        filename: attachmentResult.filename
      }
    }

    const result = await openMessageViaMethod({
      method,
      customer: sendMessageModal.customer,
      subject: sendMessageModal.subject,
      body: sendMessageModal.body,
      attachment
    })

    if (!result.ok) {
      alert(result.error)
      return
    }

    if (sendMessageModal.customer?.id) {
      await createCustomerHistory(sendMessageModal.customer.id, `${sendMessageModal.historyMessage} via ${method}`)
    }

    closeSendMessageModal()
  }

  // Handle Move Date to specific date
  const handleMoveToDate = async (customer, newDate) => {
    try {
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: newDate
        })
        .eq('id', customer.id)
      
      if (error) throw error
      
      setExpandedDatePickers(prev => ({...prev, [customer.id]: false}))
      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: customer.id,
            changes: { NextClean: newDate }
          },
          'Move date saved offline.'
        )

        if (queued) {
          setExpandedDatePickers(prev => ({...prev, [customer.id]: false}))
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(customer.id)
              ? { ...row, NextClean: newDate }
              : row
          )))
          return
        }
      }

      console.error('Error moving date:', error.message)
    }
  }

  // Bulk move to specific date
  const handleBulkMoveToDate = async (newDate) => {
    const targetCustomers = selectedCustomerIds.length
      ? selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayJobs

    if (!targetCustomers.length) return
    try {
      await Promise.all(
        targetCustomers
          .filter((customer) => customer.NextClean)
          .map(async (customer) => {
            const { error } = await supabase
              .from('Customers')
              .update({ NextClean: newDate })
              .eq('id', customer.id)

            if (error) throw error
          })
      )

      setBulkDatePickerOpen(false)
      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        targetCustomers
          .filter((customer) => customer.NextClean)
          .forEach((customer) => {
            queueWorkloadCustomerMutation(
              {
                type: 'update',
                customerId: customer.id,
                changes: { NextClean: newDate }
              },
              null
            )
          })

        setCustomers((prev) => prev.map((row) => {
          const match = targetCustomers.find((customer) => Number(customer.id) === Number(row.id))
          if (!match || !match.NextClean) return row
          return { ...row, NextClean: newDate }
        }))
        setBulkDatePickerOpen(false)
        alert('Bulk date move saved offline. It will sync automatically when internet returns.')
        return
      }

      console.error('Error bulk moving dates:', error.message)
    }
  }

  // Handle Move Date (legacy - for backwards compatibility if needed)
  const handleMoveDate = async (customer, days) => {
    try {
      const currentNextClean = parseDateKeyToLocalDate(customer.NextClean)
      if (!currentNextClean) return
      const newNextClean = new Date(currentNextClean)
      newNextClean.setDate(newNextClean.getDate() + days)
      
      await handleMoveToDate(customer, toLocalDateKey(newNextClean))
    } catch (error) {
      console.error('Error moving date:', error.message)
    }
  }

  // Bulk move dates for selected customers (or all if none selected)
  const handleMoveDateBulk = async (days) => {
    const targetCustomers = selectedCustomerIds.length
      ? selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayJobs

    if (!targetCustomers.length) return
    try {
      await Promise.all(
        targetCustomers
          .filter((customer) => customer.NextClean)
          .map(async (customer) => {
            const currentNextClean = parseDateKeyToLocalDate(customer.NextClean)
            if (!currentNextClean) return
            const newNextClean = new Date(currentNextClean)
            newNextClean.setDate(newNextClean.getDate() + days)
            const nextDateValue = toLocalDateKey(newNextClean)

            const { error } = await supabase
              .from('Customers')
              .update({ NextClean: nextDateValue })
              .eq('id', customer.id)

            if (error) throw error
          })
      )

      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        targetCustomers
          .filter((customer) => customer.NextClean)
          .forEach((customer) => {
            const currentNextClean = parseDateKeyToLocalDate(customer.NextClean)
            if (!currentNextClean) return
            const newNextClean = new Date(currentNextClean)
            newNextClean.setDate(newNextClean.getDate() + days)

            queueWorkloadCustomerMutation(
              {
                type: 'update',
                customerId: customer.id,
                changes: { NextClean: toLocalDateKey(newNextClean) }
              },
              null
            )
          })

        setCustomers((prev) => prev.map((row) => {
          const source = targetCustomers.find((customer) => Number(customer.id) === Number(row.id))
          if (!source || !source.NextClean) return row
          const currentNextClean = parseDateKeyToLocalDate(source.NextClean)
          if (!currentNextClean) return row
          const nextCleanDate = new Date(currentNextClean)
          nextCleanDate.setDate(nextCleanDate.getDate() + days)
          return { ...row, NextClean: toLocalDateKey(nextCleanDate) }
        }))

        alert('Bulk move saved offline. It will sync automatically when internet returns.')
        return
      }

      console.error('Error bulk moving dates:', error.message)
    }
  }

  const handleSelectLetter = (customerId, messageId) => {
    setSelectedLetters((prev) => ({ ...prev, [customerId]: messageId }))
  }

  const handleSelectLetterAll = (messageId) => {
    setSelectedLetterAll(messageId)

    const targetCustomers = selectedCustomerIds.length
      ? selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
      : selectedDayJobs

    if (!messageId || !targetCustomers.length) return

    setSelectedLetters((prev) => {
      const updated = { ...prev }
      targetCustomers.forEach((customer) => {
        updated[customer.id] = messageId
      })
      return updated
    })
  }
  const toggleCustomerSelection = (customerId) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    )
  }

  const handleSelectByRoute = (route) => {
    // Get all customers for the selected date with the selected route
    const customersForRoute = (orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs).filter(
      customer => customer.Route === route
    )
    
    // Toggle all customers with this route
    const routeCustomerIds = customersForRoute.map(c => c.id)
    const allSelected = routeCustomerIds.every(id => selectedCustomerIds.includes(id))
    
    if (allSelected) {
      // Deselect all customers with this route
      setSelectedCustomerIds(prev => 
        prev.filter(id => !routeCustomerIds.includes(id))
      )
      setSelectedRoutes(prev => prev.filter(r => r !== route))
    } else {
      // Select all customers with this route
      setSelectedCustomerIds(prev => [...new Set([...prev, ...routeCustomerIds])])
      setSelectedRoutes(prev => [...new Set([...prev, route])])
    }
  }

  const getRouteOrderForDay = () => {
    const dayCustomers = orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs
    return [...new Set(dayCustomers.map((customer) => (customer.Route || '').trim()).filter(Boolean))]
  }

  const handleRouteDragStart = (route) => {
    setDraggedRoute(route)
    setRouteDragOver(route)
  }

  const handleRouteDragOver = (event, route) => {
    event.preventDefault()
    if (!draggedRoute) return
    if (routeDragOver !== route) setRouteDragOver(route)
  }

  const handleRouteDragEnd = () => {
    setDraggedRoute('')
    setRouteDragOver('')
  }

  const handleRouteDrop = async (targetRoute) => {
    const sourceRoute = draggedRoute
    setDraggedRoute('')
    setRouteDragOver('')

    if (!sourceRoute || !targetRoute || sourceRoute === targetRoute) return

    const dayCustomers = orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs
    if (!dayCustomers.length) return

    const routeOrder = getRouteOrderForDay()
    const sourceIndex = routeOrder.indexOf(sourceRoute)
    const targetIndex = routeOrder.indexOf(targetRoute)

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return

    const nextRouteOrder = [...routeOrder]
    nextRouteOrder.splice(sourceIndex, 1)
    nextRouteOrder.splice(targetIndex, 0, sourceRoute)

    const routeGroups = new Map()
    const noRouteCustomers = []

    dayCustomers.forEach((customer) => {
      const routeValue = (customer.Route || '').trim()
      if (!routeValue) {
        noRouteCustomers.push(customer)
        return
      }

      if (!routeGroups.has(routeValue)) {
        routeGroups.set(routeValue, [])
      }

      routeGroups.get(routeValue).push(customer)
    })

    const reorderedCustomers = nextRouteOrder.flatMap((route) => routeGroups.get(route) || [])
    reorderedCustomers.push(...noRouteCustomers)

    const hasChangedOrder = reorderedCustomers.some((customer, index) => customer.id !== dayCustomers[index]?.id)
    if (!hasChangedOrder) return

    setOrderedCustomers(reorderedCustomers)
    await saveUserRouteOrder(reorderedCustomers)
  }

  const toggleDatePicker = (customerId) => {
    setExpandedDatePickers((prev) => ({
      ...prev,
      [customerId]: !prev[customerId]
    }))
  }

  const handleDragStart = (e, customerId) => {
    setDraggedCustomerId(customerId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    setDragOverIndex(null)

    if (draggedCustomerId === null) return

    const displayListBase = orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs
    const displayList = [...displayListBase]
    const draggedIndex = displayList.findIndex(c => c.id === draggedCustomerId)

    if (draggedIndex === -1 || draggedIndex === dropIndex) {
      setDraggedCustomerId(null)
      return
    }

    // Reorder the list
    const newList = [...displayList]
    const [draggedCustomer] = newList.splice(draggedIndex, 1)
    newList.splice(dropIndex, 0, draggedCustomer)

    // Update orderedCustomers
    setOrderedCustomers(newList)
    
    // Save new order to Users.RouteOrder
    await saveUserRouteOrder(newList)

    setDraggedCustomerId(null)
  }

  const handleSmartRouteOrder = async () => {
    const displayListBase = orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs
    if (!displayListBase || displayListBase.length < 2) return

    const getRouteKey = (customer) => {
      const routeValue = (customer?.Route || '').trim()
      return routeValue ? routeValue.toLowerCase() : '__no_route__'
    }

    const groupFirstIndex = new Map()
    const originalIndexById = new Map()

    displayListBase.forEach((customer, index) => {
      const routeKey = getRouteKey(customer)
      if (!groupFirstIndex.has(routeKey)) {
        groupFirstIndex.set(routeKey, index)
      }
      originalIndexById.set(customer.id, index)
    })

    const smartOrderedList = [...displayListBase].sort((firstCustomer, secondCustomer) => {
      const firstRouteKey = getRouteKey(firstCustomer)
      const secondRouteKey = getRouteKey(secondCustomer)

      const firstGroupIndex = groupFirstIndex.get(firstRouteKey) ?? Number.MAX_SAFE_INTEGER
      const secondGroupIndex = groupFirstIndex.get(secondRouteKey) ?? Number.MAX_SAFE_INTEGER

      if (firstGroupIndex !== secondGroupIndex) {
        return firstGroupIndex - secondGroupIndex
      }

      const firstOriginalIndex = originalIndexById.get(firstCustomer.id) ?? 0
      const secondOriginalIndex = originalIndexById.get(secondCustomer.id) ?? 0
      return firstOriginalIndex - secondOriginalIndex
    })

    const hasChangedOrder = smartOrderedList.some((customer, index) => customer.id !== displayListBase[index]?.id)
    if (!hasChangedOrder) return

    setOrderedCustomers(smartOrderedList)
    await saveUserRouteOrder(smartOrderedList)
  }

  const saveUserRouteOrder = async (customerList) => {
    try {
      // Get current full route order
      const currentRouteIds = userRouteOrder.split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id))

      // Get IDs from the reordered list (customers on this day)
      const reorderedIds = customerList.map(c => c.id)
      
      // Remove the reordered customer IDs from the current route
      const otherCustomerIds = currentRouteIds.filter(id => !reorderedIds.includes(id))
      
      // Insert the reordered customers at the position of the first one in the original order
      const firstReorderedId = reorderedIds[0]
      const insertIndex = currentRouteIds.indexOf(firstReorderedId)
      
      let newRouteIds
      if (insertIndex === -1) {
        // If not found, append at the end
        newRouteIds = [...otherCustomerIds, ...reorderedIds]
      } else {
        // Insert at the original position
        newRouteIds = [
          ...otherCustomerIds.slice(0, insertIndex),
          ...reorderedIds,
          ...otherCustomerIds.slice(insertIndex)
        ]
      }

      const newRouteOrderStr = newRouteIds.join(',')

      // Update Users table RouteOrder field
      const { error } = await supabase
        .from('Users')
        .update({ RouteOrder: newRouteOrderStr })
        .eq('id', user.id)
      
      if (error) throw error
      
      setUserRouteOrder(newRouteOrderStr)
    } catch (error) {
      console.error('Error saving route order:', error.message)
      alert('Error saving route order: ' + error.message)
    }
  }

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    // If UK local (starts with 0 and length 11), convert to +44
    if (digits.length === 11 && digits.startsWith('0')) {
      return `44${digits.slice(1)}`
    }
    // If already starts with country code, use as-is
    return digits
  }

  const getFormalCustomerName = (rawName) => {
    const name = (rawName || '').trim()
    if (!name) return 'Customer'

    const connectorMatch = name.match(/^(\S+)\s*(&|and)\s+(\S+)/i)
    if (connectorMatch) {
      const [, first, connector, second] = connectorMatch
      return `${first} ${connector.trim()} ${second}`
    }

    const firstToken = name.split(/\s+/)[0]
    return firstToken || 'Customer'
  }

  // Modal helper functions
  async function fetchCustomerServices(customerId) {
    try {
      const { data, error } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customerId)
      
      if (error) throw error
      setCustomerServices(data || [])
    } catch (error) {
      console.error('Error fetching customer services:', error.message)
    }
  }

  async function fetchCustomerHistory(customerId) {
    try {
      const { data, error } = await supabase
        .from('CustomerHistory')
        .select('*')
        .eq('CustomerID', customerId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setCustomerHistory(data || [])
    } catch (error) {
      console.error('Error fetching customer history:', error.message)
    }
  }

  async function fetchCustomerInvoices(customerId) {
    try {
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('CustomerInvoices')
        .select('*')
        .eq('CustomerID', customerId)
        .order('InvoiceDate', { ascending: false })

      if (invoicesError) throw invoicesError

      const invoicesList = invoicesData || []
      if (invoicesList.length === 0) {
        setCustomerInvoices([])
        return
      }

      const invoiceIds = invoicesList.map((inv) => inv.id)
      const { data: invoiceItems, error: itemsError } = await supabase
        .from('CustomerInvoiceJobs')
        .select('InvoiceID, Price')
        .in('InvoiceID', invoiceIds)

      if (itemsError) throw itemsError

      const totalsByInvoiceId = (invoiceItems || []).reduce((acc, row) => {
        const key = row.InvoiceID
        acc[key] = (acc[key] || 0) + (parseFloat(row.Price) || 0)
        return acc
      }, {})

      const overviewRows = invoicesList.map((inv) => ({
        ...inv,
        totalAmount: totalsByInvoiceId[inv.id] || 0
      }))

      setCustomerInvoices(overviewRows)
    } catch (error) {
      console.error('Error fetching customer invoices:', error.message)
      alert('Failed to load invoices for this customer.')
    }
  }

  async function fetchInvoiceItems(invoiceId) {
    const { data, error } = await supabase
      .from('CustomerInvoiceJobs')
      .select('*')
      .eq('InvoiceID', invoiceId)
      .order('id', { ascending: true })

    if (error) throw error
    return data || []
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const buildCustomerInvoicePdfBlob = (invoiceRecord, invoiceItems) => {
    const jsPDF = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null
    if (!jsPDF) {
      throw new Error('PDF generation library not loaded')
    }

    const doc = new jsPDF()
    const lineHeight = 8
    let y = 15
    const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol
    const addressLines = [selectedCustomer?.Address, selectedCustomer?.Address2, selectedCustomer?.Address3, selectedCustomer?.Postcode].filter(Boolean)

    if (user.CompanyName) {
      doc.setFontSize(18)
      const pageWidth = doc.internal.pageSize.getWidth()
      const companyNameWidth = doc.getTextWidth(user.CompanyName)
      const centerX = (pageWidth - companyNameWidth) / 2
      doc.text(user.CompanyName, centerX, y)
      y += lineHeight + 4
    }

    doc.setFontSize(14)
    doc.text(selectedCustomer?.CustomerName || 'Customer', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    addressLines.forEach((line) => {
      doc.text(line, 15, y)
      y += lineHeight
    })

    y += 4
    doc.text(`Invoice Number: ${invoiceRecord.InvoiceID}`, 15, y)
    y += lineHeight
    doc.text(`Invoice Date: ${formatDateByCountry(invoiceRecord.InvoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight + 4

    doc.setFontSize(14)
    doc.text('For the following Services:', 15, y)
    y += lineHeight
    doc.setFontSize(12)

    let maxServiceWidth = doc.getTextWidth('Total Amount:')
    invoiceItems.forEach((item) => {
      const width = doc.getTextWidth(item.Service || '')
      if (width > maxServiceWidth) maxServiceWidth = width
    })

    const leftX = 15
    const rightX = leftX + maxServiceWidth + 10
    let total = 0
    invoiceItems.forEach((item) => {
      const price = parseFloat(item.Price) || 0
      total += price
      doc.text(item.Service || 'Service', leftX, y)
      doc.text(`${currencySymbol}${price.toFixed(2)}`, rightX, y)
      y += lineHeight
    })

    y += 4
    doc.setFontSize(14)
    doc.text('Total Amount:', leftX, y)
    doc.text(`${currencySymbol}${total.toFixed(2)}`, rightX, y)

    if (user.InvoiceFooter) {
      y += lineHeight + 4
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      const footerLines = doc.splitTextToSize(user.InvoiceFooter, 170)
      doc.text(footerLines, 15, y)
      doc.setTextColor(0, 0, 0)
    }

    return doc.output('blob')
  }

  async function handleDownloadCustomerInvoice(invoiceRecord) {
    try {
      const invoiceItems = await fetchInvoiceItems(invoiceRecord.id)
      const blob = buildCustomerInvoicePdfBlob(invoiceRecord, invoiceItems)
      downloadBlob(blob, `Invoice-${invoiceRecord.InvoiceID}.pdf`)
    } catch (error) {
      console.error('Error downloading invoice:', error.message)
      alert('Failed to download invoice.')
    }
  }

  async function handleViewCustomerInvoice(invoiceRecord) {
    try {
      const invoiceItems = await fetchInvoiceItems(invoiceRecord.id)
      setInvoiceDetailsModal({ show: true, invoice: invoiceRecord, items: invoiceItems })
    } catch (error) {
      console.error('Error loading invoice details:', error.message)
      alert('Failed to load invoice details.')
    }
  }

  async function handleModalSave() {
    const updatePayload = {
      CustomerName: modalEditData.CustomerName,
      Address: modalEditData.Address,
      Address2: modalEditData.Address2,
      Address3: modalEditData.Address3,
      Postcode: modalEditData.Postcode,
      PhoneNumber: modalEditData.PhoneNumber,
      EmailAddress: modalEditData.EmailAddress,
      PrefferedContact: modalEditData.PrefferedContact || null,
      Price: modalEditData.Price,
      Weeks: modalEditData.Weeks,
      NextClean: modalEditData.NextClean,
      Outstanding: modalEditData.Outstanding,
      Route: modalEditData.Route,
      VAT: modalEditData.VAT,
      PrefferedDays: formatPreferredDays(preferredDaysSelected),
      Notes: modalEditData.Notes
    }

    try {
      const { error } = await supabase
        .from('Customers')
        .update(updatePayload)
        .eq('id', selectedCustomer.id)
      
      if (error) throw error
      
      // Update the selectedCustomer immediately to show changes
      setSelectedCustomer({...modalEditData, PrefferedDays: formatPreferredDays(preferredDaysSelected)})
      
      // Update orderedCustomers to reflect changes in the calendar
      setOrderedCustomers(prev => 
        prev.map(c => c.id === selectedCustomer.id ? modalEditData : c)
      )
      
      setIsEditingModal(false)
      fetchCustomers() // Refresh the customer list
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: selectedCustomer.id,
            changes: updatePayload
          },
          'Customer changes saved offline.'
        )

        if (queued) {
          setSelectedCustomer({ ...modalEditData, PrefferedDays: formatPreferredDays(preferredDaysSelected) })
          setOrderedCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(selectedCustomer.id)
              ? { ...row, ...updatePayload }
              : row
          )))
          setIsEditingModal(false)
          return
        }
      }

      console.error('Error updating customer:', error.message)
      alert('Failed to update customer. Please try again.')
    }
  }

  async function handleAddService() {
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .insert({
          CustomerID: selectedCustomer.id,
          Service: newServiceData.Service,
          Price: parseFloat(newServiceData.Price) || 0,
          Description: newServiceData.Description
        })
      
      if (error) throw error
      
      setIsAddingService(false)
      setNewServiceData({ Service: '', Price: '', Description: '' })
      fetchCustomerServices(selectedCustomer.id) // Refresh the services list
    } catch (error) {
      console.error('Error adding service:', error.message)
      alert('Failed to add service. Please try again.')
    }
  }

  async function handleEditService(serviceId) {
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .update({
          Service: editServiceData.Service,
          Price: parseFloat(editServiceData.Price) || 0,
          Description: editServiceData.Description
        })
        .eq('id', serviceId)
      
      if (error) throw error
      
      setEditingServiceId(null)
      setEditServiceData({})
      fetchCustomerServices(selectedCustomer.id)
    } catch (error) {
      console.error('Error updating service:', error.message)
      alert('Failed to update service. Please try again.')
    }
  }

  async function handleDeleteService(serviceId) {
    if (!confirm('Are you sure you want to delete this service?')) return
    
    try {
      const { error } = await supabase
        .from('CustomerPrices')
        .delete()
        .eq('id', serviceId)
      
      if (error) throw error
      
      fetchCustomerServices(selectedCustomer.id)
    } catch (error) {
      console.error('Error deleting service:', error.message)
      alert('Failed to delete service. Please try again.')
    }
  }

  async function handleAddToNextClean(service) {
    try {
      // Get current customer data
      const { data: customer, error: fetchError } = await supabase
        .from('Customers')
        .select('NextServices, Price')
        .eq('id', selectedCustomer.id)
        .single()
      
      if (fetchError) throw fetchError
      
      // Check if service is already in NextServices
      const currentServices = customer.NextServices ? customer.NextServices.split(',').map(s => s.trim()) : []
      if (currentServices.includes(service.Service)) {
        alert('Service already added')
        return
      }
      
      // Add service to NextServices (comma-separated)
      currentServices.push(service.Service)
      const newNextServices = currentServices.join(', ')
      
      // Add price to existing price
      const newPrice = (customer.Price || 0) + service.Price
      
      // Update customer
      const { error: updateError } = await supabase
        .from('Customers')
        .update({
          NextServices: newNextServices,
          Price: newPrice
        })
        .eq('id', selectedCustomer.id)
      
      if (updateError) throw updateError
      
      alert(`${service.Service} added to next clean!`)
      fetchCustomers() // Refresh customer list
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: selectedCustomer.id,
            changes: {
              NextServices: `${(selectedCustomer?.NextServices || '').trim() ? `${selectedCustomer.NextServices}, ` : ''}${service.Service}`,
              Price: (parseFloat(selectedCustomer?.Price) || 0) + (parseFloat(service.Price) || 0)
            }
          },
          'Service update saved offline.'
        )

        if (queued) return
      }

      console.error('Error adding to next clean:', error.message)
      alert('Failed to add to next clean. Please try again.')
    }
  }

  async function handleCancelService(reason) {
    if (!selectedCustomer) return

    try {
      // Clear NextClean field
      const { error: updateError } = await supabase
        .from('Customers')
        .update({ NextClean: null })
        .eq('id', selectedCustomer.id)
      
      if (updateError) throw updateError
      
      // Add to CustomerHistory
      let historyMessage = 'Cancelled Service'
      if (reason && reason.trim()) {
        historyMessage += ` - ${reason.trim()}`
      }
      
      const { error: historyError } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: selectedCustomer.id,
          Message: historyMessage
        })
      
      if (historyError) throw historyError
      
      // Close modal and refresh
      setCancelServiceModal({ show: false, reason: '' })
      setShowCustomerModal(false)
      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: selectedCustomer.id,
            changes: { NextClean: null }
          },
          'Cancel service saved offline.'
        )

        if (queued) {
          setCancelServiceModal({ show: false, reason: '' })
          setShowCustomerModal(false)
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(selectedCustomer.id)
              ? { ...row, NextClean: null }
              : row
          )))
          return
        }
      }

      console.error('Error cancelling service:', error.message)
      alert('Error cancelling service: ' + error.message)
    }
  }

  // Handle Skip Clean
  const handleSkipClean = async (customer) => {
    const confirmed = confirm(`Skip clean for ${customer.CompanyName || 'this customer'}?`)
    if (!confirmed) return

    try {
      const weeksToAdd = parseInt(user.RouteWeeks) || 1
      const currentCleanDate = parseDateKeyToLocalDate(customer.NextClean)
      if (!currentCleanDate) return
      const nextCleanDate = new Date(currentCleanDate)
      nextCleanDate.setDate(nextCleanDate.getDate() + (weeksToAdd * 7))
      const nextDateValue = toLocalDateKey(nextCleanDate)
      
      // Create history record with employee name if applicable
      const isTeamMember = Boolean(user?.ParentUserId)
      const shouldIncludeEmployee = isTeamMember && messageFooterIncludeEmployee
      const employeeNameSuffix = shouldIncludeEmployee ? ` from ${user?.UserName || 'Employee'}` : ''
      const historyMessage = `Skipped this clean${employeeNameSuffix}`
      
      await createCustomerHistory(customer.id, historyMessage)
      
      // Update customer with new NextClean date
      const { error } = await supabase
        .from('Customers')
        .update({ NextClean: nextDateValue })
        .eq('id', customer.id)
      
      if (error) throw error
      
      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const currentCleanDate = parseDateKeyToLocalDate(customer.NextClean)
        if (currentCleanDate) {
          const nextCleanDate = new Date(currentCleanDate)
          nextCleanDate.setDate(nextCleanDate.getDate() + ((parseInt(user.RouteWeeks) || 1) * 7))
          const nextDateValue = toLocalDateKey(nextCleanDate)
          const queued = queueWorkloadCustomerMutation(
            {
              type: 'update',
              customerId: customer.id,
              changes: { NextClean: nextDateValue }
            },
            'Skip clean saved offline.'
          )

          if (queued) {
            setCustomers((prev) => prev.map((row) => (
              Number(row.id) === Number(customer.id)
                ? { ...row, NextClean: nextDateValue }
                : row
            )))
            return
          }
        }
      }

      console.error('Error skipping clean:', error.message)
      alert('Error skipping clean: ' + error.message)
    }
  }

  async function handleBookJob(customer) {
    // Fetch customer services first
    try {
      const { data: services, error } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customer.id)
      
      if (error) throw error
      
      if (!services || services.length === 0) {
        alert('You need to add at least 1 service')
        // Open the customer modal and navigate to services tab
        setSelectedCustomer(customer)
        setShowCustomerModal(true)
        setShowServices(true)
        setShowHistory(false)
        return
      }
      
      // Show date and service picker modal
      setBookJobModal({ show: true, customer, selectedDate: '', services: services || [], selectedServices: [] })
    } catch (error) {
      console.error('Error checking services:', error.message)
      alert('Error checking services: ' + error.message)
    }
  }

  async function handleBookJobSave() {
    if (!bookJobModal.customer || !bookJobModal.selectedDate || bookJobModal.selectedServices.length === 0) {
      alert('Please select a date and at least one service')
      return
    }
    
    try {
      const selectedServiceObjects = bookJobModal.services.filter(s => bookJobModal.selectedServices.includes(s.id))
      const totalPrice = selectedServiceObjects.reduce((sum, s) => sum + (parseFloat(s.Price) || 0), 0)
      const serviceNames = selectedServiceObjects.map(s => s.Service).join(', ')
      
      const { error } = await supabase
        .from('Customers')
        .update({ 
          NextClean: bookJobModal.selectedDate,
          Price: totalPrice,
          NextServices: serviceNames,
          Quote: false 
        })
        .eq('id', bookJobModal.customer.id)
      
      if (error) throw error
      
      // Create history record
      const { error: historyError } = await supabase
        .from('CustomerHistory')
        .insert({
          CustomerID: bookJobModal.customer.id,
          Message: 'Quote converted to job, scheduled for ' + formatDateByCountry(bookJobModal.selectedDate, user.SettingsCountry || 'United Kingdom') + ', Services: ' + serviceNames
        })
      
      if (historyError) throw historyError

      if (quoteTurnedIntoJobLetter) {
        const convertedMessage = messages.find((m) => String(m.id) === String(quoteTurnedIntoJobLetter))
        if (convertedMessage) {
          const convertedCustomer = {
            ...bookJobModal.customer,
            Outstanding: totalPrice,
            Price: totalPrice
          }
          openSendMethodModal({
            customer: convertedCustomer,
            subject: convertedMessage.MessageTitle,
            body: buildPaymentMessageBody(convertedCustomer, convertedMessage),
            historyMessage: `Message ${convertedMessage.MessageTitle} sent`
          })
        }
      }
      
      setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })
      setShowCustomerModal(false)
      fetchCustomers()
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const selectedServiceObjects = bookJobModal.services.filter((s) => bookJobModal.selectedServices.includes(s.id))
        const totalPrice = selectedServiceObjects.reduce((sum, s) => sum + (parseFloat(s.Price) || 0), 0)
        const serviceNames = selectedServiceObjects.map((s) => s.Service).join(', ')

        const queued = queueWorkloadCustomerMutation(
          {
            type: 'update',
            customerId: bookJobModal.customer.id,
            changes: {
              NextClean: bookJobModal.selectedDate,
              Price: totalPrice,
              NextServices: serviceNames,
              Quote: false
            }
          },
          'Booked job saved offline.'
        )

        if (queued) {
          setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })
          setShowCustomerModal(false)
          setCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(bookJobModal.customer.id)
              ? { ...row, NextClean: bookJobModal.selectedDate, Price: totalPrice, NextServices: serviceNames, Quote: false }
              : row
          )))
          return
        }
      }

      console.error('Error booking job:', error.message)
      alert('Error booking job: ' + error.message)
    }
  }

  const handleSendWhatsApp = (customer) => {
    if (!messages.length) {
      alert('No letters available. Please create a letter first.')
      return
    }

    const selectedId = selectedLetters[customer.id] ?? messages[0]?.id
    let letter = messages.find((m) => String(m.id) === String(selectedId))
    if (!letter && messages.length) letter = messages[0]

    openSendMethodModal({
      customer,
      subject: letter?.MessageTitle || 'Message',
      body: buildPaymentMessageBody(customer, letter),
      historyMessage: `Message ${letter?.MessageTitle || 'template'} sent`
    })
  }

  // Generate calendar days
  const generateCalendar = () => {
    if (calendarView === 'Weekly') {
      return generateWeeklyCalendar()
    }
    
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDayOfWeek = getFirstDayOfWeek(currentDate)
    const days = []

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>)
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      const dayDateKey = toLocalDateKey(dayDate)
      const hasJobs = hasJobsOnDate(day)
      const hasQuotes = hasQuotesOnDate(day)
      const hasAnyWork = hasJobs || hasQuotes
      const isSelected = normalizeDateKey(selectedDate) === dayDateKey
      const personalItemsForDay = getPersonalItemsForDate(day)
      
      days.push(
        <div
          key={day}
          className={`calendar-day ${hasAnyWork ? 'has-work' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDayClick(dayDate)}
        >
          <div className="day-number">{day}</div>
          {isAdmin && personalItemsForDay.length > 0 && (
            <div className="personal-headers-list">
              {personalItemsForDay.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className="personal-header-chip"
                  title={item.Description || item.Item}
                >
                  {item.Item}
                </div>
              ))}
              {personalItemsForDay.length > 2 && (
                <div className="personal-header-more">+{personalItemsForDay.length - 2} more</div>
              )}
            </div>
          )}
          {(hasJobs || hasQuotes) && (
            <div className="day-indicators">
              {hasJobs && <div className="work-indicator"></div>}
              {hasQuotes && <div className="quote-indicator"></div>}
            </div>
          )}
        </div>
      )
    }

    return days
  }

  const generateWeeklyCalendar = () => {
    const weekStart = getWeekStart(currentDate)
    const days = []
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    
    // Calculate max earnings for the week to scale bars
    let maxEarnings = 0
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      const dayJobs = getJobsForDate(day)
      const dailyEarnings = dayJobs.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)
      if (dailyEarnings > maxEarnings) maxEarnings = dailyEarnings
    }

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      const dayOfMonth = day.getDate()
      const dayDateKey = toLocalDateKey(day)
      const isSelected = normalizeDateKey(selectedDate) === dayDateKey
      const personalItemsForDay = getPersonalItemsForDate(day)
      
      // Get weather data for this day
      const dateStr = toLocalDateKey(day)
      const weatherInfo = weeklyWeather[dateStr]
      
      // Calculate daily earnings - pass full date object
      const dayJobs = getJobsForDate(day)
      const dailyEarnings = dayJobs.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)
      const currencyConfig = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
      const formattedEarnings = formatCurrency(dailyEarnings, user.SettingsCountry || 'United Kingdom')
      
      // Calculate bar height percentage (max 80% of container)
      const barHeightPercent = maxEarnings > 0 ? (dailyEarnings / maxEarnings) * 80 : 0
      
      days.push(
        <div
          key={i}
          className={`calendar-day weekly-day ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDayClick(day)}
          title={weatherInfo ? `${weatherInfo.icon} ${weatherInfo.temp_max}°C` : ''}
        >
          <div className="weather-icon" title={weatherInfo ? `${weatherInfo.temp_max}°C` : ''}>
            {weatherInfo && weatherInfo.icon}
          </div>
          <div className="day-label">{dayNames[i]}</div>
          <div className="day-number">{dayOfMonth}</div>
          {isAdmin && personalItemsForDay.length > 0 && (
            <div className="personal-headers-list weekly-personal-headers">
              {personalItemsForDay.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className="personal-header-chip"
                  title={item.Description || item.Item}
                >
                  {item.Item}
                </div>
              ))}
              {personalItemsForDay.length > 2 && (
                <div className="personal-header-more">+{personalItemsForDay.length - 2} more</div>
              )}
            </div>
          )}
          <div className="weekly-bar-container">
            <div 
              className="weekly-bar" 
              style={{ height: `${barHeightPercent}%` }}
            ></div>
          </div>
          <div className="day-earnings">{formattedEarnings}</div>
        </div>
      )
    }

    return days
  }

  const getWeeklyChartData = () => {
    const weekStart = getWeekStart(currentDate)
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const chartData = []

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      const dayOfMonth = day.getDate()
      
      // Pass full date object to get correct jobs
      const dayJobs = getJobsForDate(day)
      const dailyEarnings = dayJobs.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)
      
      chartData.push({
        day: dayNames[i],
        date: dayOfMonth,
        earnings: dailyEarnings
      })
    }

    return chartData
  }

  const getWeeklyTotalIncome = () => {
    const chartData = getWeeklyChartData()
    return chartData.reduce((sum, day) => sum + day.earnings, 0)
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const formatLongDateWithOrdinal = (dateObj) => {
    if (!(dateObj instanceof Date)) return ''
    const day = dateObj.getDate()
    const month = monthNames[dateObj.getMonth()]
    const year = dateObj.getFullYear()

    const teen = day % 100
    let suffix = 'th'
    if (teen < 11 || teen > 13) {
      if (day % 10 === 1) suffix = 'st'
      else if (day % 10 === 2) suffix = 'nd'
      else if (day % 10 === 3) suffix = 'rd'
    }

    return `${day}${suffix} ${month} ${year}`
  }

  if (loading) return <div className="loading">Loading workload...</div>

  const selectedDateObject = parseDateKeyToLocalDate(selectedDate) || null
  const selectedDayJobs = selectedDate ? getJobsForDate(selectedDate) : []
  const selectedDayQuotes = selectedDate ? getQuotesForDate(selectedDate) : []
  const selectedDayPersonalItems = selectedDate ? getPersonalItemsForDate(selectedDate) : []
  const displayedDayJobs = orderedCustomers.length > 0 ? orderedCustomers : selectedDayJobs
  const routeOrderForSelectedDay = [...new Set(displayedDayJobs.map((customer) => (customer.Route || '').trim()).filter(Boolean))]
  const selectedCustomersForDay = selectedDayJobs.filter((customer) => selectedCustomerIds.includes(customer.id))
  const hasSelectedCustomers = selectedCustomersForDay.length > 0
  const totalIncome = selectedDayJobs.reduce((sum, customer) => sum + (parseFloat(customer.Price) || 0), 0)
  const showWorkloadMenu = selectedDayJobs.length > 0 || isAdmin

  // Route color helper
  const routeColors = [
    '#3498db', '#27ae60', '#9b59b6', '#e67e22', '#e74c3c', '#16a085', '#8e44ad', '#f1c40f'
  ]

  const getRouteStyle = (route) => {
    if (!route) return { backgroundColor: '#bdc3c7', color: '#2c3e50' }
    const index = Math.abs(route.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % routeColors.length
    return { backgroundColor: routeColors[index], color: 'white' }
  }

  // Generate overview calendar with inline customer lists
  const generateOverviewCalendar = () => {
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDayOfWeek = getFirstDayOfWeek(currentDate)
    const days = []

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="overview-day empty"></div>)
    }

    // Add days of the month with customer lists
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCustomers = getOrderedCustomersForDate(day)
      const isExpanded = expandedDays[day]
      const displayCustomers = isExpanded ? dayCustomers : dayCustomers.slice(0, 10)
      const hasMore = dayCustomers.length > 10

      days.push(
        <div key={day} className="overview-day">
          <div className="overview-day-number">{day}</div>
          {dayCustomers.length > 0 && (
            <div className="overview-customer-list">
              {displayCustomers.map((customer) => (
                <div key={customer.id} className="overview-customer-item">
                  <div className="overview-customer-address">{getFullAddress(customer)}</div>
                  <div className="overview-customer-meta">
                    {formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}{getAdditionalServices(customer)} • <span className="overview-route-pill" style={getRouteStyle(customer.Route)}>{customer.Route || 'N/A'}</span>
                  </div>
                </div>
              ))}
              {hasMore && !isExpanded && (
                <button
                  className="show-all-btn"
                  onClick={() => setExpandedDays(prev => ({ ...prev, [day]: true }))}
                >
                  Show all ({dayCustomers.length})
                </button>
              )}
            </div>
          )}
        </div>
      )
    }

    return days
  }

  return (
    <div className={`workload-manager ${calendarCollapsed ? 'calendar-collapsed' : ''}`}>
      {offlineCacheInfo.usingCache && (
        <div className="offline-cache-banner">
          Offline mode: showing previously downloaded workload data from {formatCacheTimestamp(offlineCacheInfo.savedAt)}.
        </div>
      )}

      <div className="calendar-header">
        <button onClick={previousMonth} className="month-nav-btn">←</button>
        <h2>
          {calendarView === 'Weekly' 
            ? `W/C ${getWeekStart(currentDate).getDate()} ${monthNames[getWeekStart(currentDate).getMonth()]}`
            : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
          }
        </h2>
        <button onClick={nextMonth} className="month-nav-btn">→</button>
      </div>

      {!calendarCollapsed && (
        <div className="calendar-view-buttons">
          <button 
            className={`view-btn monthly-btn ${calendarView === 'Monthly' ? 'active' : ''}`}
            onClick={() => updateCalendarViewMode('Monthly')}
          >
            Monthly
          </button>
          <button 
            className={`view-btn weekly-btn ${calendarView === 'Weekly' ? 'active' : ''}`}
            onClick={() => updateCalendarViewMode('Weekly')}
          >
            Weekly
          </button>
        </div>
      )}

      {!calendarCollapsed && calendarView === 'Weekly' && (
        <div className="weekly-total-income">
          Total Income: <span className="income-amount">{formatCurrency(getWeeklyTotalIncome(), user.SettingsCountry || 'United Kingdom')}</span>
        </div>
      )}

      {!calendarCollapsed && <div className={`calendar-grid ${calendarView === 'Weekly' ? 'weekly-view' : ''}`}>
            {calendarView !== 'Weekly' && (
              <>
                <div className="calendar-day-header">Sun</div>
                <div className="calendar-day-header">Mon</div>
                <div className="calendar-day-header">Tue</div>
                <div className="calendar-day-header">Wed</div>
                <div className="calendar-day-header">Thu</div>
                <div className="calendar-day-header">Fri</div>
                <div className="calendar-day-header">Sat</div>
              </>
            )}
            {generateCalendar()}
          </div>}

          <div className="collapse-btn-row">
            <button onClick={() => {
              const newState = !calendarCollapsed
              setCalendarCollapsed(newState)
              updateCalendarPosition(newState ? 'Up' : 'Down')
            }} className="collapse-btn">
              {calendarCollapsed ? '▼' : '▲'}
            </button>
          </div>

          {selectedDate && (
            <div className="selected-day-customers">
          {selectedDayQuotes.length > 0 && (
            <div className="quotes-list-card">
              <h4>Quotes for this day ({selectedDayQuotes.length})</h4>
              <div className="quotes-list">
                {selectedDayQuotes.map((q) => (
                  <div key={q.id} className="quote-item-with-button">
                    <div
                      className="quote-item"
                      onClick={() => {
                        setSelectedCustomer(q)
                        setShowCustomerModal(true)
                      }}
                    >
                      <div className="quote-name">{q.CustomerName}</div>
                      <div className="quote-address">{getFullAddress(q)}</div>
                    </div>
                    <button 
                      className="quote-book-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBookJob(q)
                      }}
                    >
                      Book Job
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showWorkloadMenu && (
            <>
              <button 
                className={`mobile-menu-btn workload-mobile-menu-btn ${mobileMenuOpen ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                title="Toggle menu"
              >
                Menu
              </button>
              
              {mobileMenuOpen && (
                <div className="mobile-menu-content workload-mobile-menu-panel active">
                  {selectedDayJobs.length > 0 && (
                    <>
                      <div className="select-by-route-section">
                        <label className="select-by-route-label">Select / Move by Route:</label>
                        <div className="route-buttons">
                          {routeOrderForSelectedDay.map((route) => (
                            <button
                              key={route}
                              className={`route-button ${selectedRoutes.includes(route) ? 'active' : ''} ${draggedRoute === route ? 'route-dragging' : ''} ${routeDragOver === route ? 'route-drag-over' : ''}`}
                              onClick={() => handleSelectByRoute(route)}
                              draggable
                              onDragStart={() => handleRouteDragStart(route)}
                              onDragOver={(event) => handleRouteDragOver(event, route)}
                              onDrop={() => handleRouteDrop(route)}
                              onDragEnd={handleRouteDragEnd}
                              title="Tap to select by route. Drag to move this route group."
                            >
                              {route}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="personal-item-action-row">
                        <button className="personal-item-btn" onClick={handleSmartRouteOrder}>
                          Smart Route Order
                        </button>
                      </div>

                      <div className="message-all-section">
                        <div className="message-all-container">
                          <label className="message-all-label" htmlFor="messageAll">Message to {hasSelectedCustomers ? 'Selected' : 'All'}:</label>
                          <select
                            id="messageAll"
                            value={selectedLetterAll || ''}
                            onChange={(e) => handleSelectLetterAll(e.target.value)}
                            disabled={!messages.length}
                          >
                            {!messages.length && <option value="">No letters available</option>}
                            {messages.length > 0 && <option value="">Select letter</option>}
                            {messages.map((msg) => (
                              <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="bulk-move-container">
                          <span className="bulk-move-label">Move {hasSelectedCustomers ? 'selected' : 'all'} jobs:</span>
                          <div className="bulk-date-picker-wrapper">
                            <button 
                              onClick={() => setBulkDatePickerOpen(!bulkDatePickerOpen)}
                              className="calendar-icon-btn"
                              title="Pick a date"
                            >
                              📅
                            </button>
                            {bulkDatePickerOpen && (
                              <input
                                type="date"
                                value={selectedDate ? normalizeDateKey(selectedDate) : toLocalDateKey(currentDate)}
                                onChange={(e) => handleBulkMoveToDate(e.target.value)}
                                className="date-picker-input"
                                autoFocus
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {isAdmin && (
                    <div className="personal-item-action-row">
                      <button className="personal-item-btn" onClick={openPersonalItemModal}>
                        + Personal Item
                      </button>
                      <button className="personal-item-btn" onClick={openPersonalImportModal}>
                        Import File
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="desktop-only-sections">
                {selectedDayJobs.length > 0 && (
                  <>
                    <div className="select-by-route-section">
                      <label className="select-by-route-label">Select / Move by Route:</label>
                      <div className="route-buttons">
                        {routeOrderForSelectedDay.map((route) => (
                          <button
                            key={route}
                            className={`route-button ${selectedRoutes.includes(route) ? 'active' : ''} ${draggedRoute === route ? 'route-dragging' : ''} ${routeDragOver === route ? 'route-drag-over' : ''}`}
                            onClick={() => handleSelectByRoute(route)}
                            draggable
                            onDragStart={() => handleRouteDragStart(route)}
                            onDragOver={(event) => handleRouteDragOver(event, route)}
                            onDrop={() => handleRouteDrop(route)}
                            onDragEnd={handleRouteDragEnd}
                            title="Click to select by route. Drag to move this route group."
                          >
                            {route}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="message-all-section">
                      <div className="message-all-container">
                        <label className="message-all-label" htmlFor="messageAll">Message to {hasSelectedCustomers ? 'Selected' : 'All'}:</label>
                        <select
                          id="messageAll"
                          value={selectedLetterAll || ''}
                          onChange={(e) => handleSelectLetterAll(e.target.value)}
                          disabled={!messages.length}
                        >
                          {!messages.length && <option value="">No letters available</option>}
                          {messages.length > 0 && <option value="">Select letter</option>}
                          {messages.map((msg) => (
                            <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="bulk-move-container">
                        <span className="bulk-move-label">Move {hasSelectedCustomers ? 'selected' : 'all'} jobs:</span>
                        <div className="bulk-date-picker-wrapper">
                          <button 
                            onClick={() => setBulkDatePickerOpen(!bulkDatePickerOpen)}
                            className="calendar-icon-btn"
                            title="Pick a date"
                          >
                            📅
                          </button>
                          {bulkDatePickerOpen && (
                            <input
                              type="date"
                              value={selectedDate ? normalizeDateKey(selectedDate) : toLocalDateKey(currentDate)}
                              onChange={(e) => handleBulkMoveToDate(e.target.value)}
                              className="date-picker-input"
                              autoFocus
                            />
                          )}
                        </div>
                      </div>

                      <div className="smart-route-container">
                        <button className="bulk-move-btn" onClick={handleSmartRouteOrder}>
                          Smart Route Order
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {isAdmin && (
                  <div className="personal-item-action-row">
                    <button className="personal-item-btn" onClick={openPersonalItemModal}>
                      + Personal Item
                    </button>
                    <button className="personal-item-btn" onClick={openPersonalImportModal}>
                      Import File
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {isAdmin && selectedDayPersonalItems.length > 0 && (
            <div className="personal-day-strip">
              <h4>Personal Calender</h4>
              <div className="personal-day-strip-items">
                {selectedDayPersonalItems.map((item) => (
                  <div key={item.id} className="personal-day-strip-item" title={item.Description || item.Item}>
                    <span className="personal-day-strip-text">{item.Item}</span>
                    <button
                      className="personal-day-delete-btn"
                      onClick={() => handleDeletePersonalItem(item.id)}
                      title="Delete personal item"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <h3>
            Jobs for {formatLongDateWithOrdinal(selectedDateObject || currentDate)}
          </h3>
          <p className="income-total">Income: {formatCurrency(totalIncome, user.SettingsCountry || 'United Kingdom')}</p>

          {selectedDayJobs.length === 0 ? (
            <p className="empty-state">No jobs scheduled for this day.</p>
          ) : (
            <div className="customer-list">
              {groupCustomersByAssignee(displayedDayJobs).map((group) => (
                <div key={group.assigneeId || 'unassigned'} className="assignee-group">
                  {hasEmployees && (
                    <div className="assignee-group-header">
                      <h4>{group.assigneeName}</h4>
                      <p className="group-income">
                        {group.assigneeName} Income: {formatCurrency(getGroupTotalIncome(group.customers), user.SettingsCountry || 'United Kingdom')}
                      </p>
                    </div>
                  )}
                  <div className="assignee-group-items">
                    {group.customers.map((customer, index) => {
                      const isSelected = selectedCustomerIds.includes(customer.id)

                      return (
                        <div
                          key={customer.id}
                          className={`customer-row-item ${hasEmployees ? 'with-assignee' : ''} ${draggedCustomerId === customer.id ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, customer.id)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                        >
                          <div className="customer-grid-col drag-col">
                            <div className="drag-handle">⋮⋮</div>
                          </div>

                    <div className="customer-grid-col checkbox-col">
                      <label
                        className="customer-select"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCustomerSelection(customer.id)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                      </label>
                    </div>

                    {hasEmployees && (
                      <div className="customer-grid-col assigned-to-col">
                        <select
                          value={customer.AssignedUserId || ''}
                          onChange={(e) => handleAssignUserChange(customer.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="assigned-dropdown"
                        >
                          <option value="">Unassigned</option>
                          <option value={ownerUserId || ''}>{currentAccountLabel}</option>
                          {teamMembers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.UserName || member.email_address || `User ${member.id}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="customer-grid-col outstanding-col">
                      {customer.Outstanding > 0 && (
                        <span className="outstanding">{formatCurrency(customer.Outstanding, user.SettingsCountry || 'United Kingdom')}</span>
                      )}
                    </div>

                    <div className="customer-grid-col info-col" onClick={() => {
                      setSelectedCustomer(customer)
                      setShowCustomerModal(true)
                    }}>
                      {!isDayMatchingPreferredDays(selectedDateObject, customer.PrefferedDays) && customer.PrefferedDays && (
                        <div style={{ color: '#e74c3c', fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Preferred Days: {customer.PrefferedDays}</div>
                      )}
                      <div className="customer-address-main">{getFullAddress(customer)}</div>
                      <div className="customer-name-sub">{customer.CustomerName}</div>
                      <span className="route-pill" style={getRouteStyle(customer.Route)}>{customer.Route || 'N/A'}</span>
                      {customer.Outstanding > 0 && (
                        <div className="outstanding-mobile" style={{ marginTop: '0.25rem' }}>
                          Outstanding: <span className="outstanding-amount">{formatCurrency(customer.Outstanding, user.SettingsCountry || 'United Kingdom')}</span>
                        </div>
                      )}
                    </div>

                    <div className="customer-grid-col price-col">
                      {editingPriceCustomerId === customer.id ? (
                        <div className="price-edit-container">
                          <input
                            type="number"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdatePrice(customer.id, editingPriceValue)
                              } else if (e.key === 'Escape') {
                                setEditingPriceCustomerId(null)
                                setEditingPriceValue('')
                              }
                            }}
                          />
                          <div className="price-button-row">
                            <button
                              className="price-save-btn"
                              onClick={() => handleUpdatePrice(customer.id, editingPriceValue)}
                              title="Save price"
                            >
                              ✓
                            </button>
                            <button
                              className="price-cancel-btn"
                              onClick={() => {
                                setEditingPriceCustomerId(null)
                                setEditingPriceValue('')
                              }}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="price-display"
                          onClick={() => {
                            setEditingPriceCustomerId(customer.id)
                            setEditingPriceValue(customer.Price || '')
                          }}
                        >
                          <div>{customer.Price && formatCurrency(customer.Price, user.SettingsCountry || 'United Kingdom')}</div>
                          {getAdditionalServices(customer) && <div className="additional-services">{getAdditionalServices(customer)}</div>}
                        </div>
                      )}
                    </div>

                    <div className="customer-grid-col actions-col">
                      <div className="row-actions-buttons">
                        <button onClick={() => handleDoneAndPaid(customer)} className="done-paid-btn">
                          Done and Paid
                        </button>
                        {user?.GoCardlessConnected && customer.GoCardlessMandateId && (
                          <button
                            onClick={() => openGcConfirmModal(customer)}
                            className="done-paid-btn"
                            disabled={goCardlessLoadingCustomerId === customer.id}
                            style={{ background: '#1a6b3c' }}
                            title="Mark as done and collect payment via Direct Debit"
                          >
                            {goCardlessLoadingCustomerId === customer.id ? 'Collecting...' : 'Done & GoCardless'}
                          </button>
                        )}
                        <button onClick={() => handleDoneAndNotPaid(customer)} className="done-not-paid-btn">
                          Done and Not Paid
                        </button>
                        <button onClick={() => handleSkipClean(customer)} className="skip-clean-btn">
                          Skip
                        </button>
                      </div>

                      <div className="row-message-and-calendar">
                        <div className="row-message-section">
                          <select
                            value={selectedLetters[customer.id] || messages[0]?.id || ''}
                            onChange={(e) => handleSelectLetter(customer.id, e.target.value)}
                            disabled={!messages.length}
                          >
                            {!messages.length && <option value="">No letters available</option>}
                            {messages.length > 0 && !selectedLetters[customer.id] && (
                              <option value="">Select letter</option>
                            )}
                            {messages.map((msg) => (
                              <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                            ))}
                          </select>
                          <button
                            className="text-btn"
                            onClick={() => handleSendWhatsApp(customer)}
                            disabled={!customer.PhoneNumber || !messages.length}
                          >
                            Text
                          </button>
                        </div>

                        <div className="row-calendar-section">
                          {user.admin && (
                            <div className="calendar-action-group">
                              <span className="calendar-action-label">Create Invoice</span>
                              <button
                                className="calendar-icon-btn"
                                onClick={() => setInvoiceModal({ show: true, customer })}
                                title="Create invoice"
                              >
                                🧾
                              </button>
                            </div>
                          )}
                          {user?.GoCardlessConnected && (
                            <div className="calendar-action-group">
                              <span className="calendar-action-label">
                                {customer.GoCardlessMandateId ? 'DD GoCardless' : 'Direct Debit'}
                              </span>
                              <button
                                className="calendar-icon-btn"
                                onClick={() => handleSetupGoCardlessMandate(customer)}
                                disabled={goCardlessLoadingCustomerId === customer.id}
                                title={customer.GoCardlessMandateId ? 'Change GoCardless Direct Debit details' : 'Set up GoCardless direct debit'}
                              >
                                {goCardlessLoadingCustomerId === customer.id ? '…' : '🏦'}
                              </button>
                            </div>
                          )}
                          <div className="calendar-action-group">
                            <span className="calendar-action-label">Change clean date</span>
                            <button
                              className="calendar-icon-btn"
                              onClick={() => toggleDatePicker(customer.id)}
                              title="Pick a date to move to"
                            >
                              📅
                            </button>
                          </div>
                          {expandedDatePickers[customer.id] && (
                            <input
                              type="date"
                              value={customer.NextClean || ''}
                              onChange={(e) => handleMoveToDate(customer, e.target.value)}
                              className="date-picker-input"
                              autoFocus
                            />
                          )}
                        </div>
                      </div>

                      <div className="mobile-menu-container">
                        <button
                          className="mobile-menu-btn"
                          onClick={() => setMobileMenuOpenCustomerId(
                            mobileMenuOpenCustomerId === customer.id ? null : customer.id
                          )}
                          title="More options"
                        >
                          ⋯
                        </button>
                        
                        {mobileMenuOpenCustomerId === customer.id && (
                          <div className="mobile-menu-dropdown">
                            <button 
                              className="mobile-menu-item done-paid-btn"
                              onClick={() => {
                                handleDoneAndPaid(customer)
                                setMobileMenuOpenCustomerId(null)
                              }}
                            >
                              Done and Paid
                            </button>
                            {user?.GoCardlessConnected && customer.GoCardlessMandateId && (
                              <button
                                className="mobile-menu-item done-paid-btn"
                                style={{ background: '#1a6b3c' }}
                                disabled={goCardlessLoadingCustomerId === customer.id}
                                onClick={() => {
                                  openGcConfirmModal(customer)
                                  setMobileMenuOpenCustomerId(null)
                                }}
                              >
                                {goCardlessLoadingCustomerId === customer.id ? 'Collecting...' : 'Done & GoCardless'}
                              </button>
                            )}
                            <button 
                              className="mobile-menu-item done-not-paid-btn"
                              onClick={() => {
                                handleDoneAndNotPaid(customer)
                                setMobileMenuOpenCustomerId(null)
                              }}
                            >
                              Done and Not Paid
                            </button>
                            <button 
                              className="mobile-menu-item skip-clean-btn"
                              onClick={() => {
                                handleSkipClean(customer)
                                setMobileMenuOpenCustomerId(null)
                              }}
                            >
                              Skip
                            </button>
                            <div className="mobile-menu-section">
                              <select
                                value={selectedLetters[customer.id] || messages[0]?.id || ''}
                                onChange={(e) => handleSelectLetter(customer.id, e.target.value)}
                                disabled={!messages.length}
                                className="mobile-menu-select"
                              >
                                {!messages.length && <option value="">No letters available</option>}
                                {messages.length > 0 && !selectedLetters[customer.id] && (
                                  <option value="">Select letter</option>
                                )}
                                {messages.map((msg) => (
                                  <option key={msg.id} value={msg.id}>{msg.MessageTitle}</option>
                                ))}
                              </select>
                              <button
                                className="mobile-menu-item text-btn"
                                onClick={() => {
                                  handleSendWhatsApp(customer)
                                  setMobileMenuOpenCustomerId(null)
                                }}
                                disabled={!customer.PhoneNumber || !messages.length}
                              >
                                Text
                              </button>
                            </div>
                            {user.admin && (
                              <button
                                className="mobile-menu-item"
                                onClick={() => {
                                  setInvoiceModal({ show: true, customer })
                                  setMobileMenuOpenCustomerId(null)
                                }}
                              >
                                🧾 Create Invoice
                              </button>
                            )}
                            {user?.GoCardlessConnected && (
                              <button
                                className="mobile-menu-item"
                                onClick={() => {
                                  handleSetupGoCardlessMandate(customer)
                                  setMobileMenuOpenCustomerId(null)
                                }}
                                disabled={goCardlessLoadingCustomerId === customer.id}
                              >
                                {goCardlessLoadingCustomerId === customer.id ? 'Opening GoCardless...' : customer.GoCardlessMandateId ? '🏦 Change Direct Debit Details' : '🏦 Set Up Direct Debit'}
                              </button>
                            )}
                            <button
                              className="mobile-menu-item calendar-icon-btn"
                              onClick={() => {
                                toggleDatePicker(customer.id)
                              }}
                              title="Pick a date to move to"
                            >
                              📅 Change Date
                            </button>
                            {expandedDatePickers[customer.id] && (
                              <input
                                type="date"
                                value={customer.NextClean || ''}
                                onChange={(e) => {
                                  handleMoveToDate(customer, e.target.value)
                                  setMobileMenuOpenCustomerId(null)
                                }}
                                className="mobile-menu-date-input"
                                autoFocus
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {invoiceModal.show && invoiceModal.customer && (
        <InvoiceModalContent 
          user={user}
          customer={invoiceModal.customer}
          onClose={() => setInvoiceModal({ show: false, customer: null })}
        />
      )}

      {gcConfirmModal.open && gcConfirmModal.customer && (() => {
        const { symbol } = getCurrencyConfig(user.SettingsCountry || 'United Kingdom')
        const price = parseFloat(gcConfirmModal.customer.Price) || 0
        const outstanding = parseFloat(gcConfirmModal.customer.Outstanding) || 0
        return (
          <div className="modal-overlay" onClick={() => setGcConfirmModal({ open: false, customer: null, amount: '' })}>
            <div className="modal-content" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setGcConfirmModal({ open: false, customer: null, amount: '' })}>×</button>
              <h3>Collect via Direct Debit</h3>
              <p style={{ marginBottom: 4 }}><strong>{gcConfirmModal.customer.Name}</strong></p>
              <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: 16 }}>
                Job: {symbol}{price.toFixed(2)}
                {outstanding > 0 && <> &nbsp;+&nbsp; Outstanding: {symbol}{outstanding.toFixed(2)}</>}
              </p>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Amount to collect ({symbol})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={gcConfirmModal.amount}
                onChange={e => setGcConfirmModal(m => ({ ...m, amount: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', fontSize: '1.1rem', border: '1px solid #ccc', borderRadius: 6, marginBottom: 20, boxSizing: 'border-box' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="done-paid-btn"
                  style={{ flex: 1, background: '#1a6b3c' }}
                  disabled={goCardlessLoadingCustomerId === gcConfirmModal.customer.id || !parseFloat(gcConfirmModal.amount) > 0}
                  onClick={() => handleDoneAndCollectGoCardless(gcConfirmModal.customer, gcConfirmModal.amount)}
                >
                  {goCardlessLoadingCustomerId === gcConfirmModal.customer.id ? 'Collecting...' : `Collect ${symbol}${parseFloat(gcConfirmModal.amount || 0).toFixed(2)}`}
                </button>
                <button
                  className="skip-clean-btn"
                  style={{ flex: 1 }}
                  onClick={() => setGcConfirmModal({ open: false, customer: null, amount: '' })}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <SendMessageMethodModal
        isOpen={sendMessageModal.show}
        customer={sendMessageModal.customer}
        onCancel={closeSendMessageModal}
        onSend={handleSendMessageModalConfirm}
      />

      {showPersonalItemModal && isAdmin && (
        <div className="modal-overlay" onClick={closePersonalItemModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closePersonalItemModal}>×</button>
            <h3>Add Personal Calender Item</h3>
            <div className="modal-form personal-item-form">
              <label htmlFor="personalItemDate">Date</label>
              <input
                id="personalItemDate"
                type="date"
                className="modal-input"
                value={personalItemForm.Date}
                onChange={(e) => setPersonalItemForm((prev) => ({ ...prev, Date: e.target.value }))}
              />

              <label htmlFor="personalItemHeader">Header</label>
              <input
                id="personalItemHeader"
                type="text"
                className="modal-input"
                placeholder="e.g. Dentist appointment"
                value={personalItemForm.Item}
                onChange={(e) => setPersonalItemForm((prev) => ({ ...prev, Item: e.target.value }))}
              />

              <label htmlFor="personalItemDescription">Description</label>
              <textarea
                id="personalItemDescription"
                className="modal-input"
                rows="4"
                placeholder="Optional notes"
                value={personalItemForm.Description}
                onChange={(e) => setPersonalItemForm((prev) => ({ ...prev, Description: e.target.value }))}
              />
            </div>
            <div className="modal-buttons">
              <button className="modal-ok-btn" onClick={handleSavePersonalItem} disabled={savingPersonalItem}>
                {savingPersonalItem ? 'Saving...' : 'Save'}
              </button>
              <button className="modal-cancel-btn" onClick={closePersonalItemModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPersonalImportModal && isAdmin && (
        <div className="modal-overlay" onClick={closePersonalImportModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closePersonalImportModal}>×</button>
            <h3>Import Personal Calender File</h3>

            <div className="modal-form personal-item-form">
              <label htmlFor="personalImportFile">Upload image or CSV</label>
              <input
                id="personalImportFile"
                type="file"
                accept=".csv,image/*"
                className="modal-input"
                onChange={handlePersonalImportFileChange}
                disabled={processingPersonalImport}
              />
              {importPersonalFileName && (
                <div className="import-file-name">Selected: {importPersonalFileName}</div>
              )}
              {processingPersonalImport && (
                <div className="import-status">Scanning and parsing file...</div>
              )}
              {importPersonalError && (
                <div className="import-status import-error">{importPersonalError}</div>
              )}
              {importPersonalItemsAll.length > 0 && (
                <div className="import-status import-success">
                  Detected {importPersonalItemsAll.length} item{importPersonalItemsAll.length === 1 ? '' : 's'}.
                </div>
              )}
              {importPersonalDuplicateCount > 0 && (
                <div className="import-status">
                  Skipped {importPersonalDuplicateCount} duplicate item{importPersonalDuplicateCount === 1 ? '' : 's'} (same date + header).
                </div>
              )}
              {importPersonalAssumedYearCount > 0 && (
                <div className="import-status">
                  Assumed current year ({new Date().getFullYear()}) for {importPersonalAssumedYearCount} CSV date value{importPersonalAssumedYearCount === 1 ? '' : 's'} in DD/MM format.
                </div>
              )}
            </div>

            {importPersonalItemsPreview.length > 0 && (
              <div className="import-preview-list">
                {importPersonalItemsPreview.map((entry, index) => (
                  <div key={`${entry.Date}-${entry.Item}-${index}`} className="import-preview-item">
                    <strong>{entry.Date}</strong> — {entry.Item}
                  </div>
                ))}
                {importPersonalItemsAll.length > importPersonalItemsPreview.length && (
                  <div className="import-preview-more">
                    +{importPersonalItemsAll.length - importPersonalItemsPreview.length} more
                  </div>
                )}
              </div>
            )}

            <div className="modal-buttons">
              <button
                className="modal-ok-btn"
                onClick={handleImportPersonalItems}
                disabled={processingPersonalImport || importPersonalItemsAll.length === 0}
              >
                {processingPersonalImport ? 'Working...' : 'Import Dates'}
              </button>
              <button className="modal-cancel-btn" onClick={closePersonalImportModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <CustomerDetailsModal
        isOpen={showCustomerModal && Boolean(selectedCustomer)}
        customer={selectedCustomer}
        user={user}
        onClose={() => {
          setShowCustomerModal(false)
          setSelectedCustomer(null)
        }}
        onCustomerUpdated={(updatedCustomer) => {
          setSelectedCustomer(updatedCustomer)
          setOrderedCustomers((prev) => prev.map((row) => (
            Number(row.id) === Number(updatedCustomer.id) ? { ...row, ...updatedCustomer } : row
          )))
          fetchCustomers()
        }}
        onRequestCancelService={() => setCancelServiceModal({ show: true, reason: '' })}
        onRequestBookJob={() => selectedCustomer && handleBookJob(selectedCustomer)}
        isQuote={Boolean(selectedCustomer?.Quote)}
      />

      {cancelServiceModal.show && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setCancelServiceModal({ show: false, reason: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{isQuoteCustomer(selectedCustomer) ? 'Cancel Quote' : 'Cancel Service'}</h3>
            <div className="modal-form">
              <label htmlFor="cancelReason">Reason for Cancelation:</label>
              <textarea
                id="cancelReason"
                value={cancelServiceModal.reason}
                onChange={(e) => setCancelServiceModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason (optional)"
                rows="4"
              />
            </div>
            <div className="modal-buttons">
              <button 
                onClick={() => handleCancelService(cancelServiceModal.reason)}
                className="modal-ok-btn"
              >
                OK
              </button>
              <button 
                onClick={() => setCancelServiceModal({ show: false, reason: '' })}
                className="modal-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bookJobModal.show && bookJobModal.customer && (
        <div className="modal-overlay" onClick={() => setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Book Job for {bookJobModal.customer.CustomerName}</h3>
            <div className="modal-form">
              <label htmlFor="jobDate">Select Job Date:</label>
              <input
                id="jobDate"
                type="date"
                value={bookJobModal.selectedDate}
                onChange={(e) => setBookJobModal(prev => ({ ...prev, selectedDate: e.target.value }))}
                className="modal-input"
              />
              
              {bookJobModal.services.length > 0 && (
                <>
                  <label style={{ marginTop: '1rem' }}>Select Services:</label>
                  <div className="services-checklist">
                    {bookJobModal.services.map((service) => (
                      <div key={service.id} className="service-checkbox-item">
                        <input
                          type="checkbox"
                          id={`service-${service.id}`}
                          checked={bookJobModal.selectedServices.includes(service.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBookJobModal(prev => ({
                                ...prev,
                                selectedServices: [...prev.selectedServices, service.id]
                              }))
                            } else {
                              setBookJobModal(prev => ({
                                ...prev,
                                selectedServices: prev.selectedServices.filter(id => id !== service.id)
                              }))
                            }
                          }}
                        />
                        <label htmlFor={`service-${service.id}`} className="service-label">
                          {service.Service} - {formatCurrency(service.Price, user.SettingsCountry || 'United Kingdom')}
                        </label>
                      </div>
                    ))}
                  </div>
                  
                  {bookJobModal.selectedServices.length > 0 && (
                    <div className="service-total">
                      Total Price: {formatCurrency(
                        bookJobModal.services
                          .filter(s => bookJobModal.selectedServices.includes(s.id))
                          .reduce((sum, s) => sum + (parseFloat(s.Price) || 0), 0),
                        user.SettingsCountry || 'United Kingdom'
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-buttons">
              <button 
                onClick={() => handleBookJobSave()}
                className="modal-ok-btn"
              >
                Save
              </button>
              <button 
                onClick={() => setBookJobModal({ show: false, customer: null, selectedDate: '', services: [], selectedServices: [] })}
                className="modal-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceModalContent({ user, customer, onClose }) {
  const ownerUserId = getOwnerUserId(user)
  const [invoiceIdText, setInvoiceIdText] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [services, setServices] = useState([])
  const [items, setItems] = useState([{ mode: 'select', ServiceId: '', Service: '', Price: 0 }])
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [savedInvoiceData, setSavedInvoiceData] = useState(null)
  const currencySymbol = getCurrencyConfig(user.SettingsCountry || 'United Kingdom').symbol
  const jsPDFRef = typeof window !== 'undefined' && window.jspdf ? window.jspdf.jsPDF : null

  useEffect(() => {
    async function init() {
      // Fetch services for this customer
      const { data: svc, error: svcErr } = await supabase
        .from('CustomerPrices')
        .select('*')
        .eq('CustomerID', customer.id)
      if (!svcErr) setServices(svc || [])

      // Determine next InvoiceID based on user's previous invoices
      try {
        const { data: custIdsData, error: custErr } = await supabase
          .from('Customers')
          .select('id')
          .eq('UserId', ownerUserId)
        if (custErr) throw custErr

        const ids = (custIdsData || []).map((c) => c.id)
        let nextIdText = '1'
        if (ids.length > 0) {
          const { data: invs, error: invErr } = await supabase
            .from('CustomerInvoices')
            .select('InvoiceID')
            .in('CustomerID', ids)
            .order('id', { ascending: false })
            .limit(200)
          if (invErr) throw invErr

          const parseNum = (str) => {
            if (!str) return null
            const match = String(str).match(/(\d+)/g)
            if (!match || match.length === 0) return null
            const last = match[match.length - 1]
            const n = parseInt(last, 10)
            return Number.isNaN(n) ? null : n
          }

          let maxNum = null
          for (const r of invs || []) {
            const n = parseNum(r.InvoiceID)
            if (n !== null) {
              if (maxNum === null || n > maxNum) maxNum = n
            }
          }
          if (maxNum !== null) nextIdText = String(maxNum + 1)
        }
        setInvoiceIdText(nextIdText)
      } catch (e) {
        setInvoiceIdText('1')
      }
    }
    init()
  }, [customer.id, user.id])

  const updateItem = (index, patch) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
    
    // Auto-add new row when user selects/enters a service
    const updatedItem = { ...items[index], ...patch }
    if ((updatedItem.ServiceId || updatedItem.Service) && index === items.length - 1) {
      setItems((prev) => [...prev, { mode: 'select', ServiceId: '', Service: '', Price: 0 }])
    }
  }

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const formatPhoneForWhatsApp = (raw) => {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 11 && digits.startsWith('0')) return `44${digits.slice(1)}`
    return digits
  }

  const generateInvoicePdf = () => {
    if (!jsPDFRef || !savedInvoiceData) return null
    
    const doc = new jsPDFRef()
    const lineHeight = 8
    let y = 15

    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

    // Company name at the top, centered and larger
    if (user.CompanyName) {
      doc.setFontSize(18)
      const pageWidth = doc.internal.pageSize.getWidth()
      const companyNameWidth = doc.getTextWidth(user.CompanyName)
      const centerX = (pageWidth - companyNameWidth) / 2
      doc.text(user.CompanyName, centerX, y)
      y += lineHeight + 4
    }

    // Customer name and address
    doc.setFontSize(14)
    doc.text(customer.CustomerName, 15, y)
    y += lineHeight
    doc.setFontSize(12)
    if (addressLines.length) {
      addressLines.forEach(line => {
        doc.text(line, 15, y)
        y += lineHeight
      })
    }

    y += 4
    // Invoice ID
    doc.text(`Invoice Number: ${savedInvoiceData.invoiceId}`, 15, y)
    y += lineHeight
    
    // Invoice Date
    doc.text(`Invoice Date: ${formatDateByCountry(savedInvoiceData.invoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight

    y += 4
    // Services list
    doc.setFontSize(14)
    doc.text('For the following Services:', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    
    // Calculate the width needed for the longest service name
    let maxServiceWidth = 0
    savedInvoiceData.items.forEach((it) => {
      const serviceWidth = doc.getTextWidth(it.Service)
      if (serviceWidth > maxServiceWidth) {
        maxServiceWidth = serviceWidth
      }
    })
    // Also check "Total Amount" width
    const totalLabelWidth = doc.getTextWidth('Total Amount:')
    if (totalLabelWidth > maxServiceWidth) {
      maxServiceWidth = totalLabelWidth
    }
    
    const leftX = 15
    const rightX = leftX + maxServiceWidth + 10 // 10px gap between columns
    
    let total = 0
    savedInvoiceData.items.forEach((it) => {
      const price = parseFloat(it.Price) || 0
      total += price
      doc.text(it.Service, leftX, y)
      doc.text(`${currencySymbol}${price.toFixed(2)}`, rightX, y)
      y += lineHeight
    })

    y += 4
    // Total
    doc.setFontSize(14)
    doc.text('Total Amount:', leftX, y)
    doc.text(`${currencySymbol}${total.toFixed(2)}`, rightX, y)

    // Invoice Footer
    if (user.InvoiceFooter) {
      y += lineHeight + 4
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      const footerLines = doc.splitTextToSize(user.InvoiceFooter, 170)
      doc.text(footerLines, 15, y)
      doc.setTextColor(0, 0, 0)
    }

    return doc.output('blob')
  }

  const generateAndDownloadPDF = (invoiceData) => {
    if (!jsPDFRef) {
      alert('PDF generation library not loaded')
      return
    }
    
    const doc = new jsPDFRef()
    const lineHeight = 8
    let y = 15

    const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

    // Company name at the top, centered and larger
    if (user.CompanyName) {
      doc.setFontSize(18)
      const pageWidth = doc.internal.pageSize.getWidth()
      const companyNameWidth = doc.getTextWidth(user.CompanyName)
      const centerX = (pageWidth - companyNameWidth) / 2
      doc.text(user.CompanyName, centerX, y)
      y += lineHeight + 4
    }

    // Customer name and address
    doc.setFontSize(14)
    doc.text(customer.CustomerName, 15, y)
    y += lineHeight
    doc.setFontSize(12)
    if (addressLines.length) {
      addressLines.forEach(line => {
        doc.text(line, 15, y)
        y += lineHeight
      })
    }

    y += 4
    // Invoice ID
    doc.text(`Invoice Number: ${invoiceData.invoiceId}`, 15, y)
    y += lineHeight
    
    // Invoice Date
    doc.text(`Invoice Date: ${formatDateByCountry(invoiceData.invoiceDate, user.SettingsCountry || 'United Kingdom')}`, 15, y)
    y += lineHeight

    y += 4
    // Services list
    doc.setFontSize(14)
    doc.text('For the following Services:', 15, y)
    y += lineHeight
    doc.setFontSize(12)
    
    // Calculate the width needed for the longest service name
    let maxServiceWidth = 0
    invoiceData.items.forEach((it) => {
      const serviceWidth = doc.getTextWidth(it.Service)
      if (serviceWidth > maxServiceWidth) {
        maxServiceWidth = serviceWidth
      }
    })
    // Also check "Total Amount" width
    const totalLabelWidth = doc.getTextWidth('Total Amount:')
    if (totalLabelWidth > maxServiceWidth) {
      maxServiceWidth = totalLabelWidth
    }
    
    const leftX = 15
    const rightX = leftX + maxServiceWidth + 10 // 10px gap between columns
    
    let total = 0
    invoiceData.items.forEach((it) => {
      const price = parseFloat(it.Price) || 0
      total += price
      doc.text(it.Service, leftX, y)
      doc.text(`${currencySymbol}${price.toFixed(2)}`, rightX, y)
      y += lineHeight
    })

    y += 4
    // Total
    doc.setFontSize(14)
    doc.text('Total Amount:', leftX, y)
    doc.text(`${currencySymbol}${total.toFixed(2)}`, rightX, y)

    // Invoice Footer
    if (user.InvoiceFooter) {
      y += lineHeight + 4
      doc.setFontSize(11)
      doc.setTextColor(100, 100, 100)
      const footerLines = doc.splitTextToSize(user.InvoiceFooter, 170)
      doc.text(footerLines, 15, y)
      doc.setTextColor(0, 0, 0)
    }

    // Download the PDF
    doc.save(`Invoice-${invoiceData.invoiceId}.pdf`)
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const sendViaText = async () => {
    const pdfBlob = generateInvoicePdf()
    if (!pdfBlob) {
      alert('Failed to generate PDF')
      return
    }

    const filename = `Invoice-${savedInvoiceData.invoiceId}.pdf`
    const phone = formatPhoneForWhatsApp(customer.PhoneNumber)
    
    if (!phone) {
      alert('Invalid phone number')
      return
    }

    const message = `Invoice ${savedInvoiceData.invoiceId} for ${customer.CustomerName}`

    // Try Web Share API first (mobile - can attach files)
    try {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' })
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
      
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: message
        })
        onClose()
        return
      }
    } catch (err) {
      console.log('Share failed:', err)
    }

    // Desktop fallback: download PDF and open WhatsApp
    downloadBlob(pdfBlob, filename)
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`
    const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    
    const opened = window.open(appUrl, '_blank')
    if (!opened) {
      window.open(webUrl, '_blank')
    }
    
    onClose()
  }

  const sendViaEmail = async () => {
    const email = customer.EmailAddress
    if (!email) {
      alert('No email address for this customer')
      return
    }
    if (!savedInvoiceData) {
      alert('Invoice data missing')
      return
    }

    try {
      // Generate PDF blob
      const pdfBlob = generateInvoicePdf()
      if (!pdfBlob) {
        alert('Failed to generate PDF')
        return
      }

      // Create a unique filename for the invoice
      const timestamp = new Date().getTime()
      const filename = `invoice_${savedInvoiceData.invoiceId}_${timestamp}.pdf`
      const filepath = `invoices/${user.id}/${filename}`

      // Upload PDF to Supabase Storage bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filepath, pdfBlob, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        alert('Failed to upload PDF: ' + uploadError.message)
        return
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(filepath)
      
      const publicUrl = publicUrlData?.publicUrl

      // Build email body with PDF download link
      const total = savedInvoiceData.items.reduce((sum, it) => sum + (parseFloat(it.Price) || 0), 0)
      const itemsLines = savedInvoiceData.items.map(
        (it) => `${it.Service} - ${currencySymbol}${(parseFloat(it.Price) || 0).toFixed(2)}`
      )
      const bodyLines = [
        `Invoice ${savedInvoiceData.invoiceId}`,
        `Customer: ${customer.CustomerName}`,
        `Invoice Date: ${formatDateByCountry(savedInvoiceData.invoiceDate, user.SettingsCountry || 'United Kingdom')}`,
        '',
        'Items:',
        ...itemsLines,
        `Total: ${currencySymbol}${total.toFixed(2)}`,
        '',
        '---',
        'Download Invoice PDF:',
        publicUrl || 'PDF link unavailable'
      ]

      const subject = `Invoice ${savedInvoiceData.invoiceId}`
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
      // Use same-tab navigation for better mobile handling
      window.location.assign(mailto)
      // Small delay before closing to avoid canceling navigation on some browsers
      setTimeout(() => onClose(), 400)
    } catch (err) {
      alert('Error sending email: ' + err.message)
    }
  }

  const handleSave = async ({ shouldDownload }) => {
    if (savingInvoice) return

    if (!invoiceIdText) {
      alert('Please enter an Invoice ID')
      return
    }

    // Filter out empty items (like the last "select service" row)
    const validItems = items.filter(it => it.Service && it.Price)
    
    if (validItems.length === 0) {
      alert('Please add at least one service')
      return
    }

    setSavingInvoice(true)

    try {
      // Create invoice header
      const { data: invData, error: invErr } = await supabase
        .from('CustomerInvoices')
        .insert({
          CustomerID: customer.id,
          InvoiceID: invoiceIdText,
          InvoiceDate: invoiceDate
        })
        .select()

      if (invErr) {
        alert('Failed to create invoice: ' + invErr.message)
        return
      }

      const invoiceRow = Array.isArray(invData) ? invData[0] : invData
      const invoicePk = invoiceRow?.id

      // Save service items
      const itemsPayload = validItems.map((it) => ({
        InvoiceID: invoicePk,
        Service: it.Service,
        Price: parseFloat(it.Price) || 0,
      }))

      const { error: jobsErr } = await supabase
        .from('CustomerInvoiceJobs')
        .insert(itemsPayload)

      if (jobsErr) {
        alert('Failed to save invoice items: ' + jobsErr.message)
        return
      }

      setSavedInvoiceData({
        invoiceId: invoiceIdText,
        invoiceDate,
        items: validItems
      })

      if (shouldDownload) {
        generateAndDownloadPDF({
          invoiceId: invoiceIdText,
          invoiceDate,
          items: validItems
        })
      }

      onClose()
    } finally {
      setSavingInvoice(false)
    }
  }

  const addressLines = [customer.Address, customer.Address2, customer.Address3, customer.Postcode].filter(Boolean)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Create Invoice</h3>

        <div className="invoice-customer">
          <div><strong>Name:</strong> {customer.CustomerName}</div>
          <div><strong>Address:</strong> {addressLines.join(', ')}</div>
        </div>

        <div className="invoice-header-row" style={{ marginTop: '16px' }}>
          <div className="invoice-field">
            <label>Invoice ID</label>
            <input 
              type="text" 
              value={invoiceIdText} 
              onChange={(e) => setInvoiceIdText(e.target.value)} 
            />
          </div>
          <div className="invoice-field">
            <label>Invoice Date</label>
            <input 
              type="date" 
              value={invoiceDate} 
              onChange={(e) => setInvoiceDate(e.target.value)} 
            />
          </div>
        </div>

        <div className="invoice-items" style={{ marginTop: '16px' }}>
          {items.map((it, idx) => (
            <div className="invoice-item-row" key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '4px', alignItems: 'flex-end' }}>
              <div className="invoice-field" style={{ flex: 2 }}>
                {idx === 0 && <label>Service</label>}
                {it.mode === 'select' ? (
                  <select
                    value={it.ServiceId || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '__custom__') {
                        updateItem(idx, { mode: 'custom', ServiceId: '', Service: '', Price: 0 })
                        return
                      }
                      const svc = services.find((s) => String(s.id) === String(val))
                      updateItem(idx, {
                        ServiceId: val,
                        Service: svc?.Service || '',
                        Price: svc ? parseFloat(svc.Price) || 0 : 0,
                      })
                    }}
                  >
                    <option value="">Select service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.Service}</option>
                    ))}
                    <option value="__custom__">Custom item…</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Custom service"
                    value={it.Service}
                    onChange={(e) => updateItem(idx, { Service: e.target.value })}
                  />
                )}
              </div>
              <div className="invoice-field" style={{ flex: 1 }}>
                {idx === 0 && <label>Price</label>}
                <input
                  type="number"
                  step="0.01"
                  value={it.Price}
                  onChange={(e) => updateItem(idx, { Price: e.target.value })}
                />
              </div>
              <button 
                className="remove-item-btn" 
                onClick={() => removeItem(idx)}
                style={{ 
                  color: 'red', 
                  border: 'none', 
                  background: 'none', 
                  fontSize: '20px', 
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="modal-buttons">
          <button className="modal-ok-btn" onClick={() => handleSave({ shouldDownload: false })} disabled={savingInvoice}>{savingInvoice ? 'Saving...' : 'Save and Exit'}</button>
          <button className="modal-ok-btn" onClick={() => handleSave({ shouldDownload: true })} disabled={savingInvoice}>{savingInvoice ? 'Saving...' : 'Save and Download'}</button>
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default WorkloadManager
