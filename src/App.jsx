import React, { useEffect, useMemo, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Card from './components/Card.jsx'
import Modal from './components/Modal.jsx'
import Footer from './components/Footer.jsx'
import { CATEGORIES } from './data.js'

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
    training: 'bg-teal-50 dark:bg-teal-900/20',
  }

  return (
    <div className="text-gray-900 dark:text-gray-100">
      <Navbar
        sections={sections}
        activeId={activeId}
        onJump={onJump}
        onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
        theme={theme}
      />

      <section className="hero relative">
        <div className="container-narrow py-10 sm:py-16">
          <div className="rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6 py-6 shadow max-w-5xl">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-black dark:text-white tracking-tight">
              Welcome to the JohnKaptain Academic Tools Hub
            </h1>

            <p className="mt-3 text-gray-800 dark:text-gray-200 text-base sm:text-lg max-w-3xl leading-relaxed">
              Academic tools and services for students, researchers, and online workers.
            </p>

            <details className="mt-4 rounded-xl bg-gray-50 dark:bg-slate-800 px-4 py-3">
              <summary className="cursor-pointer font-medium text-gray-900 dark:text-gray-100">
                More about this site
              </summary>

              <div className="mt-3 space-y-3 text-gray-700 dark:text-gray-300 text-sm sm:text-base leading-relaxed">
                <p>
                  JohnKaptain Academic Tools Hub helps users discover AI humanizers,
                  content support, Turnitin guidance, training resources, and other useful
                  academic services.
                </p>

                <p>
                  Search for JohnKaptain Academic Tools Hub to quickly find our website and
                  explore available tools and services.
                </p>

                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Enjoy 15% Referral Bonus on each Member Referred to Our Services
                </p>
              </div>
            </details>
          </div>

          <div className="mt-6">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search academic tools and services..."
              className="w-full sm:w-96 rounded-2xl px-4 py-3 bg-white text-gray-900 placeholder:text-gray-500 outline-none shadow border border-gray-200"
            />
          </div>
        </div>
      </section>

      <main className="container-narrow">
        <section className="py-8">
          <div className="rounded-2xl bg-white dark:bg-slate-900 shadow px-5 sm:px-6 py-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              About JohnKaptain Academic Tools Hub
            </h2>
            <p className="mt-3 text-gray-800 dark:text-gray-200 max-w-4xl leading-relaxed">
              JohnKaptain Academic Tools Hub helps users discover academic tools, study
              support, training resources, and digital services in a simple searchable hub.
              The platform is designed to make it easier to access academic solutions,
              research support, and helpful online services from one place.
            </p>
          </div>
        </section>

        {CATEGORIES.map(cat => (
          <section key={cat.id} id={cat.id} className={`py-10 rounded-2xl ${sectionBg[cat.id]}`}>
            <h2 className="section-title">{cat.title}</h2>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {filterItems(cat.items).map(item => (
                <Card key={item.id} item={item} onOpen={setModalItem} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <Footer />

      <Modal open={!!modalItem} item={modalItem} onClose={() => setModalItem(null)} />

      <a
        href="https://wa.me/254701730921"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-4 right-4 rounded-2xl px-4 py-2 font-medium shadow bg-green-600 text-white hover:bg-green-700"
      >
        WhatsApp
      </a>
    </div>
  )
}