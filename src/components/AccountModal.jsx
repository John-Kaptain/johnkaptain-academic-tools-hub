import React, { useEffect, useState } from 'react'
import { account, currentAccount } from '../account.js'

// JK_CUSTOMER_ACCOUNTS_V1: "My account" — sign in with an emailed code and see
// every order (Turnitin reports and other services) on any device.
const REPORT_STAGE = {
  DRAFT: 'Not paid', PAYMENT: 'Waiting for payment', PAYMENT_FAILED: 'Payment not completed', PAID: 'Paid',
  PROCESSING: 'Processing', PARTLY_DELIVERED: 'Some reports ready', DELIVERED: 'Reports ready', CANCELLED: 'Cancelled',
}
const inputClass = 'w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none'
const when = at => (at ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export default function AccountModal({ open, onClose, onOpenReport, onOpenShop }) {
  const [me, setMe] = useState(currentAccount())
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [orders, setOrders] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const sync = () => setMe(currentAccount())
    window.addEventListener('jk-account-changed', sync)
    return () => window.removeEventListener('jk-account-changed', sync)
  }, [])
  useEffect(() => {
    if (!open) { setError(''); setBusy(''); return }
    if (me) {
      setOrders(null)
      account.list().then(r => setOrders(r.orders)).catch(e => setError(e.message))
    }
  }, [open, me])

  if (!open) return null

  const run = async (label, fn) => {
    setError('')
    setBusy(label)
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const sendCode = e => {
    e.preventDefault()
    run('Sending code…', async () => { await account.sendCode(email.trim()); setSent(true); setCode('') })
  }
  const verify = e => {
    e.preventDefault()
    run('Signing in…', async () => { await account.verify(email.trim(), code.trim()); setSent(false) })
  }
  const openOrder = o => run('Opening…', async () => {
    const saved = await account.open(o.kind, o.id)
    onClose()
    if (o.kind === 'shop') onOpenShop(o.id)
    else onOpenReport(saved)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-bold">👤 My account</h3>
          <button type="button" className="btn btn-outline !px-3 !py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!me && !sent && (
          <form onSubmit={sendCode} className="mt-4 space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">Sign in with just your email — no password, we send you a 6-digit code.</p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-1">
              <li>See all your orders and reports on any phone or computer.</li>
              <li>Get the cheaper <strong>🔁 Recheck</strong> price when you check the same file again within 24 hours.</li>
              <li>Stay signed in on this device.</li>
            </ul>
            <p className="text-xs text-gray-500">Signing in is optional — you can order without it.</p>
            <label className="block text-sm font-medium">Email address</label>
            <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            <button className="btn btn-primary w-full" disabled={Boolean(busy) || !email.trim()}>Email me a code</button>
          </form>
        )}

        {!me && sent && (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in 10 minutes.
            </p>
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 p-3 text-sm text-amber-900 dark:text-amber-200">
              📩 <strong>Didn't get the email?</strong> Check your <strong>Spam</strong> or <strong>Promotions</strong> folder — it comes from JK Academic Tools Hub.
              If you find it there, tap <strong>“Not spam”</strong> so future codes reach your inbox. Still nothing after a minute? Tap “Send a new code” below.
            </div>
            <label className="block text-sm font-medium">Code</label>
            <input className={`${inputClass} tracking-[0.4em] text-center text-lg`} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" required />
            <button className="btn btn-primary w-full" disabled={Boolean(busy) || code.length !== 6}>Sign in</button>
            <div className="flex justify-between text-sm">
              <button type="button" className="underline" onClick={() => setSent(false)}>Change email</button>
              <button type="button" className="underline" disabled={Boolean(busy)} onClick={sendCode}>Send a new code</button>
            </div>
          </form>
        )}

        {me && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Signed in as <strong>{me.email}</strong></span>
              <button type="button" className="underline" onClick={() => run('Signing out…', () => account.signOut())}>Sign out</button>
            </div>
            <p className="text-xs text-gray-500">
              You stay signed in on this device. Orders you place while signed in are saved here automatically, and re-checking the same
              file within 24 hours gets the 🔁 Recheck price.
            </p>
            {orders === null && !error && <p className="text-sm">Loading your orders…</p>}
            {orders && !orders.length && <p className="text-sm text-gray-500">No orders yet.</p>}
            {orders && orders.map(o => (
              <button key={o.kind + o.id} type="button" onClick={() => openOrder(o)} disabled={Boolean(busy)}
                className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800">
                <div className="flex justify-between gap-2">
                  <strong>{o.kind === 'shop' ? `🛍 ${o.product}` : `📄 Turnitin reports (${o.files} file${o.files === 1 ? '' : 's'})`}</strong>
                  <span className="text-sm whitespace-nowrap">{o.amount ? `Ksh ${o.amount}` : ''}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {o.kind === 'shop' ? (o.paid ? 'Paid' : 'Not paid') : REPORT_STAGE[o.stage] || o.stage}
                  {o.kind === 'report' && o.reports ? ` · ${o.reports} report${o.reports === 1 ? '' : 's'}` : ''} · {when(o.createdAt)} · {o.id}
                </div>
              </button>
            ))}
            <p className="text-xs text-gray-500">Reports stay available for 30 days.</p>
          </div>
        )}

        {busy && <p className="mt-3 text-sm font-medium">{busy}</p>}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  )
}
