import React, { useEffect, useState } from 'react'

export default function Navbar({ sections, activeId, onJump, onToggleTheme, theme }) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMenuOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleJump = id => {
    onJump(id)
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 text-white">
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-600 border-b border-white/10 backdrop-blur shadow">
        <div className="container-narrow flex items-center gap-3 py-3">
          <div className="text-lg sm:text-xl font-extrabold tracking-tight leading-tight">
            JohnKaptain Academic Tools Hub
          </div>

          {/* desktop nav */}
          <nav className="ml-auto hidden md:flex flex-wrap gap-2">
            {sections.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleJump(s.id)}
                className={
                  'px-3 py-1 rounded-full text-sm transition ' +
                  (activeId === s.id ? 'bg-white/30 shadow-sm' : 'hover:bg-white/15')
                }
              >
                {s.title}
              </button>
            ))}
          </nav>

          {/* right controls */}
          <div className="ml-auto md:ml-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-2xl px-3 py-1 text-sm font-semibold bg-green-500 text-white hover:bg-green-600 shadow transition"
              title="Toggle theme"
            >
              {theme === 'dark' ? 'Light' : 'Dark'} Mode
            </button>

            {/* mobile hamburger */}
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="md:hidden rounded-xl p-2 bg-white/10 hover:bg-white/20 transition"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
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
                  className="h-6 w-6"
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

        {/* mobile dropdown menu */}
        {menuOpen && (
          <div className="md:hidden container-narrow pb-3">
            <div className="rounded-2xl bg-white/10 backdrop-blur p-2 flex flex-col gap-2">
              {sections.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleJump(s.id)}
                  className={
                    'w-full text-left px-3 py-2 rounded-xl text-sm transition ' +
                    (activeId === s.id
                      ? 'bg-white text-blue-700 shadow-sm font-semibold'
                      : 'text-white hover:bg-white/15')
                  }
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}