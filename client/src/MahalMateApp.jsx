import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Check,
  CircleAlert, Clock3, Flower2, House, ListFilter, LogOut, MapPin, Menu, ParkingSquare, Plus, Printer, Search,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import {
  BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams,
} from 'react-router-dom'
import { api, xmlUrl } from './api.js'
import './MahalMate.css'

const AuthContext = createContext(null)
const fallbackImage = 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80'
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const TODAY = new Date().toISOString().slice(0, 10)
const CURRENT_YEAR = new Date().getFullYear()
const CANCELLATION_CUTOFF = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

function money(value) {
  return currency.format(Number(value || 0))
}

function dateLabel(value, options = {}) {
  if (!value) return 'Date to be confirmed'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Date to be confirmed' : new Intl.DateTimeFormat('en-IN', options).format(date)
}

function timeLabel(value) {
  if (!value) return ''
  const [hour = '0', minute = '0'] = String(value).split(':')
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Number(hour), Number(minute)))
}

function handleImageError(event) {
  const image = event.currentTarget
  if (image.dataset.fallbackTried) {
    image.hidden = true
    image.parentElement?.classList.add('image-placeholder')
    return
  }
  image.dataset.fallbackTried = 'true'
  image.src = fallbackImage
}

function useAuth() {
  return useContext(AuthContext)
}

function Flash({ message, onClose }) {
  if (!message) return null
  return <div className="flash" role="status"><CircleAlert size={18} />{message}<button onClick={onClose} aria-label="Dismiss message"><X size={17} /></button></div>
}

function Header() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setUser(null)
      navigate('/')
    } catch (error) {
      window.alert(error.message)
    }
  }
  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="MahalMate home">
        <span className="brand-icon"><Flower2 size={21} /></span>
        <span>Mahal<span>Mate</span><small>CELEBRATIONS, THOUGHTFULLY PLANNED</small></span>
      </Link>
      <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      <nav className={open ? 'main-nav nav-open' : 'main-nav'} aria-label="Main navigation">
        <Link onClick={() => setOpen(false)} to="/">Home</Link>
        <Link onClick={() => setOpen(false)} to="/mahals">Explore mahals</Link>
        <a onClick={() => setOpen(false)} href={`${import.meta.env.BASE_URL}#functions`}>Functions</a>
        {user && <Link onClick={() => setOpen(false)} to={user.role === 'admin' ? '/admin' : '/dashboard'}>{user.role === 'admin' ? 'Admin' : 'My bookings'}</Link>}
      </nav>
      <div className="header-actions">
        {user ? <>
          <Link className="header-user" to="/profile"><span className="user-avatar">{user.name?.slice(0, 1).toUpperCase()}</span><span>{user.name?.split(' ')[0]}</span></Link>
          <button className="button button-quiet" onClick={signOut}><LogOut size={16} /><span>Sign out</span></button>
        </> : <>
          <Link className="text-link" to="/login">Sign in</Link>
          <Link className="button button-maroon button-small" to="/register">Create account <ArrowUpRight size={16} /></Link>
        </>}
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <Link to="/" className="brand footer-brand"><span className="brand-icon"><Flower2 size={21} /></span><span>Mahal<span>Mate</span><small>CELEBRATIONS, THOUGHTFULLY PLANNED</small></span></Link>
        <p>Thoughtful spaces for life's most meaningful gatherings.</p>
        <div className="footer-links"><Link to="/mahals">Find a mahal</Link><a href={`${import.meta.env.BASE_URL}#how-it-works`}>How it works</a><a href={`${import.meta.env.BASE_URL}#contact`}>Contact</a></div>
      </div>
      <div className="footer-bottom"><span>© {CURRENT_YEAR} MahalMate</span><span>Sample listings are for demonstration only. No payment is collected on this website.</span></div>
    </footer>
  )
}

function MahalCard({ mahal }) {
  let amenities = []
  try { amenities = typeof mahal.amenities === 'string' ? JSON.parse(mahal.amenities) : mahal.amenities || [] } catch { amenities = [] }
  return (
    <article className="mahal-card">
      <Link to={`/mahals/${mahal.id}`} className="mahal-photo">
        <img src={mahal.image_url || fallbackImage} alt={`${mahal.name} sample venue`} onError={handleImageError} />
        <span className="sample-tag">SAMPLE LISTING</span>
        <span className="photo-arrow"><ArrowUpRight size={18} /></span>
      </Link>
      <div className="mahal-card-content">
        <div className="mahal-location"><MapPin size={14} />{mahal.location}</div>
        <h3><Link to={`/mahals/${mahal.id}`}>{mahal.name}</Link></h3>
        <p className="mahal-address">{mahal.address}</p>
        <div className="mahal-facts">
          <span><Users size={15} />{Number(mahal.capacity_min).toLocaleString('en-IN')}–{Number(mahal.capacity_max).toLocaleString('en-IN')} guests</span>
          <span><ParkingSquare size={15} />{mahal.parking_capacity || 0} parking</span>
        </div>
        <div className="amenities-line">{amenities.slice(0, 3).map((amenity) => <span key={amenity}>{amenity}</span>)}{mahal.ac_available ? <span>Air-conditioned</span> : null}</div>
        <div className="mahal-card-bottom"><div><small>STARTING FROM</small><strong>{money(mahal.base_price)}</strong><span>per {mahal.price_type === 'day' ? 'day' : 'booking'}</span></div><Link to={`/mahals/${mahal.id}`} className="round-link" aria-label={`View ${mahal.name}`}><ArrowRight size={18} /></Link></div>
      </div>
    </article>
  )
}

