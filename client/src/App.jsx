import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Download,
  MapPin,
  Menu,
  Plus,
  Search,
  Sparkles,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''
const categories = ['All events', 'Music', 'Technology', 'Arts', 'Culture', 'Sports', 'Other']

async function api(path, options = {}) {
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
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

function formatDate(value, compact = false) {
  if (!value) return 'Date to be announced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  return new Intl.DateTimeFormat('en', {
    month: compact ? 'short' : 'long',
    day: 'numeric',
    ...(compact ? {} : { year: 'numeric', weekday: 'long' }),
  }).format(date)
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function eventCategory(event) {
  if (event.category && event.category !== 'Other') return event.category
  const text = `${event.title || ''} ${event.description || ''}`.toLowerCase()
  if (/art|dance|photo|photography|design|paint|film/.test(text)) return 'Arts'
  if (/code|coding|technology|tech|digital|robotics/.test(text)) return 'Technology'
  if (/music|concert|singing|band|dj/.test(text)) return 'Music'
  if (/culture|heritage|festival|traditional/.test(text)) return 'Culture'
  if (/sport|football|cricket|basketball|tournament/.test(text)) return 'Sports'
  return event.category || 'Other'
}

function EventCard({ event, onOpen, onRegister }) {
  const displayCategory = eventCategory(event)
  const date = new Date(event.event_date)
  const month = Number.isNaN(date.getTime())
    ? 'TBA'
    : new Intl.DateTimeFormat('en', { month: 'short' }).format(date)
  const day = Number.isNaN(date.getTime()) ? '—' : date.getDate()
  return (
    <article className="event-card">
      <button className="event-image" onClick={() => onOpen(event)} aria-label={`View ${event.title}`}>
        <span className={`event-art event-art-${displayCategory.toLowerCase()}`}>
          <span className="art-orbit" />
          <span className="art-shape" />
          <span className="art-spark">✳</span>
          <span className="art-word">{displayCategory}</span>
        </span>
        <span className="date-chip"><b>{day}</b><span>{month}</span></span>
        <span className="image-arrow"><ArrowUpRight size={18} /></span>
      </button>
      <div className="event-card-body">
        <div className="event-meta"><span>{displayCategory}</span><span>{Number(event.fee) > 0 ? `₹${Number(event.fee).toLocaleString('en-IN')}` : 'Free'}</span></div>
        <button className="event-title" onClick={() => onOpen(event)}>{event.title}</button>
        <p className="event-description">{event.description}</p>
        <div className="event-card-footer">
          <span><MapPin size={15} />{event.venue}</span>
          <button className="text-action" onClick={() => onRegister(event)}>Join event <ArrowRight size={15} /></button>
        </div>
      </div>
    </article>
  )
}

