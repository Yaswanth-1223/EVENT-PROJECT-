const API_BASE = import.meta.env.VITE_API_URL || ''
export const isStaticPreview = import.meta.env.PROD && !import.meta.env.VITE_API_URL

export async function api(path, options = {}) {
  if (isStaticPreview) {
    throw new Error('The GitHub Pages preview has no connected backend. Venue data, accounts, bookings, and XML are unavailable until the Express API is deployed and configured.')
  }
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }
  return data
}

export const xmlUrl = (bookingId) => `${API_BASE}/api/bookings/${bookingId}/xml`
