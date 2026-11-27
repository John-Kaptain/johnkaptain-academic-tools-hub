import React, { useEffect, useMemo, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Card from './components/Card.jsx'
import Modal from './components/Modal.jsx'
import ReportsCheckout from './components/ReportsCheckout.jsx'
import TurnitinCard from './components/TurnitinCard.jsx'
import { reportsApi, savedOrders, lastSeen } from './reportsApi.js'
import Footer from './components/Footer.jsx'
import ShopOrders from './components/ShopOrders.jsx'
import AccountModal from './components/AccountModal.jsx'
import SupportModal from './components/SupportModal.jsx'
import { support, supportSeen, supportUsed } from './support.js'
import { shopChat, savedShopOrders, shopLastSeen } from './shopChat.js'
import { CATEGORIES as ALL_CATEGORIES } from './data.js'

// The Turnitin reports section leads the page.
const REPORTS_SECTION = 'turnitin-detection'
const REPORTS_ITEM = 'turnitin-reports'
const CATEGORIES = [
  ...ALL_CATEGORIES.filter(c => c.id === REPORTS_SECTION),
  ...ALL_CATEGORIES.filter(c => c.id !== REPORTS_SECTION),
]

function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0] ?? null)

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-40% 0px -55% 0px', threshold: 0.01 },
    )

    ids.forEach(id => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })

    return () => obs.disconnect()
  }, [ids])

  return active
}

