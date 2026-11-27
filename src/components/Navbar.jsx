import React, { useEffect, useState } from 'react'
import InstallAppButton from './InstallAppButton.jsx'
import RefreshButton from './RefreshButton.jsx'
import { currentAccount } from '../account.js'

export default function Navbar({
  sections = [],
  activeId,
  onJump,
  onToggleTheme,
  theme = 'light',
  onAccount,
}) {
  const [open, setOpen] = useState(false)
  // "Sign in" until the customer signs in, then "My account".
  const [signedIn, setSignedIn] = useState(() => Boolean(currentAccount()))
  useEffect(() => {
    const sync = () => setSignedIn(Boolean(currentAccount()))
    window.addEventListener('jk-account-changed', sync)
    return () => window.removeEventListener('jk-account-changed', sync)
  }, [])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false)
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleJump = id => {
    onJump(id)
    setOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 site-header text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-3">
          <button
            type="button"
            onClick={() => handleJump(sections[0]?.id || 'top')}
            className="shrink-0 text-left"
          >
            <span className="block text-xl sm:text-2xl font-extrabold tracking-tight leading-tight">
              JK Academic
            </span>
            <span className="block text-xl sm:text-2xl font-extrabold tracking-tight leading-tight">
              Tools Hub
            </span>
          </button>

          <div className="hidden lg:flex items-center gap-3">
            <nav className="flex flex-wrap items-center justify-end gap-2">
              {sections.map(section => {
                const active = activeId === section.id
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleJump(section.id)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                      section.id === 'turnitin-detection'
                        ? 'bg-white text-blue-700 font-bold shadow hover:bg-blue-50'
                        : active
                        ? 'bg-white/25 text-white shadow'
                        : 'text-white/95 hover:bg-white/15'
                    }`}
                  >
                    {section.title}
                  </button>
                )
              })}
            </nav>

            <InstallAppButton className="rounded-2xl bg-white px-4 py-3 font-bold text-blue-700 shadow hover:bg-blue-50 transition" />
            <RefreshButton className="rounded-2xl bg-white px-4 py-3 font-bold text-blue-700 shadow hover:bg-blue-50 transition" />

            <button
              type="button"
              onClick={onAccount}
              className="rounded-2xl bg-white px-4 py-3 font-bold text-blue-700 shadow hover:bg-blue-50 transition"
            >
              {signedIn ? '👤 My account' : '👤 Sign in'}
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-2xl bg-teal-500 px-4 py-3 font-bold text-white shadow hover:bg-teal-600 transition"
            >
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={onAccount}
              className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow hover:bg-blue-50 transition"
              aria-label={signedIn ? 'My account' : 'Sign in'}
            >
              {signedIn ? '👤' : '👤 Sign in'}
            </button>
            <InstallAppButton
              label="📲 App"
              className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow hover:bg-blue-50 transition"
            />
            <RefreshButton className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow hover:bg-blue-50 transition" />

            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-xl bg-teal-500 px-3 py-2 text-sm font-bold text-white shadow hover:bg-teal-600 transition"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>

            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="rounded-xl bg-white/10 p-2 hover:bg-white/20 transition"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {open && (
          <div className="lg:hidden pb-4">
            <div className="rounded-2xl bg-white/10 backdrop-blur p-3 shadow-md">
              <nav className="flex flex-col gap-2">
                {sections.map(section => {
                  const active = activeId === section.id
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleJump(section.id)}
                      className={`w-full rounded-xl px-4 py-3 text-left font-medium transition ${
                        active
                          ? 'bg-white text-blue-700 shadow'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {section.title}
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}