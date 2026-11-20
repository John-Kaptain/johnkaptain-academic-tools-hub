import React, { useEffect, useState } from 'react'

// "📲 App": always offered on the website (except inside the installed app).
// - Chrome/Edge/Samsung Internet that can install: their install prompt.
// - Otherwise (e.g. opened inside Telegram or WhatsApp, or the browser hasn't
//   offered it yet): simple steps for this phone.
const INSTALLED_KEY = 'jk-app-installed'
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const ua = () => navigator.userAgent || ''
const isIos = () => /iPhone|iPad|iPod/.test(ua())
// Browsers built into chat/social apps cannot install web apps.
const inAppBrowser = () => /Telegram|WhatsApp|FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(ua())

function remembered() {
  try { return localStorage.getItem(INSTALLED_KEY) === '1' } catch { return false }
}
function remember() {
  try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* ignore */ }
}

export default function InstallAppButton({ className = '', label = '📲 Install app' }) {
  const [prompt, setPrompt] = useState(null)
  const [hidden, setHidden] = useState(() => {
    if (isStandalone()) { remember(); return true } // opened as the app: this phone has it
    return remembered()
  })
  const [help, setHelp] = useState(false)

  useEffect(() => {
    const onPrompt = e => {
      e.preventDefault()
      setPrompt(e)
      // The browser offers install, so the app isn't installed here (any more).
      try { localStorage.removeItem(INSTALLED_KEY) } catch { /* ignore */ }
      setHidden(isStandalone())
    }
    const onInstalled = () => { remember(); setHidden(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden) return null

  const onClick = async () => {
    if (prompt) {
      prompt.prompt()
      const choice = await prompt.userChoice.catch(() => null)
      if (choice?.outcome === 'accepted') { remember(); setHidden(true) }
      setPrompt(null)
    } else {
      setHelp(true)
    }
  }

  const steps = isIos()
    ? [
        inAppBrowser() ? <>Tap <strong>⋯</strong> or <strong>Share</strong> and choose <strong>Open in Safari</strong>.</> : <>Make sure this page is open in <strong>Safari</strong>.</>,
        <>Tap the <strong>Share</strong> button (square with an arrow).</>,
        <>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</>,
      ]
    : [
        inAppBrowser() ? <>Tap <strong>⋮</strong> at the top right and choose <strong>Open in Chrome</strong> (or “Open in browser”).</> : <>Make sure this page is open in <strong>Chrome</strong>.</>,
        <>In Chrome, tap <strong>⋮</strong> at the top right.</>,
        <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.</>,
      ]

  return (
    <>
      <button type="button" onClick={onClick} className={className}>{label}</button>
      {help && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Get the app"
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5 text-gray-900 dark:text-gray-100 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">📲 Get the JK Tools Hub app</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              The app opens straight to your orders and can notify you when your reports are ready.
            </p>
            <button
              type="button"
              onClick={() => setHelp(false)}
              className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