const previewFunctions = ['Wedding', 'Reception', 'Engagement', 'Birthday / Family Function']
const previewMahals = [
  { id: 1, name: '[Sample] Royal Courtyard Mahal', location: 'Chennai', capacity_min: 150, capacity_max: 800, base_price: 185000, price_type: 'booking', amenities: ['Bridal suite', 'In-house kitchen', 'Stage'], ac_available: 1, image_url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85' },
  { id: 2, name: '[Sample] Saffron Leaf Convention Hall', location: 'Bengaluru', capacity_min: 100, capacity_max: 600, base_price: 145000, price_type: 'booking', amenities: ['Dining hall', 'Air conditioning', 'Lift'], ac_available: 1, image_url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85' },
  { id: 3, name: '[Sample] Lotus Pavilion', location: 'Coimbatore', capacity_min: 80, capacity_max: 450, base_price: 98000, price_type: 'booking', amenities: ['Garden lawn', 'Kitchen', 'Stage'], ac_available: 1, image_url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85' },
]

function HomePage() {
  const navigate = useNavigate()
  const [functions, setFunctions] = useState(previewFunctions.map((name, id) => ({ id: id + 1, name })))
  const [mahals, setMahals] = useState(previewMahals)
  const [error, setError] = useState('')
  const [query, setQuery] = useState({ location: '', date: '', guests: '', function_id: '' })
  useEffect(() => {
    Promise.all([api('/api/functions'), api('/api/mahals?sort=price_asc')])
      .then(([types, listings]) => { setFunctions(types); setMahals(listings.slice(0, 3)) })
      .catch(() => { setFunctions(previewFunctions.map((name, id) => ({ id: id + 1, name }))); setMahals(previewMahals); setError('') })
  }, [])
  function searchMahals(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
    navigate(`/mahals?${params.toString()}`)
  }
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> THE SETTING FOR YOUR NEXT CHAPTER</span>
          <h1>Find the perfect mahal for your <em>special day.</em></h1>
          <p>Compare function halls, check the details, and send a booking request for the moments your family will remember.</p>
          <a className="hero-link" href="#popular">Explore sample venues <ArrowRight size={16} /></a>
        </div>
        <div className="hero-visual">
          <img src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1500&q=90" alt="Wedding mandap decorated with flowers" onError={handleImageError} />
          <div className="hero-visual-caption"><span>SPACE FOR EVERY KIND OF TOGETHER</span><b>Make the day feel like yours.</b></div>
          <span className="hero-seal"><Flower2 size={27} /><small>MADE FOR<br />MOMENTS</small></span>
        </div>
        <form className="search-panel" onSubmit={searchMahals}>
          <label><span><MapPin size={16} /> CITY OR LOCATION</span><input value={query.location} onChange={(event) => setQuery({ ...query, location: event.target.value })} placeholder="e.g. Chennai" /></label>
          <label><span><Flower2 size={16} /> FUNCTION TYPE</span><select value={query.function_id} onChange={(event) => setQuery({ ...query, function_id: event.target.value })}><option value="">Any occasion</option>{functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span><CalendarDays size={16} /> EVENT DATE</span><input type="date" min={TODAY} value={query.date} onChange={(event) => setQuery({ ...query, date: event.target.value })} /></label>
          <label><span><Users size={16} /> GUESTS</span><input type="number" min="1" max="100000" value={query.guests} onChange={(event) => setQuery({ ...query, guests: event.target.value })} placeholder="Approx. guests" /></label>
          <button className="button button-maroon search-button" type="submit"><Search size={18} /> Find a mahal</button>
        </form>
      </section>

      <section className="section category-section" id="functions">
        <div className="section-heading"><div><span className="eyebrow">A PLACE FOR EVERY MILESTONE</span><h2>What are you <em>celebrating?</em></h2></div><span className="heading-note">Seven ways to gather.<br />One place to begin.</span></div>
        {functions.length ? <div className="category-grid">{functions.map((item, index) => (
          <button className="category-tile" key={item.id || item.name} onClick={() => navigate(`/mahals?function_id=${item.id}`)}>
            <span className={`category-icon category-icon-${index % 7}`}><Flower2 size={21} /></span><strong>{item.name}</strong><small>{item.description}</small><ArrowUpRight size={16} className="category-arrow" />
          </button>
        ))}</div> : <div className={error ? 'error-box' : 'loading-box'}>{error || 'Loading function types…'}</div>}
      </section>

      <section className="section popular-section" id="popular">
        <div className="section-heading"><div><span className="eyebrow">A FEW PLACES TO START</span><h2>Popular sample <em>mahals.</em></h2></div><Link className="outlined-link" to="/mahals">Browse all mahals <ArrowRight size={16} /></Link></div>
        {error ? <div className="error-box">{error} <Link to="/mahals">Try browsing mahals</Link></div> : mahals.length
          ? <div className="mahal-grid">{mahals.map((item) => <MahalCard key={item.id} mahal={item} />)}</div>
          : <div className="loading-box">Loading sample listings…</div>}
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-heading"><span className="eyebrow">A LITTLE LESS STRESS, A LOT MORE JOY</span><h2>From first search<br />to <em>gathering.</em></h2><p>Clear information to help you plan your venue request with confidence.</p></div>
        <div className="steps">
          {[['01', 'Find your fit', 'Filter sample venues by city, guests, facilities, and budget.'], ['02', 'Choose your details', 'Select your occasion, date, time, and any optional services.'], ['03', 'Send a request', 'Review your estimated price and request approval from an admin.']].map(([number, title, text]) => <div className="step" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>)}
        </div>
      </section>
      <section className="trust-note"><ShieldCheck size={22} /><p><strong>Clear and honest by design.</strong> The halls and service prices currently shown are sample data. Booking requests remain pending until an administrator approves them. No payment is processed here.</p></section>
      <section className="faq-section" id="faq"><div><span className="eyebrow">A FEW HELPFUL ANSWERS</span><h2>Good to <em>know.</em></h2><p>Clear expectations make planning feel easier.</p></div><div className="faq-list">
        <details><summary>Are these real marriage halls?</summary><p>No. All included venues, addresses, prices, images, and services are sample project data and do not represent real businesses or availability.</p></details>
        <details><summary>Is my booking immediately confirmed?</summary><p>No. A new booking request is marked Pending until an administrator reviews it. Pending and confirmed requests reserve overlapping time slots in the sample system.</p></details>
        <details><summary>Can I pay through MahalMate?</summary><p>No payment gateway is connected. The total shown is only an estimated sample price; do not send payment using this website.</p></details>
        <details><summary>How do cancellations work?</summary><p>Customers can cancel pending requests at any time. A confirmed booking can be cancelled at least seven days before its date.</p></details>
      </div></section>
      <section className="contact-section" id="contact"><div><span className="eyebrow">QUESTIONS BEFORE YOU BEGIN?</span><h2>Let's make room<br />for <em>your moment.</em></h2></div><p>For this demonstration project, contact details are not published. Please reach out to the person who manages your MahalMate installation.</p></section>
    </main>
  )
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState({
    location: searchParams.get('location') || '', function_id: searchParams.get('function_id') || '',
    date: searchParams.get('date') || '', guests: searchParams.get('guests') || '',
    min_price: searchParams.get('min_price') || '', max_price: searchParams.get('max_price') || '',
    ac: searchParams.get('ac') || '', parking: searchParams.get('parking') || '',
    accommodation: searchParams.get('accommodation') || '', sort: searchParams.get('sort') || 'price_asc',
  })
  const [functions, setFunctions] = useState([])
  const [mahals, setMahals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const query = searchParams.toString()
  useEffect(() => { api('/api/functions').then(setFunctions).catch((err) => setError(err.message)) }, [])
  useEffect(() => {
    let active = true
    api(`/api/mahals?${query}`).then((data) => { if (active) { setMahals(data); setError('') } })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query])
  function updateSearch(event) {
    event.preventDefault()
    const next = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) next.set(key, value) })
    setLoading(true)
    setSearchParams(next)
  }
  function change(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  return (
    <main className="page-wrap">
      <div className="page-title"><span className="eyebrow">EXPLORE THE COLLECTION</span><h1>Find a place for <em>your people.</em></h1><p>Compare sample listings by location, guest capacity, budget, and facilities.</p></div>
      <form className="filters-card" onSubmit={updateSearch}>
        <label>City or location<input value={filters.location} onChange={(event) => change('location', event.target.value)} placeholder="Any city" /></label>
        <label>Function type<select value={filters.function_id} onChange={(event) => change('function_id', event.target.value)}><option value="">Any occasion</option>{functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Booking date<input type="date" min={TODAY} value={filters.date} onChange={(event) => change('date', event.target.value)} /></label>
        <label>Guest count<input type="number" min="1" max="100000" value={filters.guests} onChange={(event) => change('guests', event.target.value)} placeholder="Any size" /></label>
        <label>Minimum budget<input type="number" min="0" step="500" value={filters.min_price} onChange={(event) => change('min_price', event.target.value)} placeholder="₹0" /></label>
        <label>Maximum budget<input type="number" min="0" step="500" value={filters.max_price} onChange={(event) => change('max_price', event.target.value)} placeholder="No limit" /></label>
        <label>Sort by<select value={filters.sort} onChange={(event) => change('sort', event.target.value)}><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select></label>
        <div className="filter-toggles">
          {[['ac', 'Air conditioning'], ['parking', 'Parking'], ['accommodation', 'Accommodation']].map(([key, label]) => <label className="check-control" key={key}><input type="checkbox" checked={filters[key] === 'true'} onChange={(event) => change(key, event.target.checked ? 'true' : '')} />{label}</label>)}
        </div>
        <button className="button button-maroon" type="submit"><ListFilter size={17} /> Apply filters</button>
      </form>
      <div className="results-heading"><div><span className="eyebrow">{loading ? 'SEARCHING' : `${mahals.length} SAMPLE VENUE${mahals.length === 1 ? '' : 'S'}`}</span><h2>Mahals for your occasion</h2></div><span>Prices and availability are examples only.</span></div>
      {error && <div className="error-box" role="alert">{error}</div>}
      {loading ? <div className="loading-box">Finding matching mahals…</div> : mahals.length ? <div className="mahal-grid">{mahals.map((mahal) => <MahalCard key={mahal.id} mahal={mahal} />)}</div> : <div className="empty-state"><House size={34} /><h3>No matching sample mahals</h3><p>Try changing the city, budget, or guest count filters.</p></div>}
    </main>
  )
}

function MahalPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [mahal, setMahal] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api(`/api/mahals/${id}`).then(setMahal).catch((err) => setError(err.message))
  }, [id])
  if (error) return <main className="page-wrap"><div className="error-box">{error}</div></main>
  if (!mahal) return <main className="page-wrap"><div className="loading-box">Loading mahal details…</div></main>
  let amenities = []
  try { amenities = typeof mahal.amenities === 'string' ? JSON.parse(mahal.amenities) : mahal.amenities || [] } catch { amenities = [] }
  return (
    <main className="page-wrap detail-page">
      <Link to="/mahals" className="back-link">← Back to mahals</Link>
      <div className="detail-hero"><img src={mahal.image_url || fallbackImage} alt={`${mahal.name} sample venue`} onError={handleImageError} /><span className="sample-tag">SAMPLE LISTING</span></div>
      <div className="detail-columns">
        <section className="detail-copy">
          <div className="mahal-location"><MapPin size={15} />{mahal.location}</div><h1>{mahal.name}</h1><p className="detail-address">{mahal.address}</p>
          <p className="detail-description">{mahal.description}</p>
          <h2>Venue details</h2>
          <div className="detail-facts"><span><Users /> Capacity <b>{Number(mahal.capacity_min).toLocaleString('en-IN')}–{Number(mahal.capacity_max).toLocaleString('en-IN')}</b></span><span><ParkingSquare /> Parking <b>{mahal.parking_capacity} vehicles</b></span><span><Sparkles /> Air conditioning <b>{mahal.ac_available ? 'Available' : 'Not available'}</b></span><span><House /> Accommodation <b>{mahal.accommodation_available ? 'Available' : 'Not available'}</b></span></div>
          <h2>Facilities</h2><div className="amenities-grid">{amenities.map((item) => <span key={item}><Check size={15} />{item}</span>)}</div>
          <div className="sample-disclaimer"><CircleAlert size={17} />This is a sample venue listing for project demonstration. Contact details and availability are not real.</div>
        </section>
        <aside className="booking-aside"><span className="eyebrow">SAMPLE PRICE</span><strong>{money(mahal.base_price)}</strong><small>per {mahal.price_type === 'day' ? 'day' : 'booking'} · final estimate depends on selected services</small><div className="aside-rule" /><p><MapPin size={16} />{mahal.location}</p><p><Users size={16} />Up to {Number(mahal.capacity_max).toLocaleString('en-IN')} guests</p><Link className="button button-maroon button-wide" to={`/book/${mahal.id}${searchParams.get('date') ? `?date=${searchParams.get('date')}` : ''}`}>Request to book <ArrowRight size={17} /></Link><small className="pending-note">Booking requests need admin approval. No payment is taken.</small></aside>
      </div>
    </main>
  )
}

