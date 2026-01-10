export function getCurrencyConfig(country) {
  switch (country) {
    case 'United States':
      return { symbol: '$', position: 'prefix', locale: 'en-US', dateFormat: 'MM/DD/YYYY' }
    case 'United Kingdom':
      return { symbol: '£', position: 'prefix', locale: 'en-GB', dateFormat: 'DD/MM/YYYY' }
    case 'Ireland':
    case 'Germany':
    case 'France':
    case 'Spain':
    case 'Italy':
      return { symbol: '€', position: 'prefix', locale: 'en-GB', dateFormat: 'DD/MM/YYYY' }
    case 'Canada':
      return { symbol: '$', position: 'prefix', locale: 'en-CA', dateFormat: 'MM/DD/YYYY' }
    case 'Australia':
    case 'New Zealand':
      return { symbol: '$', position: 'prefix', locale: 'en-AU', dateFormat: 'DD/MM/YYYY' }
    default:
      return { symbol: '£', position: 'prefix', locale: 'en-GB', dateFormat: 'DD/MM/YYYY' }
  }
}

export function formatCurrency(amount, country) {
  const { symbol, position } = getCurrencyConfig(country)
  const value = (parseFloat(amount) || 0).toFixed(2)
  return position === 'prefix' ? `${symbol}${value}` : `${value}${symbol}`
}

export function formatDateByCountry(dateStr, country) {
  const { locale } = getCurrencyConfig(country)
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale)
}
