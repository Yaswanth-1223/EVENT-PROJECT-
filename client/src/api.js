const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const isStaticPreview = import.meta.env.PROD && !import.meta.env.VITE_API_URL

export async function api(path, options = {}) {
  if (isStaticPreview && /^\/api\/auth\/(me|register|login|logout)$/.test(path)) {
    if (path === '/api/auth/me') {
      let user = null
      try { user = JSON.parse(localStorage.getItem('mahalmate-preview-user') || 'null') } catch { user = null }
      return { user }
    }
    if (path === '/api/auth/logout') {
      localStorage.removeItem('mahalmate-preview-user')
      return { message: 'Signed out.' }
    }
    const body = options.body ? JSON.parse(options.body) : {}
    if (!body.email) throw new Error('Email address is required.')
    const user = {
      id: 1,
      name: body.name || 'MahalMate Guest',
      email: body.email,
      phone: body.phone || '',
      role: 'customer',
    }
    localStorage.setItem('mahalmate-preview-user', JSON.stringify(user))
    return { user }
  }
  if (isStaticPreview) {
    if (path === '/api/bookings/my') return []
    if (path === '/api/functions') return []
    if (path === '/api/services') return []
    if (path.startsWith('/api/mahals')) return []
    if (path.startsWith('/api/bookings/')) return null
    if (path.startsWith('/api/admin/')) return []
    return null
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
