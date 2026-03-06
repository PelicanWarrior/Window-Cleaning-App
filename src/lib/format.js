const DEFAULT_COUNTRY = 'United Kingdom'

export function getUserCountry(userOrCountry, fallback = DEFAULT_COUNTRY) {
  if (!userOrCountry) return fallback

  if (typeof userOrCountry === 'string') {
    const trimmed = userOrCountry.trim()
    return trimmed || fallback
  }

  const fromObject =
    userOrCountry.SettingsCountry ||
    userOrCountry.SettingsCounty ||
    userOrCountry.settingsCountry ||
    userOrCountry.settingsCounty ||
    userOrCountry.country ||
    userOrCountry.Country

  if (typeof fromObject === 'string' && fromObject.trim()) {
    return fromObject.trim()
  }

  return fallback
}

export function getCountryUpdateFields(user, country) {
  const safeCountry = getUserCountry(country)

  if (user && Object.prototype.hasOwnProperty.call(user, 'SettingsCountry') && Object.prototype.hasOwnProperty.call(user, 'SettingsCounty')) {
    return { SettingsCountry: safeCountry, SettingsCounty: safeCountry }
  }

  if (user && Object.prototype.hasOwnProperty.call(user, 'SettingsCounty')) {
    return { SettingsCounty: safeCountry }
  }

  return { SettingsCountry: safeCountry }
}

export function normalizeUserCountryFields(user) {
  if (!user) return user

  const country = getUserCountry(user)
  const hasCountry = Object.prototype.hasOwnProperty.call(user, 'SettingsCountry')
  const hasCounty = Object.prototype.hasOwnProperty.call(user, 'SettingsCounty')

  if (hasCountry && hasCounty) {
    return {
      ...user,
      SettingsCountry: country,
      SettingsCounty: country
    }
  }

  if (hasCounty && !hasCountry) {
    return {
      ...user,
      SettingsCountry: country,
      SettingsCounty: country
    }
  }

  return {
    ...user,
    SettingsCountry: country
  }
}

export function getCurrencyConfig(countryInput) {
  const country = getUserCountry(countryInput)

  switch (country) {
    case 'United States':
      return { symbol: '$', position: 'prefix', locale: 'en-US', dateFormat: 'MM/DD/YYYY', currencyCode: 'USD' }
    case 'United Kingdom':
      return { symbol: '£', position: 'prefix', locale: 'en-GB', dateFormat: 'DD/MM/YYYY', currencyCode: 'GBP' }
    case 'Ireland':
      return { symbol: '€', position: 'prefix', locale: 'en-IE', dateFormat: 'DD/MM/YYYY', currencyCode: 'EUR' }
    case 'Germany':
      return { symbol: '€', position: 'suffix', locale: 'de-DE', dateFormat: 'DD/MM/YYYY', currencyCode: 'EUR' }
    case 'France':
      return { symbol: '€', position: 'suffix', locale: 'fr-FR', dateFormat: 'DD/MM/YYYY', currencyCode: 'EUR' }
    case 'Spain':
      return { symbol: '€', position: 'suffix', locale: 'es-ES', dateFormat: 'DD/MM/YYYY', currencyCode: 'EUR' }
    case 'Italy':
      return { symbol: '€', position: 'suffix', locale: 'it-IT', dateFormat: 'DD/MM/YYYY', currencyCode: 'EUR' }
    case 'Canada':
      return { symbol: '$', position: 'prefix', locale: 'en-CA', dateFormat: 'MM/DD/YYYY', currencyCode: 'CAD' }
    case 'Australia':
      return { symbol: '$', position: 'prefix', locale: 'en-AU', dateFormat: 'DD/MM/YYYY', currencyCode: 'AUD' }
    case 'New Zealand':
      return { symbol: '$', position: 'prefix', locale: 'en-NZ', dateFormat: 'DD/MM/YYYY', currencyCode: 'NZD' }
    default:
      return { symbol: '£', position: 'prefix', locale: 'en-GB', dateFormat: 'DD/MM/YYYY', currencyCode: 'GBP' }
  }
}

export function formatCurrency(amount, countryInput) {
  const { locale, currencyCode, symbol, position } = getCurrencyConfig(countryInput)
  const numericValue = Number.parseFloat(amount)
  const value = Number.isFinite(numericValue) ? numericValue : 0

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  } catch {
    const fallbackValue = value.toFixed(2)
    return position === 'prefix' ? `${symbol}${fallbackValue}` : `${fallbackValue}${symbol}`
  }
}

export function formatDateByCountry(dateStr, countryInput) {
  const { locale } = getCurrencyConfig(countryInput)
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale)
}
