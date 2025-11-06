import React from 'react'

export default function Navbar({ sections, activeId, onJump, onToggleTheme, theme }) {
  return (
    <header className="sticky top-0 z-40 text-white">
      {/* Gradient bar */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-600 border-b border-white/10 backdrop-blur">
        <div className="container-narrow flex items-center gap-3 py-3">
          <div className="text-lg sm:text-xl font-extrabold tracking-tight">
            JohnKaptain Academic Tools Hub
          </div>

          {/* desktop nav */}
          <nav className="ml-auto hidden md:flex flex-wrap gap-2">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => onJump(s.id)}
                className={
                  'px-3 py-1 rounded-full text-sm transition ' +
                  (activeId === s.id
                    ? 'bg-white/30 shadow-sm'
                    : 'hover:bg-white/15')
                }
              >
                {s.title}
              </button>
            ))}
          </nav>

          {/* visible theme toggle */}
          <div className="ml-auto md:ml-2">
            <button
              onClick={onToggleTheme}
              className="rounded-2xl px-3 py-1 text-sm font-semibold bg-green-500 text-white hover:bg-green-600 shadow"
              title="Toggle theme"
            >
              {theme === 'dark' ? 'Light' : 'Dark'} Mode
            </button>
          </div>
        </div>

        {/* mobile pills */}
        <div className="md:hidden container-narrow pb-3 flex flex-wrap gap-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => onJump(s.id)}
              className={
                'px-3 py-1 rounded-full text-sm transition ' +
                (activeId === s.id
                  ? 'bg-white/30 shadow-sm'
                  : 'hover:bg-white/15')
              }
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