function AuthPage({ mode }) {
  const registering = mode === 'register'
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form.entries())
    if (registering && values.password !== values.confirm_password) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await api(`/api/auth/${registering ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(values) })
      setUser(result.user)
      navigate(result.user.role === 'admin' ? '/admin' : '/dashboard')
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />
  return (
    <main className="auth-layout">
      <section className="auth-visual"><span className="eyebrow">A PLACE FOR YOUR PEOPLE</span><h1>Good days are better <em>gathered.</em></h1><p>Find a sample venue, make a request, and keep your plans together.</p><div className="auth-ornament"><Flower2 size={108} /></div></section>
      <section className="auth-card"><span className="eyebrow">{registering ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span><h2>{registering ? 'Let’s get planning.' : 'Sign in to continue.'}</h2><p>{registering ? 'Keep track of your mahal enquiries in one place.' : 'Your booking requests are waiting here.'}</p>
        <form className="form-stack" onSubmit={submit}>
          {registering && <label>Full name<input name="name" autoComplete="name" required maxLength="120" placeholder="Your full name" /></label>}
          {registering && <label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength="30" placeholder="+91 98765 43210" /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength="255" placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 8 : undefined} maxLength="72" placeholder={registering ? 'At least 8 characters' : 'Your password'} /></label>
          {registering && <label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" required minLength="8" maxLength="72" placeholder="Enter your password again" /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-maroon button-wide" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
        </form>
        <p className="auth-switch">{registering ? 'Already registered?' : 'New to MahalMate?'} <Link to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</Link></p>
      </section>
    </main>
  )
}

function ServicePicker({ services, selected, setSelected, guestCount }) {
  return <div className="service-options">{services.map((service) => {
    const current = selected.find((item) => item.service_id === service.id)
    const perGuest = service.name.toLowerCase().includes('(per guest)')
    return <label className={current ? 'service-option selected' : 'service-option'} key={service.id}>
      <input type="checkbox" checked={Boolean(current)} onChange={(event) => setSelected(event.target.checked
        ? [...selected, { service_id: service.id, quantity: 1 }]
        : selected.filter((item) => item.service_id !== service.id))} />
      <span className="service-check">{current ? <Check size={14} /> : null}</span>
      <span><strong>{service.name}</strong><small>{service.description}</small></span>
      <b>{money(Number(service.price) * (perGuest ? Number(guestCount || 0) : 1))}{perGuest ? <small> estimate</small> : null}</b>
    </label>
  })}</div>
}

function BookingPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mahal, setMahal] = useState(null)
  const [functions, setFunctions] = useState([])
  const [services, setServices] = useState([])
  const [selectedServices, setSelectedServices] = useState([])
  const [availability, setAvailability] = useState(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(false)
  const [values, setValues] = useState({
    booking_date: searchParams.get('date') || '', start_time: '10:00', end_time: '18:00',
    function_type_id: '', guest_count: '', special_requirements: '',
  })
  useEffect(() => {
    Promise.all([api(`/api/mahals/${id}`), api('/api/functions'), api('/api/services')])
      .then(([place, functionTypes, additionalServices]) => {
        setMahal(place); setFunctions(functionTypes); setServices(additionalServices)
        setValues((current) => ({ ...current, function_type_id: functionTypes[0]?.id || '', guest_count: place.capacity_min }))
      }).catch((err) => setError(err.message))
  }, [id])
  useEffect(() => {
    if (!values.booking_date || !values.start_time || !values.end_time || values.start_time >= values.end_time) return undefined
    let active = true
    const params = new URLSearchParams({
      date: values.booking_date,
      start_time: values.start_time,
      end_time: values.end_time,
    })
    api(`/api/mahals/${id}/availability?${params}`)
      .then((result) => { if (active) setAvailability(result) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setAvailabilityLoading(false) })
    return () => { active = false }
  }, [id, values.booking_date, values.start_time, values.end_time])
  const estimated = useMemo(() => {
    if (!mahal) return 0
    return Number(mahal.base_price) + selectedServices.reduce((total, selected) => {
      const service = services.find((item) => item.id === selected.service_id)
      if (!service) return total
      const quantity = service.name.toLowerCase().includes('(per guest)') ? Number(values.guest_count || 0) : selected.quantity
      return total + Number(service.price) * quantity
    }, 0)
  }, [mahal, selectedServices, services, values.guest_count])
  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!review) { setReview(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true)
    try {
      const result = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...values, mahal_id: Number(id), guest_count: Number(values.guest_count), services: selectedServices }),
      })
      navigate(`/bookings/${result.id}/confirmation`)
    } catch (err) {
      setError(err.message)
      setReview(false)
    } finally { setBusy(false) }
  }
  if (error && !mahal) return <main className="page-wrap"><div className="error-box">{error}</div></main>
  if (!mahal) return <main className="page-wrap"><div className="loading-box">Preparing your booking request…</div></main>
  const chosenFunction = functions.find((item) => Number(item.id) === Number(values.function_type_id))
  return (
    <main className="page-wrap booking-page">
      <Link to={`/mahals/${id}`} className="back-link">← Back to mahal</Link>
      <div className="page-title"><span className="eyebrow">BOOKING REQUEST</span><h1>{review ? 'Review your ' : 'Plan your '}<em>celebration.</em></h1><p>Your request will be pending until an administrator reviews it.</p></div>
      <form className="booking-layout" onSubmit={submit}>
        <div className="booking-form-card">
          {review ? <section className="review-summary">
            <h2>Please check your details</h2><p>Nothing is reserved until you send this request and an administrator approves it.</p>
            <dl><div><dt>Mahal</dt><dd>{mahal.name} · {mahal.location}</dd></div><div><dt>Function</dt><dd>{chosenFunction?.name || 'Select a function'}</dd></div><div><dt>Date</dt><dd>{dateLabel(values.booking_date, { dateStyle: 'long' })}</dd></div><div><dt>Time</dt><dd>{timeLabel(values.start_time)}–{timeLabel(values.end_time)}</dd></div><div><dt>Expected guests</dt><dd>{values.guest_count}</dd></div><div><dt>Customer</dt><dd>{user.name} · {user.phone} · {user.email}</dd></div><div><dt>Additional requirements</dt><dd>{values.special_requirements || 'None provided'}</dd></div></dl>
            <h3>Estimated itemized price</h3><PriceBreakdown mahal={mahal} services={services} selected={selectedServices} guestCount={values.guest_count} total={estimated} />
          </section> : <>
            <div className="booking-venue"><img src={mahal.image_url || fallbackImage} alt="" onError={handleImageError} /><div><small>YOUR SELECTED SAMPLE MAHAL</small><strong>{mahal.name}</strong><span><MapPin size={14} />{mahal.location}</span></div></div>
            <h2>Function details</h2>
            <div className="form-grid">
              <label>Function type<select required value={values.function_type_id} onChange={(event) => setValues({ ...values, function_type_id: event.target.value })}><option value="">Choose an occasion</option>{functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Function date<input type="date" required min={TODAY} value={values.booking_date} onChange={(event) => { setAvailability(null); setAvailabilityLoading(true); setValues({ ...values, booking_date: event.target.value }) }} /></label>
              <label>Start time<input type="time" required value={values.start_time} onChange={(event) => { setAvailability(null); setAvailabilityLoading(true); setValues({ ...values, start_time: event.target.value }) }} /></label>
              <label>End time<input type="time" required value={values.end_time} onChange={(event) => { setAvailability(null); setAvailabilityLoading(true); setValues({ ...values, end_time: event.target.value }) }} /></label>
              <p className={`slot-message ${availability?.available ? 'slot-open' : availability ? 'slot-busy' : ''}`} role="status">{availabilityLoading ? 'Checking this time slot…' : availability?.available ? 'This time slot is currently available. It will be checked again when you submit.' : availability ? 'This time overlaps another pending or confirmed booking. Please choose a different time.' : 'Choose a date and valid times to check availability.'}</p>
              <label>Expected guests<input type="number" required min={mahal.capacity_min} max={mahal.capacity_max} value={values.guest_count} onChange={(event) => setValues({ ...values, guest_count: event.target.value })} /></label>
              <label className="field-wide">Your name<input value={user.name} readOnly /></label>
              <label>Email address<input value={user.email} readOnly /></label>
              <label>Phone number<input value={user.phone} readOnly /></label>
              <label className="field-wide">Special requirements<textarea maxLength="3000" rows="3" value={values.special_requirements} onChange={(event) => setValues({ ...values, special_requirements: event.target.value })} placeholder="Anything you would like the venue to know?" /></label>
            </div>
            <h2 className="section-form-heading">Optional services</h2><p className="field-hint">Example prices from the database. Per-guest services use your expected guest count.</p>
            <ServicePicker services={services} selected={selectedServices} setSelected={setSelectedServices} guestCount={values.guest_count} />
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="booking-actions">
            {review && <button type="button" className="button button-outline" onClick={() => setReview(false)}>Edit details</button>}
            <button className="button button-maroon" type="submit" disabled={busy || availabilityLoading || !availability?.available}>{busy ? 'Sending request…' : review ? 'Confirm booking request' : 'Review booking'} <ArrowRight size={17} /></button>
          </div>
        </div>
        <aside className="price-card"><span className="eyebrow">ESTIMATED TOTAL</span><strong>{money(estimated)}</strong><small>All prices are sample estimates. No tax is configured.</small><PriceBreakdown mahal={mahal} services={services} selected={selectedServices} guestCount={values.guest_count} total={estimated} /><div className="pending-note"><Clock3 size={16} />Request status will be pending admin approval.</div><p className="no-payment">No payment gateway is connected. Do not send money for this demo project.</p></aside>
      </form>
    </main>
  )
}

function PriceBreakdown({ mahal, services, selected, guestCount, total }) {
  return <div className="price-breakdown"><div><span>Mahal base price</span><b>{money(mahal.base_price)}</b></div>{selected.map((item) => {
    const service = services.find((value) => value.id === item.service_id)
    if (!service) return null
    const quantity = service.name.toLowerCase().includes('(per guest)') ? Number(guestCount || 0) : item.quantity
    return <div key={item.service_id}><span>{service.name}{quantity > 1 ? ` × ${quantity}` : ''}</span><b>{money(Number(service.price) * quantity)}</b></div>
  })}<div className="price-total"><span>Estimated total</span><b>{money(total)}</b></div><small>Taxes not applied; they are not configured for this demo.</small></div>
}

function BookingConfirmation() {
  const { id } = useParams()
  const { user } = useAuth()
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api(`/api/bookings/${id}`).then(setBooking).catch((err) => setError(err.message)) }, [id])
  if (error) return <main className="page-wrap"><div className="error-box">{error}</div></main>
  if (!booking) return <main className="page-wrap"><div className="loading-box">Loading booking confirmation…</div></main>
  return (
    <main className="page-wrap confirmation-page">
      <section className="confirmation-card">
        <div className="success-mark"><Check size={30} /></div><span className="eyebrow">REQUEST RECEIVED</span><h1>Your celebration plan is <em>underway.</em></h1>
        <p className="confirmation-lead">Your request has been saved. It is <StatusBadge status={booking.status} /> until an administrator reviews it. This is not a payment confirmation.</p>
        <div className="reference-line"><span>BOOKING REFERENCE</span><strong>{booking.booking_reference}</strong></div>
        <div className="receipt">
          <div className="receipt-heading"><div><small>BOOKING CONFIRMATION</small><h2>{booking.mahal_name}</h2><span>{booking.mahal_address}</span></div><BadgeCheck size={26} /></div>
          <div className="receipt-grid"><div><small>CUSTOMER</small><b>{booking.customer_name || user.name}</b><span>{booking.customer_email || user.email}</span><span>{booking.customer_phone || user.phone}</span></div><div><small>FUNCTION</small><b>{booking.function_name}</b><span>{dateLabel(booking.booking_date, { dateStyle: 'long' })}</span><span>{timeLabel(booking.start_time)} – {timeLabel(booking.end_time)}</span></div><div><small>EXPECTED GUESTS</small><b>{booking.guest_count}</b></div><div><small>BOOKING STATUS</small><StatusBadge status={booking.status} /></div></div>
          <div className="receipt-price"><div><span>Mahal base price</span><b>{money(booking.subtotal)}</b></div>{booking.services?.map((service) => <div key={service.service_id}><span>{service.name} × {service.quantity}</span><b>{money(service.total_price)}</b></div>)}<div><span>Tax</span><b>{money(booking.tax_amount)}</b></div><div className="price-total"><span>Estimated total</span><b>{money(booking.total_amount)}</b></div></div>
          <div className="receipt-created">Request created {new Date(booking.created_at).toLocaleString('en-IN')}</div>
        </div>
        <div className="confirmation-actions"><button className="button button-outline" onClick={() => window.print()}><Printer size={17} /> Print confirmation</button><a className="button button-outline" href={xmlUrl(booking.id)}>Download XML</a><Link className="button button-maroon" to="/dashboard">Go to my bookings</Link></div>
      </section>
    </main>
  )
}

function StatusBadge({ status }) {
  const text = { pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected', cancelled: 'Cancelled' }[status] || status
  return <span className={`status-badge status-${status}`}>{text}</span>
}

function DashboardPage() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const load = () => api('/api/bookings/my').then(setBookings).then(() => setError('')).catch((err) => setError(err.message))
  useEffect(() => {
    let active = true
    api('/api/bookings/my').then((data) => { if (active) setBookings(data) })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [])
  async function cancel(booking) {
    if (!window.confirm(`Cancel booking ${booking.booking_reference}?`)) return
    try { await api(`/api/bookings/${booking.id}/cancel`, { method: 'PATCH' }); await load() } catch (err) { setError(err.message) }
  }
  const upcoming = bookings.filter((booking) => String(booking.booking_date).slice(0, 10) >= TODAY)
  const past = bookings.filter((booking) => !upcoming.includes(booking))
  return (
    <main className="page-wrap dashboard-page">
      <div className="dashboard-welcome"><div><span className="eyebrow">YOUR MAHALMATE ACCOUNT</span><h1>Welcome, <em>{user.name.split(' ')[0]}.</em></h1><p>Keep your family celebrations and venue enquiries in one place.</p></div><Link className="button button-maroon" to="/mahals">Find a mahal <ArrowRight size={16} /></Link></div>
      <div className="dashboard-stats"><div><span>ALL REQUESTS</span><strong>{bookings.length}</strong></div><div><span>PENDING</span><strong>{bookings.filter((b) => b.status === 'pending').length}</strong></div><div><span>CONFIRMED</span><strong>{bookings.filter((b) => b.status === 'confirmed').length}</strong></div></div>
      {error && <div className="error-box">{error}</div>}
      <BookingList title="Upcoming bookings" bookings={upcoming} onCancel={cancel} />
      <BookingList title="Past bookings" bookings={past} onCancel={cancel} />
      <section className="profile-summary"><span className="eyebrow">PROFILE</span><h2>{user.name}</h2><p>{user.email} · {user.phone}</p><Link to="/profile" className="text-link">View profile <ArrowRight size={15} /></Link></section>
    </main>
  )
}

function BookingList({ title, bookings, onCancel, admin = false, onStatus }) {
  return <section className="booking-list-section"><div className="list-heading"><h2>{title}</h2><span>{bookings.length} booking{bookings.length === 1 ? '' : 's'}</span></div>
    {!bookings.length ? <div className="empty-state compact"><CalendarDays size={27} /><h3>No bookings here yet</h3><p>Your booking requests will show up here.</p></div> : <div className="booking-table-wrap"><table className="booking-table"><thead><tr><th>Reference</th><th>Mahal & function</th><th>Date & time</th><th>Guests</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td><strong>{booking.booking_reference}</strong></td><td>{booking.mahal_name}<small>{booking.function_name}</small>{admin && booking.customer_name && <small>Customer: {booking.customer_name}</small>}</td><td>{dateLabel(booking.booking_date, { dateStyle: 'medium' })}<small>{timeLabel(booking.start_time)} – {timeLabel(booking.end_time)}</small></td><td>{booking.guest_count}</td><td>{money(booking.total_amount)}</td><td><StatusBadge status={booking.status} /></td><td className="table-actions"><Link to={`/bookings/${booking.id}/confirmation`}>Details</Link>{admin ? <><button onClick={() => onStatus(booking.id, 'confirmed')} disabled={booking.status !== 'pending'}>Approve</button><button onClick={() => onStatus(booking.id, 'rejected')} disabled={booking.status !== 'pending'}>Reject</button></> : <>{(booking.status === 'pending' || (booking.status === 'confirmed' && String(booking.booking_date).slice(0, 10) >= CANCELLATION_CUTOFF)) && <button onClick={() => onCancel(booking)}>Cancel</button>}<a href={xmlUrl(booking.id)}>XML</a></>}</td></tr>)}</tbody></table></div>}
  </section>
}

function ProfilePage() {
  const { user } = useAuth()
  return <main className="page-wrap profile-page"><span className="eyebrow">YOUR PROFILE</span><h1>Account <em>details.</em></h1><div className="profile-card"><span className="profile-large-avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><h2>{user.name}</h2><p>{user.email}</p><p>{user.phone}</p><span className="role-label">{user.role === 'admin' ? 'Administrator' : 'Customer'}</span></div></div><p className="field-hint">For account detail changes, contact your site administrator.</p></main>
}

function MahalAdminForm({ initial, onCancel, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    values.capacity_min = Number(values.capacity_min)
    values.capacity_max = Number(values.capacity_max)
    values.base_price = Number(values.base_price)
    values.parking_capacity = Number(values.parking_capacity)
    values.ac_available = values.ac_available === 'on'
    values.accommodation_available = values.accommodation_available === 'on'
    values.amenities = values.amenities.split(',').map((value) => value.trim()).filter(Boolean)
    setBusy(true)
    try {
      await api(initial ? `/api/admin/mahals/${initial.id}` : '/api/admin/mahals', { method: initial ? 'PUT' : 'POST', body: JSON.stringify(values) })
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  let amenityValue = ''
  try { amenityValue = Array.isArray(initial?.amenities) ? initial.amenities.join(', ') : JSON.parse(initial?.amenities || '[]').join(', ') } catch { amenityValue = '' }
  return <form className="admin-form-card" onSubmit={submit}><div className="list-heading"><h2>{initial ? 'Edit sample mahal' : 'Add a mahal'}</h2><button className="icon-button" type="button" onClick={onCancel} aria-label="Close form"><X size={17} /></button></div>
    <div className="form-grid"><label>Name<input name="name" defaultValue={initial?.name || ''} required maxLength="160" /></label><label>City<input name="location" defaultValue={initial?.location || ''} required /></label><label className="field-wide">Address<input name="address" defaultValue={initial?.address || ''} required /></label><label className="field-wide">Description<textarea name="description" defaultValue={initial?.description || ''} required rows="3" /></label><label>Minimum guests<input type="number" name="capacity_min" defaultValue={initial?.capacity_min || 50} required min="1" /></label><label>Maximum guests<input type="number" name="capacity_max" defaultValue={initial?.capacity_max || 500} required min="1" /></label><label>Base price (₹)<input type="number" name="base_price" defaultValue={initial?.base_price || 100000} min="0" step="0.01" required /></label><label>Pricing<select name="price_type" defaultValue={initial?.price_type || 'booking'}><option value="booking">Per booking</option><option value="day">Per day</option></select></label><label>Parking capacity<input type="number" name="parking_capacity" defaultValue={initial?.parking_capacity || 0} min="0" /></label><label>Contact phone<input name="contact_phone" defaultValue={initial?.contact_phone || ''} /></label><label className="field-wide">Image URL<input type="url" name="image_url" defaultValue={initial?.image_url || ''} /></label><label className="field-wide">Amenities (comma separated)<input name="amenities" defaultValue={amenityValue} /></label><label className="check-control"><input type="checkbox" name="ac_available" defaultChecked={Boolean(initial?.ac_available)} /> Air conditioning</label><label className="check-control"><input type="checkbox" name="accommodation_available" defaultChecked={Boolean(initial?.accommodation_available)} /> Accommodation available</label></div>
    {error && <p className="form-error">{error}</p>}<div className="booking-actions"><button type="button" className="button button-outline" onClick={onCancel}>Cancel</button><button disabled={busy} className="button button-maroon">{busy ? 'Saving…' : 'Save mahal'}</button></div>
  </form>
}

function FunctionAdminForm({ initial, onCancel, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    setBusy(true)
    setError('')
    try {
      await api(initial ? `/api/admin/functions/${initial.id}` : '/api/admin/functions', {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      })
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <form className="admin-form-card" onSubmit={submit}>
    <div className="list-heading"><h2>{initial ? 'Edit function type' : 'Add function type'}</h2><button className="icon-button" type="button" onClick={onCancel} aria-label="Close form"><X size={17} /></button></div>
    <div className="form-grid"><label>Name<input name="name" defaultValue={initial?.name || ''} required maxLength="100" /></label><label className="field-wide">Description<input name="description" defaultValue={initial?.description || ''} required maxLength="500" /></label><label className="field-wide">Image URL<input type="url" name="image_url" defaultValue={initial?.image_url || ''} /></label></div>
    {error && <p className="form-error">{error}</p>}
    <div className="booking-actions"><button type="button" className="button button-outline" onClick={onCancel}>Cancel</button><button disabled={busy} className="button button-maroon">{busy ? 'Saving…' : 'Save function type'}</button></div>
  </form>
}

function AdminPage() {
  const [summary, setSummary] = useState(null)
  const [bookings, setBookings] = useState([])
  const [mahals, setMahals] = useState([])
  const [services, setServices] = useState([])
  const [functions, setFunctions] = useState([])
  const [tab, setTab] = useState('bookings')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('pending')
  const [error, setError] = useState('')
  const [serviceForm, setServiceForm] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [functionForm, setFunctionForm] = useState(false)
  const [editingFunction, setEditingFunction] = useState(null)
  const [bookingDateFilter, setBookingDateFilter] = useState('')
  const [bookingMahalFilter, setBookingMahalFilter] = useState('')
  const [bookingCustomerFilter, setBookingCustomerFilter] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [serviceBusy, setServiceBusy] = useState(false)
  async function loadAll() {
    try {
      const [counts, requests, places, addOns, occasions] = await Promise.all([
        api('/api/admin/summary'), api('/api/admin/bookings'), api('/api/mahals'), api('/api/services'), api('/api/functions'),
      ])
      setSummary(counts); setBookings(requests); setMahals(places); setServices(addOns); setFunctions(occasions); setError('')
    } catch (err) { setError(err.message) }
  }
  useEffect(() => {
    let active = true
    Promise.all([
      api('/api/admin/summary'), api('/api/admin/bookings'), api('/api/mahals'), api('/api/services'), api('/api/functions'),
    ]).then(([counts, requests, places, addOns, occasions]) => {
      if (!active) return
      setSummary(counts); setBookings(requests); setMahals(places); setServices(addOns); setFunctions(occasions)
    }).catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [])
  async function setStatus(id, status) {
    try { await api(`/api/admin/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadAll() } catch (err) { setError(err.message) }
  }
  async function deleteMahal(mahal) {
    if (!window.confirm(`Hide ${mahal.name}? Existing booking records will be preserved.`)) return
    try { await api(`/api/admin/mahals/${mahal.id}`, { method: 'DELETE' }); await loadAll() } catch (err) { setError(err.message) }
  }
  async function saveService(event) {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries())
    setServiceBusy(true); setServiceError('')
    try {
      await api(editingService ? `/api/admin/services/${editingService.id}` : '/api/admin/services', {
        method: editingService ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      setServiceForm(false); setEditingService(null); await loadAll()
    } catch (err) { setServiceError(err.message) } finally { setServiceBusy(false) }
  }
  async function deleteService(service) {
    if (!window.confirm(`Hide service "${service.name}" from new bookings? Existing bookings will be preserved.`)) return
    try { await api(`/api/admin/services/${service.id}`, { method: 'DELETE' }); await loadAll() } catch (err) { setError(err.message) }
  }
  async function deleteFunction(item) {
    if (!window.confirm(`Hide function type "${item.name}" from new booking requests?`)) return
    try { await api(`/api/admin/functions/${item.id}`, { method: 'DELETE' }); await loadAll() } catch (err) { setError(err.message) }
  }
  async function applyBookingFilters(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (bookingDateFilter) params.set('date', bookingDateFilter)
    if (bookingMahalFilter) params.set('mahal_id', bookingMahalFilter)
    if (bookingCustomerFilter.trim()) params.set('customer', bookingCustomerFilter.trim())
    try { setBookings(await api(`/api/admin/bookings?${params}`)); setError('') } catch (err) { setError(err.message) }
  }
  const shownBookings = bookings.filter((booking) => filter === 'all' || booking.status === filter)
  return (
    <main className="page-wrap admin-page">
      <div className="dashboard-welcome"><div><span className="eyebrow">MAHALMATE ADMIN</span><h1>Manage your <em>venue desk.</em></h1><p>Review booking requests and manage sample listing data.</p></div><ShieldCheck size={36} className="admin-shield" /></div>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="admin-stats">{[['TOTAL MAHALS', summary?.total_mahals], ['ALL BOOKINGS', summary?.total_bookings], ['PENDING APPROVALS', summary?.pending_bookings], ['CONFIRMED', summary?.confirmed_bookings], ['CANCELLED', summary?.cancelled_bookings]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</div>
      <div className="admin-tabs" role="tablist">{[['bookings', 'Bookings'], ['mahals', 'Mahals'], ['services', 'Services'], ['functions', 'Function types']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === 'bookings' && <section className="admin-panel"><div className="list-heading"><div><h2>Booking requests</h2><p>Pending requests reserve their selected time while awaiting approval.</p></div><label className="compact-label">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="all">All statuses</option></select></label></div><form className="admin-booking-filters" onSubmit={applyBookingFilters}><label>Date<input type="date" value={bookingDateFilter} onChange={(event) => setBookingDateFilter(event.target.value)} /></label><label>Mahal<select value={bookingMahalFilter} onChange={(event) => setBookingMahalFilter(event.target.value)}><option value="">All mahals</option>{mahals.map((mahal) => <option key={mahal.id} value={mahal.id}>{mahal.name}</option>)}</select></label><label>Customer<input value={bookingCustomerFilter} onChange={(event) => setBookingCustomerFilter(event.target.value)} placeholder="Name or email" /></label><button className="button button-outline button-small">Apply filters</button><button className="button button-quiet button-small" type="button" onClick={() => { setBookingDateFilter(''); setBookingMahalFilter(''); setBookingCustomerFilter(''); setFilter('all'); loadAll() }}>Reset</button></form><BookingList title="" bookings={shownBookings} admin onStatus={setStatus} /></section>}
      {tab === 'mahals' && <section className="admin-panel"><div className="list-heading"><div><h2>Mahal listings</h2><p>Listings in the public site are labeled sample venues for this project.</p></div><button className="button button-maroon" onClick={() => { setEditing(null); setCreating(true) }}><Plus size={16} /> Add mahal</button></div>{(creating || editing) && <MahalAdminForm initial={editing} onCancel={() => { setCreating(false); setEditing(null) }} onSaved={() => { setCreating(false); setEditing(null); loadAll() }} />}<div className="admin-mahal-list">{mahals.map((mahal) => <div className="admin-mahal-row" key={mahal.id}><img src={mahal.image_url || fallbackImage} alt="" /><div><strong>{mahal.name}</strong><span>{mahal.location} · {money(mahal.base_price)} · {mahal.capacity_max} capacity</span></div><button className="button button-outline button-small" onClick={() => { setCreating(false); setEditing(mahal) }}>Edit</button><button className="button button-danger button-small" onClick={() => deleteMahal(mahal)}>Hide</button></div>)}</div></section>}
      {tab === 'services' && <section className="admin-panel"><div className="list-heading"><div><h2>Optional services</h2><p>Service rates are read from MySQL and recalculated by the API for each request.</p></div><button className="button button-maroon" onClick={() => { setEditingService(null); setServiceForm(!serviceForm) }}><Plus size={16} /> Add service</button></div>{serviceForm && <form className="service-admin-form" onSubmit={saveService}><label>Service name<input name="name" defaultValue={editingService?.name || ''} required maxLength="120" /></label><label>Description<input name="description" defaultValue={editingService?.description || ''} required maxLength="1000" /></label><label>Price (₹)<input name="price" type="number" defaultValue={editingService?.price || ''} required min="0" step="0.01" /></label><button className="button button-maroon" disabled={serviceBusy}>{serviceBusy ? 'Saving…' : editingService ? 'Update service' : 'Save service'}</button>{serviceError && <p className="form-error">{serviceError}</p>}</form>}<div className="admin-mahal-list">{services.map((service) => <div className="admin-mahal-row service-row" key={service.id}><div><strong>{service.name}</strong><span>{service.description}</span></div><b>{money(service.price)}</b><button className="button button-outline button-small" onClick={() => { setEditingService(service); setServiceForm(true) }}>Edit</button><button className="button button-danger button-small" onClick={() => deleteService(service)}>Hide</button></div>)}</div></section>}
      {tab === 'functions' && <section className="admin-panel"><div className="list-heading"><div><h2>Function types</h2><p>Categories shown in customer search and booking forms.</p></div><button className="button button-maroon" onClick={() => { setEditingFunction(null); setFunctionForm(true) }}><Plus size={16} /> Add type</button></div>{functionForm && <FunctionAdminForm initial={editingFunction} onCancel={() => { setFunctionForm(false); setEditingFunction(null) }} onSaved={() => { setFunctionForm(false); setEditingFunction(null); loadAll() }} />}<div className="category-admin-grid">{functions.map((item) => <div key={item.id}><Flower2 size={18} /><strong>{item.name}</strong><span>{item.description}</span><div className="category-admin-actions"><button className="button button-outline button-small" onClick={() => { setEditingFunction(item); setFunctionForm(true) }}>Edit</button><button className="button button-danger button-small" onClick={() => deleteFunction(item)}>Hide</button></div></div>)}</div></section>}
    </main>
  )
}

function RequireAuth({ admin = false, children }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="page-wrap"><div className="loading-box">Checking your account…</div></main>
  if (!user) return <Navigate to="/login" replace />
  if (admin && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

function AppFrame() {
  const { setUser, setLoading } = useAuth()
  const [fatalError, setFatalError] = useState('')
  useEffect(() => {
    let active = true
    api('/api/auth/me').then(({ user: current }) => { if (active) setUser(current) })
      .catch((err) => { if (active && err.status !== 401) setFatalError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [setLoading, setUser])
  return <>
    <Header />
    <Flash message={fatalError} onClose={() => setFatalError('')} />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/mahals" element={<SearchPage />} />
      <Route path="/mahals/:id" element={<MahalPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/book/:id" element={<RequireAuth><BookingPage /></RequireAuth>} />
      <Route path="/bookings/:id/confirmation" element={<RequireAuth><BookingConfirmation /></RequireAuth>} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
      <Route path="*" element={<main className="page-wrap"><div className="empty-state"><h2>We couldn't find that page.</h2><Link className="button button-maroon" to="/">Back to home</Link></div></main>} />
    </Routes>
    <Footer />
  </>
}

function AuthProvider() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const value = useMemo(() => ({ user, setUser, loading, setLoading }), [user, loading])
  return <AuthContext.Provider value={value}><BrowserRouter basename={import.meta.env.BASE_URL}><AppFrame /></BrowserRouter></AuthContext.Provider>
}

export default AuthProvider