export default function App() {
  const sections = useMemo(() => CATEGORIES.map(c => ({ id: c.id, title: c.title })), [])
  const activeId = useScrollSpy(sections.map(s => s.id))
  const [modalItem, setModalItem] = useState(null)
  const [reportsOpen, setReportsOpen] = useState(false)
  const [reportsType, setReportsType] = useState(null)
  const [reportsConfig, setReportsConfig] = useState(null)
  const [reportsOrder, setReportsOrder] = useState(null)
  const [reportsOrdersFirst, setReportsOrdersFirst] = useState(false)
  const [reportsFiles, setReportsFiles] = useState(null) // JK_UPLOAD_BOX_V1: files picked on the card
  const [supportNotice, setSupportNotice] = useState(null)
  const [hasOrders, setHasOrders] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [shopCount, setShopCount] = useState(() => savedShopOrders().length)
  const [shopUnread, setShopUnread] = useState([])
  const [shopInitial, setShopInitial] = useState(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportUnread, setSupportUnread] = useState(false)
  // JK_GENERAL_SUPPORT_V1: a dot on "Contact support" when JK Support has replied.
  const checkGeneralSupport = () =>
    supportUsed() && support
      .thread()
      .then(r => setSupportUnread(r.messages.some(m => m.from === 'support' && m.at > supportSeen())))
      .catch(() => {})
  useEffect(() => {
    checkGeneralSupport()
    const timer = setInterval(checkGeneralSupport, 60000)
    return () => clearInterval(timer)
  }, [])

  // Replies from JK Support (Telegram) to this device's tool/service orders.
  const checkShopReplies = () => {
    const saved = savedShopOrders()
    setShopCount(saved.length)
    Promise.all(
      saved.map(o =>
        shopChat
          .thread(o.orderId, o.token)
          .then(t => ((t.messages || []).some(m => m.from === 'support' && m.at > shopLastSeen(o.orderId)) ? o.orderId : null))
          .catch(() => null),
      ),
    ).then(ids => setShopUnread(ids.filter(Boolean)))
  }
  useEffect(() => {
    checkShopReplies()
    const timer = setInterval(checkShopReplies, 60000)
    return () => clearInterval(timer)
  }, [])

  // Live price from the JK Turnitin Bot (same as Telegram).
  useEffect(() => {
    reportsApi
      .config()
      .then(setReportsConfig)
      .catch(() => {})
  }, [])

  // Replies from JK Support to this device's orders, shown on the card.
  const checkSupportReplies = () => {
    const saved = savedOrders()
    setHasOrders(saved.length > 0)
    Promise.all(
      saved.map(o =>
        reportsApi
          .status(o.orderId, o.token)
          .then(r => ({ o, unread: (r.status.messages || []).some(m => m.kind === 'support' && m.at > lastSeen(o.orderId)) }))
          .catch(() => ({ o, unread: false })),
      ),
    ).then(results => setSupportNotice(results.find(r => r.unread)?.o || null))
  }
  useEffect(() => {
    checkSupportReplies()
    const timer = setInterval(checkSupportReplies, 60000)
    return () => clearInterval(timer)
  }, [])

  const openReports = (type, savedOrder = null, ordersFirst = false, files = null) => {
    setReportsType(type)
    setReportsFiles(files && files.length ? files : null)
    setReportsOrder(savedOrder)
    setReportsOrdersFirst(ordersFirst)
    setReportsOpen(true)
  }

  // A tapped notification opens its order: /?order=<id> (reports) or /?shop=<id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reportId = params.get('order')
    const shopId = params.get('shop')
    if (!reportId && !shopId) return
    if (reportId) {
      const saved = savedOrders().find(o => o.orderId === reportId)
      if (saved) openReports(null, saved)
    } else if (savedShopOrders().some(o => o.orderId === shopId)) {
      setShopInitial(shopId)
      setShopOpen(true)
    }
    params.delete('order')
    params.delete('shop')
    const rest = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash)
  }, [])
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const onJump = id => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filterItems = items => {
    if (!q) return items
    const s = q.toLowerCase()
    return items.filter(
      i => i.name.toLowerCase().includes(s) || (i.description || '').toLowerCase().includes(s),
    )
  }

  const sectionBg = {
    'ai-humanizers': 'bg-sky-50 dark:bg-slate-900/40',
    'content-generation': 'bg-amber-50 dark:bg-amber-900/20',
    'turnitin-detection': 'bg-emerald-50 dark:bg-emerald-900/20',
    unlocks: 'bg-indigo-50 dark:bg-indigo-900/20',
    vpn: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
    entertainment: 'bg-rose-50 dark:bg-rose-900/20',
  }

  return (
    <div className="text-gray-900 dark:text-gray-100">
      <Navbar
        sections={sections}
        activeId={activeId}
        onJump={onJump}
        onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
        theme={theme}
        onAccount={() => setAccountOpen(true)}
      />

      <section className="hero relative">
        <div className="container-narrow py-5 sm:py-6">
          <div className="rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6 py-4 shadow">
            <h1 className="text-2xl sm:text-4xl font-extrabold text-black dark:text-white tracking-tight">
              Welcome to the JK Academic Tools Hub
            </h1>

            <p className="mt-3 text-gray-800 dark:text-gray-200 text-base sm:text-lg max-w-3xl leading-relaxed">
              Academic tools and services for students, researchers, and online workers.
            </p>

            <details className="mt-3 rounded-xl bg-gray-50 dark:bg-slate-800 px-4 py-3">
              <summary className="cursor-pointer font-medium text-gray-900 dark:text-gray-100">
                More about this site
              </summary>

              <div className="mt-3 space-y-3 text-gray-700 dark:text-gray-300 text-sm sm:text-base leading-relaxed">
                <p>
                  JK Academic Tools Hub helps users discover AI humanizers,
                  content generation support, Turnitin reports, and other
                  useful academic services.
                </p>

                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Enjoy 15% Referral Bonus on each Member Referred to Our Services
                </p>
              </div>
            </details>
          </div>

          <div className="mt-4">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label="Search academic tools and services"
              placeholder="Search academic tools and services..."
              className="w-full sm:w-96 rounded-2xl px-4 py-3 bg-white text-gray-900 placeholder:text-gray-500 outline-none shadow border border-gray-200"
            />
          </div>
        </div>
      </section>

      <main className="container-narrow space-y-4 pb-6">
        {CATEGORIES.map(cat => (
          <section key={cat.id} id={cat.id} className={`catalog-section px-3 sm:px-4 py-5 rounded-2xl ${sectionBg[cat.id]}`}>
            <h2 className="section-title">{cat.title}</h2>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filterItems(cat.items).map(item =>
                item.id === REPORTS_ITEM ? (
                  <TurnitinCard
                    key={item.id}
                    config={reportsConfig}
                    onChoose={openReports}
                    supportNotice={supportNotice}
                    hasOrders={hasOrders}
                    onOpenOrder={o => openReports(null, o, !o)}
                  />
                ) : (
                  <Card key={item.id} item={item} onOpen={setModalItem} />
                ),
              )}
            </div>
          </section>
        ))}
      </main>

      <Footer />

      <Modal
        open={!!modalItem}
        item={modalItem}
        onClose={() => {
          setModalItem(null)
          checkShopReplies()
        }}
      />
      <ShopOrders
        open={shopOpen}
        unread={shopUnread}
        initialOrderId={shopInitial}
        onClose={() => {
          setShopOpen(false)
          checkShopReplies()
        }}
      />
      <SupportModal
        open={supportOpen}
        onClose={() => { setSupportOpen(false); checkGeneralSupport() }}
        onSignIn={() => { setSupportOpen(false); setAccountOpen(true) }}
      />
      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onOpenReport={saved => openReports(null, saved)}
        onOpenShop={id => { setShopInitial(id); setShopOpen(true) }}
      />
      <ReportsCheckout
        open={reportsOpen}
        presetType={reportsType}
        openOrder={reportsOrder}
        ordersFirst={reportsOrdersFirst}
        initialFiles={reportsFiles}
        onClose={() => {
          setReportsOpen(false)
          setReportsFiles(null)
          checkSupportReplies()
        }}
      />

      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
        {hasOrders && (
          <button
            type="button"
            onClick={() => openReports(null, null, true)}
            className="relative rounded-2xl px-4 py-2 text-sm font-bold shadow-lg bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            aria-label="Open my Turnitin orders and download reports"
          >
            📁 Turnitin Orders & Reports
            {supportNotice && (
              <span className="absolute -top-2 -right-2 rounded-full bg-rose-600 text-white text-xs px-2 py-0.5" aria-label="New support message">
                1
              </span>
            )}
          </button>
        )}
        {shopCount > 0 && (
          <button
            type="button"
            onClick={() => setShopOpen(true)}
            className="relative rounded-2xl px-4 py-2 font-semibold shadow bg-blue-600 text-white hover:bg-blue-700"
          >
            💬 Other Service Orders
            {shopUnread.length > 0 && (
              <span className="absolute -top-2 -right-2 rounded-full bg-red-600 text-white text-xs px-2 py-0.5">
                {shopUnread.length}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setSupportOpen(true); setSupportUnread(false) }}
          className="relative rounded-2xl px-4 py-2 text-sm font-semibold shadow bg-slate-800 text-white hover:bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          💬 Contact support
          {supportUnread && (
            <span className="absolute -top-2 -right-2 rounded-full bg-rose-600 text-white text-xs px-2 py-0.5" aria-label="New reply from support">1</span>
          )}
        </button>
        <a
          href="https://wa.me/254701730921"
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl px-3 py-1.5 text-sm font-medium shadow bg-green-600 text-white hover:bg-green-700"
        >
          WhatsApp
        </a>
      </div>
    </div>
  )
}