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

export function readOfflineMutationQueue(key) {
  const storage = getStorage()
  if (!storage || !key) return []

  try {
    const raw = storage.getItem(key)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Unable to read offline mutation queue:', error)
    return []
  }
}

function writeOfflineMutationQueue(key, queue) {
  const storage = getStorage()
  if (!storage || !key) return

  try {
    storage.setItem(key, JSON.stringify(Array.isArray(queue) ? queue : []))
  } catch (error) {
    console.warn('Unable to write offline mutation queue:', error)
  }
}

export function queueOfflineMutation(key, mutation) {
  if (!key || !mutation || typeof mutation !== 'object') return null

  const queuedMutation = {
    ...mutation,
    id: mutation.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    queuedAt: mutation.queuedAt || new Date().toISOString()
  }

  const queue = readOfflineMutationQueue(key)
  queue.push(queuedMutation)
  writeOfflineMutationQueue(key, queue)

  return queuedMutation
}

export async function flushOfflineMutationQueue(key, applyMutation) {
  if (!key || typeof applyMutation !== 'function') {
    return { processed: 0, remaining: 0 }
  }

  const queue = readOfflineMutationQueue(key)
  if (!queue.length) {
    return { processed: 0, remaining: 0 }
  }

  let processed = 0
  const remaining = []

  for (const mutation of queue) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await applyMutation(mutation)
      processed += 1
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        remaining.push(mutation)
        const currentIndex = queue.indexOf(mutation)
        remaining.push(...queue.slice(currentIndex + 1))
        break
      }

      console.error('Skipping failed queued mutation:', error)
    }
  }

  writeOfflineMutationQueue(key, remaining)
  return { processed, remaining: remaining.length }
}