function AuthModal({ mode, onClose, onSuccess, onModeChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const registering = mode === 'register'

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    try {
      const result = await api(`/api/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      onSuccess(result.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        <span className="eyebrow"><Sparkles size={14} /> YOUR CAMPUS, YOUR MOMENT</span>
        <h2 id="auth-heading">{registering ? 'Find your people.' : 'Welcome back.'}</h2>
        <p className="muted">{registering ? 'Create an account and get in on what’s happening.' : 'Sign in to see your upcoming events.'}</p>
        <form className="form-stack" onSubmit={submit}>
          {registering && <label>Full name<input name="name" autoComplete="name" maxLength="120" required placeholder="Your name" /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@college.edu" /></label>
          <label>Password<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength="8" maxLength="72" required placeholder="At least 8 characters" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
        </form>
        <p className="auth-switch">{registering ? 'Already have an account?' : 'New around here?'} <button onClick={() => onModeChange(registering ? 'login' : 'register')}>{registering ? 'Sign in' : 'Create an account'}</button></p>
      </section>
    </div>
  )
}

function EventFormModal({ event, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dateValue = event?.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : ''

  async function submit(formEvent) {
    formEvent.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(formEvent.currentTarget)
    const payload = Object.fromEntries(form.entries())
    try {
      await api(event ? `/api/admin/events/${event.id}` : '/api/admin/events', {
        method: event ? 'PUT' : 'POST',
        body: JSON.stringify({ ...payload, fee: Number(payload.fee) }),
      })
      onSaved()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal event-form-modal" role="dialog" aria-modal="true" aria-labelledby="event-form-heading">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        <span className="eyebrow">EVENT MANAGEMENT</span>
        <h2 id="event-form-heading">{event ? 'Edit event' : 'Create an event'}</h2>
        <form className="form-stack" onSubmit={submit}>
          <label>Event name<input name="title" defaultValue={event?.title || ''} maxLength="200" required placeholder="e.g. Spring Sound Fest" /></label>
          <label>Description<textarea name="description" defaultValue={event?.description || ''} required rows="3" placeholder="What should people know?" /></label>
          <div className="form-row">
            <label>Category<select name="category" defaultValue={event ? eventCategory(event) : 'Music'}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Entry fee (₹)<input name="fee" type="number" min="0" step="0.01" defaultValue={event?.fee ?? 0} required /></label>
          </div>
          <div className="form-row">
            <label>Date &amp; time<input name="event_date" type="datetime-local" defaultValue={dateValue} required /></label>
            <label>Venue<input name="venue" defaultValue={event?.venue || ''} maxLength="255" required placeholder="Campus auditorium" /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Publish event'} <ArrowRight size={17} /></button>
        </form>
      </section>
    </div>
  )
}

function App() {
  const [events, setEvents] = useState([])
  const [user, setUser] = useState(null)
  const [registrations, setRegistrations] = useState([])
  const [page, setPage] = useState('home')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All events')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')
  const [authMode, setAuthMode] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [editingEvent, setEditingEvent] = useState(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busyEvent, setBusyEvent] = useState(null)

  async function loadEvents() {
    try {
      setEvents(await api('/api/events'))
      setPageError('')
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadRegistrations() {
    if (!user) return
    try {
      setRegistrations(await api('/api/registrations/my'))
    } catch (error) {
      setNotice(error.message)
    }
  }

  useEffect(() => {
    let active = true
    api('/api/events')
      .then((data) => { if (active) setEvents(data) })
      .catch((error) => { if (active) setPageError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    api('/api/auth/me')
      .then((data) => { if (active) setUser(data.user) })
      .catch((error) => {
        if (!active) return
        setUser(null)
        if (error.message !== 'Please log in to continue.') setNotice(error.message)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    api('/api/registrations/my')
      .then((data) => { if (active) setRegistrations(data) })
      .catch((error) => { if (active) setNotice(error.message) })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase()
    return events.filter((event) => {
      const matchesCategory = category === 'All events' || eventCategory(event) === category
      const haystack = `${event.title} ${event.description} ${event.venue} ${event.category}`.toLowerCase()
      return matchesCategory && (!query || haystack.includes(query))
    })
  }, [events, search, category])

  function navigate(nextPage) {
    setPage(nextPage)
    setMenuOpen(false)
    if (nextPage === 'events') window.setTimeout(() => document.getElementById('events-list')?.scrollIntoView({ behavior: 'smooth' }), 0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function registerForEvent(event) {
    if (!user) {
      setAuthMode('login')
      return
    }
    setBusyEvent(event.id)
    try {
      await api('/api/registrations', { method: 'POST', body: JSON.stringify({ event_id: event.id }) })
      await loadRegistrations()
      setNotice(`You’re registered for ${event.title}.`)
      setSelectedEvent(null)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusyEvent(null)
    }
  }

  async function cancelRegistration(registration) {
    if (!window.confirm(`Cancel your registration for ${registration.title}?`)) return
    try {
      await api(`/api/registrations/${registration.registration_id}`, { method: 'DELETE' })
      await loadRegistrations()
      setNotice('Your registration has been cancelled.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function deleteEvent(event) {
    if (!window.confirm(`Delete “${event.title}”? Existing registrations for this event will also be removed.`)) return
    try {
      await api(`/api/admin/events/${event.id}`, { method: 'DELETE' })
      await loadEvents()
      setNotice('Event deleted.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setRegistrations([])
      setPage('home')
      setNotice('You’ve been signed out.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const navItems = [
    ['home', 'Home'],
    ['events', 'Explore events'],
    ...(user ? [['dashboard', 'My events']] : []),
    ...(user?.role === 'admin' ? [['admin', 'Manage events']] : []),
  ]

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); navigate('home') }} aria-label="Gather home">
          <span className="brand-mark"><Sparkles size={17} /></span><span>gather<span className="brand-period">.</span></span>
        </a>
        <button className="mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
        <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
          {navItems.map(([key, label]) => <button key={key} className={page === key ? 'nav-link active' : 'nav-link'} onClick={() => navigate(key)}>{label}</button>)}
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <button className="profile-trigger" onClick={() => navigate('profile')}><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="profile-name">{user.name.split(' ')[0]}</span><ChevronDown size={15} /></button>
              <button className="button button-outline header-signin" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="header-signin" onClick={() => setAuthMode('login')}>Sign in</button>
              <button className="button button-primary header-join" onClick={() => setAuthMode('register')}>Join Gather <ArrowUpRight size={16} /></button>
            </>
          )}
        </div>
      </header>

      {page === 'home' && (
        <main>
          <section className="hero-section">
            <div className="hero-copy">
              <span className="eyebrow"><span className="live-dot" /> THE CAMPUS IS YOURS</span>
              <h1>Make room<br />for <em>something</em><br />unforgettable<span className="hero-period">.</span></h1>
              <p className="hero-intro">The best part of college happens outside the classroom. Find your people, follow your curiosity, and show up for something new.</p>
              <div className="hero-actions">
                <button className="button button-primary button-large" onClick={() => navigate('events')}>Find your next thing <ArrowRight size={18} /></button>
                <span className="hero-note"><span className="tiny-avatars"><i>J</i><i>A</i><i>M</i></span> Your people are already here</span>
              </div>
            </div>
            <div className="hero-artwork" aria-label="Abstract illustration celebrating campus events" role="img">
              <div className="hero-art-glow" />
              <div className="hero-art-label label-top"><span>EST. ON CAMPUS</span><b>20<span>26</span></b></div>
              <div className="hero-art-main"><span className="hero-art-ring ring-one" /><span className="hero-art-ring ring-two" /><span className="hero-art-disc" /><span className="hero-art-flower">✳</span><span className="hero-art-star">✦</span><span className="hero-art-sun" /></div>
              <div className="hero-art-label label-bottom"><span>GOOD THINGS</span><b>HAPPEN<br />TOGETHER ↗</b></div>
              <div className="hero-art-stamp">G<br />✳<br />R</div>
            </div>
            <div className="hero-bottomline"><span>YOUR CAMPUS, IN FULL COLOR</span><span>SCROLL TO EXPLORE <ArrowDownRight size={15} /></span><span>01 — 04</span></div>
          </section>

          <section className="stat-strip" aria-label="Community at a glance">
            <div><b>01</b><span>One campus.<br />Endless possibilities.</span></div>
            <div><b>{events.length.toString().padStart(2, '0')}</b><span>Ways to spend<br />your next free day.</span></div>
            <div><b>∞</b><span>Stories you’ll tell<br />after graduation.</span></div>
            <p>Less scrolling.<br /><em>More showing up.</em></p>
          </section>

          <EventsSection events={filteredEvents} allEvents={events} loading={loading} error={pageError} search={search} setSearch={setSearch} category={category} setCategory={setCategory} onOpen={setSelectedEvent} onRegister={registerForEvent} onRetry={loadEvents} />

          <section className="join-banner">
            <span className="eyebrow">A GOOD TIME IS BETTER SHARED</span>
            <h2>There’s a place for<br />you in the <em>middle of it.</em></h2>
            <p>Make your campus years count. It starts with showing up.</p>
            <button className="button button-light button-large" onClick={() => user ? navigate('events') : setAuthMode('register')}>{user ? 'Explore the calendar' : 'Get in on it'} <ArrowRight size={17} /></button>
            <span className="banner-star star-a">✳</span><span className="banner-star star-b">✦</span>
          </section>
        </main>
      )}

      {page === 'events' && (
        <main className="page-main">
          <div className="page-heading"><span className="eyebrow">THE CAMPUS CALENDAR</span><h1>Find your <em>thing.</em></h1><p>Something new is always happening. Your next favorite memory is on this list.</p></div>
          <EventsSection events={filteredEvents} allEvents={events} loading={loading} error={pageError} search={search} setSearch={setSearch} category={category} setCategory={setCategory} onOpen={setSelectedEvent} onRegister={registerForEvent} onRetry={loadEvents} />
        </main>
      )}

      {page === 'dashboard' && (
        <main className="page-main dashboard-page">
          <div className="page-heading"><span className="eyebrow">YOUR GATHER</span><h1>Your plans,<br /><em>coming together.</em></h1><p>Everything you’ve signed up for, all in one place.</p></div>
          <section className="dashboard-summary"><div className="dashboard-welcome"><span className="avatar avatar-large">{user?.name.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">WELCOME BACK</span><h2>{user?.name}</h2></div></div><div className="summary-stat"><Ticket size={19} /><b>{registrations.length}</b><span>events on your calendar</span></div></section>
          <div className="section-title-row"><div><span className="eyebrow">MARK YOUR CALENDAR</span><h2>Your upcoming events</h2></div><button className="text-action" onClick={() => navigate('events')}>Explore more <ArrowRight size={16} /></button></div>
          {registrations.length === 0 ? <EmptyState title="Your calendar has room to grow." text="Find something that makes you curious and save your spot." action="Explore events" onClick={() => navigate('events')} /> : <div className="registration-list">{registrations.map((registration) => <article className="registration-row" key={registration.registration_id}><div className="registration-date"><b>{new Date(registration.event_date).getDate()}</b><span>{new Date(registration.event_date).toLocaleString('en', { month: 'short' })}</span></div><div className="registration-info"><span className="event-meta-category">{registration.category}</span><h3>{registration.title}</h3><p><MapPin size={14} />{registration.venue}<span className="registration-time"><Clock3 size={14} />{formatTime(registration.event_date)}</span></p></div><button className="button button-outline cancel-button" onClick={() => cancelRegistration(registration)}>Cancel spot</button></article>)}</div>}
        </main>
      )}

      {page === 'profile' && (
        <main className="page-main profile-page">
          <div className="page-heading"><span className="eyebrow">YOUR CORNER OF CAMPUS</span><h1>A little about <em>you.</em></h1></div>
          <section className="profile-card"><span className="avatar profile-avatar">{user?.name.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">GATHER MEMBER</span><h2>{user?.name}</h2><p>{user?.email}</p><span className="role-pill">{user?.role === 'admin' ? 'Administrator' : 'Student'}</span></div><button className="button button-outline" onClick={() => navigate('dashboard')}>My events <ArrowRight size={16} /></button></section>
          <section className="profile-note"><Sparkles size={21} /><div><h3>Your campus story starts here.</h3><p>Explore events, meet people who love what you love, and make these years yours.</p></div><button className="text-action" onClick={() => navigate('events')}>Explore <ArrowRight size={15} /></button></section>
        </main>
      )}

      {page === 'admin' && user?.role === 'admin' && (
        <main className="page-main dashboard-page">
          <div className="page-heading admin-heading"><span className="eyebrow">GATHER / ADMIN</span><h1>Make something <em>happen.</em></h1><p>Keep the campus calendar full of things worth showing up for.</p><button className="button button-primary" onClick={() => setEditingEvent(null)}><Plus size={17} /> Add an event</button></div>
          <section className="admin-toolbar"><div><span className="eyebrow">EVENT INVENTORY</span><h2>{events.length} {events.length === 1 ? 'event' : 'events'}</h2></div><a className="button button-outline" href={`${API_BASE}/api/events.xml`} download><Download size={16} /> Export XML</a></section>
          {loading ? <LoadingState /> : pageError ? <ErrorState message={pageError} onRetry={loadEvents} /> : events.length === 0 ? <EmptyState title="Your event calendar is a blank canvas." text="Create an event to bring your campus together." action="Create event" onClick={() => setEditingEvent(null)} /> : <div className="admin-event-list">{events.map((event) => <article className="admin-event-row" key={event.id}><div className="admin-event-icon"><CalendarDays size={20} /></div><div className="admin-event-details"><span className="event-meta-category">{eventCategory(event)}</span><h3>{event.title}</h3><p>{formatDate(event.event_date, true)} · {event.venue}</p></div><span className="admin-count"><Users size={15} />{event.registration_count || 0}</span><div className="admin-event-actions"><button className="button button-outline" onClick={() => setSelectedEvent(event)}>View</button><button className="button button-outline" onClick={() => setEditingEvent(event)}>Edit</button><button className="button button-danger" onClick={() => deleteEvent(event)}>Delete</button></div></article>)}</div>}
        </main>
      )}

      <footer className="site-footer"><a className="brand" href="#home" onClick={(e) => { e.preventDefault(); navigate('home') }}><span className="brand-mark"><Sparkles size={16} /></span><span>gather<span className="brand-period">.</span></span></a><span>Made for the moments between classes.</span><span>© 2026 Gather Campus</span></footer>

      {selectedEvent && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSelectedEvent(null)}><section className="modal event-detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" onClick={() => setSelectedEvent(null)} aria-label="Close dialog"><X size={20} /></button><div className={`detail-art event-art event-art-${eventCategory(selectedEvent).toLowerCase()}`}><span className="art-orbit" /><span className="art-shape" /><span className="art-spark">✳</span><span className="art-word">{eventCategory(selectedEvent)}</span></div><span className="eyebrow detail-category">{eventCategory(selectedEvent)}</span><h2 id="detail-title">{selectedEvent.title}</h2><p className="detail-description">{selectedEvent.description}</p><div className="detail-facts"><span><CalendarDays size={17} /><span><b>{formatDate(selectedEvent.event_date)}</b><small>{formatTime(selectedEvent.event_date)}</small></span></span><span><MapPin size={17} /><span><b>{selectedEvent.venue}</b><small>On campus</small></span></span><span><Ticket size={17} /><span><b>{Number(selectedEvent.fee) > 0 ? `₹${Number(selectedEvent.fee).toLocaleString('en-IN')}` : 'Free entry'}</b><small>Per attendee</small></span></span></div><button className="button button-primary button-wide" onClick={() => registerForEvent(selectedEvent)} disabled={busyEvent === selectedEvent.id}>{busyEvent === selectedEvent.id ? 'Saving your spot…' : 'Save my spot'} <ArrowRight size={17} /></button></section></div>}
      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode('')} onModeChange={setAuthMode} onSuccess={(nextUser) => { setUser(nextUser); setAuthMode(''); setNotice(`Welcome${nextUser.name ? `, ${nextUser.name.split(' ')[0]}` : ''}!`) }} />}
      {editingEvent !== undefined && <EventFormModal event={editingEvent} onClose={() => setEditingEvent(undefined)} onSaved={async () => { setEditingEvent(undefined); await loadEvents(); setNotice(editingEvent ? 'Event updated.' : 'Event published.') }} />}
      {notice && <div className="toast" role="status"><Check size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
    </div>
  )
}

function EventsSection({ events, allEvents, loading, error, search, setSearch, category, setCategory, onOpen, onRegister, onRetry }) {
  return (
    <section className="events-section" id="events-list">
      <div className="section-heading">
        <div><span className="eyebrow">DON’T MISS THE GOOD STUFF</span><h2>On the <em>horizon.</em></h2></div>
        <p>Good things happen when you put yourself out there.<br />Here’s what’s coming up.</p>
      </div>
      <div className="event-controls">
        <label className="search-box"><Search size={18} /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find your kind of thing…" aria-label="Search events" /></label>
        <div className="category-filters" aria-label="Filter events by category">{categories.filter((item) => item === 'All events' || allEvents.some((event) => eventCategory(event) === item)).map((item) => <button key={item} className={category === item ? 'filter-chip selected' : 'filter-chip'} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <span className="event-result-count">{events.length} {events.length === 1 ? 'event' : 'events'}</span>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={onRetry} /> : events.length === 0 ? <EmptyState title="Nothing on the calendar just yet." text={search ? 'Try another search or category.' : 'Check back soon — good things are in the works.'} action={search || category !== 'All events' ? 'Clear filters' : undefined} onClick={() => { setSearch(''); setCategory('All events') }} /> : <div className="event-grid">{events.map((event) => <EventCard key={event.id} event={event} onOpen={onOpen} onRegister={onRegister} />)}</div>}
      <div className="events-footnote"><span>MORE GOOD THINGS ON THE WAY</span><span>{String(events.length).padStart(2, '0')} / {String(allEvents.length).padStart(2, '0')}</span></div>
    </section>
  )
}

function LoadingState() {
  return <div className="loading-state" role="status"><span className="spinner" />Finding the good stuff…</div>
}

function ErrorState({ message, onRetry }) {
  return <div className="empty-state error-state"><span className="empty-icon"><X size={20} /></span><h3>We couldn’t load the events.</h3><p>{message}</p><button className="button button-outline" onClick={onRetry}>Try again <ArrowRight size={15} /></button></div>
}

function EmptyState({ title, text, action, onClick }) {
  return <div className="empty-state"><span className="empty-icon"><CalendarDays size={20} /></span><h3>{title}</h3><p>{text}</p>{action && <button className="button button-outline" onClick={onClick}>{action} <ArrowRight size={15} /></button>}</div>
}

export default App
