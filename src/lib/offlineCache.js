const CACHE_PREFIX = 'wcapp-offline-cache-v1'

function getStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function getOfflineCacheKey(scope, userId, variant = 'default') {
  return `${CACHE_PREFIX}:${scope}:${userId}:${variant}`
}

export function writeOfflineCache(key, data) {
  const storage = getStorage()
  if (!storage || !key) return

  try {
    const payload = {
      savedAt: new Date().toISOString(),
      data
    }
    storage.setItem(key, JSON.stringify(payload))
  } catch (error) {
    console.warn('Unable to write offline cache:', error)
  }
}

export function readOfflineCache(key) {
  const storage = getStorage()
  if (!storage || !key) return null

  try {
    const raw = storage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.data)) return null
    return parsed
  } catch (error) {
    console.warn('Unable to read offline cache:', error)
    return null
  }
}

export function isLikelyOfflineError(error) {
  if (!error) return false

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }

  const message = String(error.message || '').toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('timeout') ||
    message.includes('fetch')
  )
}

export function formatCacheTimestamp(savedAt) {
  if (!savedAt) return 'unknown time'

  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return 'unknown time'

  return date.toLocaleString()
}
