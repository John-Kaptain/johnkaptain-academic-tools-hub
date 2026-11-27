import React, { useState } from 'react'

// JK_REFRESH_BUTTON_V1: "🔄" in the installed app (which has no browser refresh):
// reloads the site so the latest version shows without closing the app.
// Hidden in a normal browser tab, which has its own refresh.
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export default function RefreshButton({ className = '' }) {
  const [busy, setBusy] = useState(false)
  if (!isStandalone()) return null
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => { setBusy(true); window.location.reload() }}
      title="Refresh: load the latest version"
      aria-label="Refresh"
    >
      {busy ? '⏳' : '🔄'}
    </button>
  )
}
