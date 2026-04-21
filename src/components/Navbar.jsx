import React, { useEffect, useState } from 'react'

export default function Navbar({
  sections = [],
  activeId,
  onJump,
  onToggleTheme,
  theme = 'light',
}) {
  const [open, setOpen] = useState(false)

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
    <header className="sticky top-0 z-50 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-600 text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-4">
          <button
            type="button"
            onClick={() => handleJump(sections[0]?.id || 'top')}
            className="text-left"
          >
            <span className="block text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              JohnKaptain Academic
            </span>
            <span className="block text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
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
                    className={`rounded-full px-4 py-2 text-sm xl:text-base font-medium transition ${
                      active
                        ? 'bg-white/25 text-white shadow'
                        : 'text-white/95 hover:bg-white/15'
                    }`}
                  >
                    {section.title}
                  </button>
                )
              })}
            </nav>

            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-2xl bg-green-500 px-4 py-3 font-bold text-white shadow hover:bg-green-600 transition"
            >
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-xl bg-green-500 px-3 py-2 text-sm font-bold text-white shadow hover:bg-green-600 transition"
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