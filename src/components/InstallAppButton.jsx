import React, { useEffect, useState } from 'react'

// "📲 Install app": Android/desktop Chrome and Edge show their install prompt;
// iPhone/iPad get the Add to Home Screen steps. Hidden inside the installed app.
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream

export default function InstallAppButton({ className = '', label = '📲 Install app' }) {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandalone())
  const [showIos, setShowIos] = useState(false)

  useEffect(() => {
    const onPrompt = e => { e.preventDefault(); setPrompt(e) }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || (!prompt && !isIos())) return null

  const onClick = async () => {
    if (prompt) {
      prompt.prompt()
      const choice = await prompt.userChoice.catch(() => null)
      if (choice?.outcome === 'accepted') setInstalled(true)
      setPrompt(null)
    } else {
      setShowIos(true)
    }
  }

  return (
    <>
      <button type="button" onClick={onClick} className={className}>{label}</button>
      {showIos && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install the app"
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setShowIos(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5 text-gray-900 dark:text-gray-100 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Install JK Academic Tools Hub</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              <li>Open this site in <strong>Safari</strong>.</li>
              <li>Tap the <strong>Share</strong> button (square with an arrow).</li>
              <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIos(false)}
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
