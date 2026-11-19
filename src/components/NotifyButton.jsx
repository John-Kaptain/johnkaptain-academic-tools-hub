import React, { useEffect, useState } from 'react'
import { pushState, enablePush, disablePush, syncPush } from '../push.js'

// Shown on paid orders only: alerts for files delivered and JK Support messages.
export default function NotifyButton({ label = '🔔 Notify me on this phone' }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    pushState().then(s => {
      if (!alive) return
      setState(s)
      if (s === 'on') syncPush() // link this (newly paid) order too
    })
    return () => { alive = false }
  }, [])

  if (!state || state === 'unsupported') return null

  if (state === 'install-first') {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        🔔 To get alerts on iPhone, add this site to your Home Screen first (Share → Add to Home Screen), then open it from there.
      </p>
    )
  }
  if (state === 'blocked') {
    return <p className="text-xs text-gray-500 dark:text-gray-400">🔕 Notifications are blocked for this site in your browser settings.</p>
  }

  const turnOn = async () => {
    setBusy(true); setError('')
    try { await enablePush(); setState('on') } catch (e) { setError(e.message); setState(await pushState()) } finally { setBusy(false) }
  }
  const turnOff = async () => {
    setBusy(true)
    try { await disablePush() } finally { setState(await pushState()); setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3 text-sm">
      {state === 'on' ? (
        <div className="flex items-center justify-between gap-2">
          <span>🔔 Alerts are on: you'll be notified when your files arrive or JK Support replies.</span>
          <button type="button" className="underline text-xs shrink-0" onClick={turnOff} disabled={busy}>Turn off</button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-primary w-full" onClick={turnOn} disabled={busy}>
            {busy ? 'Turning on…' : label}
          </button>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Get an alert when your files arrive or JK Support replies, even with the site closed.</p>
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
