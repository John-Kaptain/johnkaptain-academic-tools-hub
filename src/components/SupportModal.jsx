import React, { useEffect, useRef, useState } from 'react'
import { support, markSupportSeen } from '../support.js'
import { currentAccount } from '../account.js'

// JK_GENERAL_SUPPORT_V1: a chat with JK Support for anything not about one order.
const when = at => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function SupportModal({ open, onClose, onSignIn }) {
  const [messages, setMessages] = useState(null)
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef(null)
  const signedIn = Boolean(currentAccount())

  const load = () =>
    support.thread().then(r => {
      setMessages(r.messages)
      const last = r.messages[r.messages.length - 1]
      if (last) markSupportSeen(last.at)
    })
  useEffect(() => {
    if (!open) return
    setError('')
    load().catch(e => setError(e.message))
    const timer = setInterval(() => load().catch(() => {}), 15000)
    return () => clearInterval(timer)
  }, [open])
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [messages])

  if (!open) return null

  const send = async e => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await support.send(text.trim(), name.trim())
      setMessages(r.messages)
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-bold">💬 Contact support</h3>
          <button type="button" className="btn btn-outline !px-3 !py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Ask us anything — services, prices, payments. For a question about an order you placed, use the chat inside that order.
        </p>
        {!signedIn && (
          <p className="mt-2 text-xs text-gray-500">
            Replies appear here on this device.{' '}
            <button type="button" className="underline" onClick={onSignIn}>Sign in</button> to see them on any phone or computer.
          </p>
        )}

        <div ref={boxRef} className="mt-3 max-h-72 overflow-y-auto space-y-2 rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
          {messages === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
          {messages && !messages.length && <p className="text-sm text-gray-500">No messages yet. Write below and we'll reply here.</p>}
          {messages && messages.map(m => (
            <div key={m.id} className={`flex ${m.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.from === 'customer' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-700'}`}>
                {m.text}
                <div className={`mt-1 text-[11px] ${m.from === 'customer' ? 'text-blue-100' : 'text-gray-500'}`}>
                  {m.from === 'customer' ? 'You' : 'JK Support'} · {when(m.at)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={send} className="mt-3 space-y-2">
          {!signedIn && (!messages || !messages.length) && (
            <input className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-2 outline-none"
              value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" maxLength={60} />
          )}
          <textarea className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
            rows={3} value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Type your message…" />
          <button className="btn btn-primary w-full" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="mt-3 text-xs text-gray-500">
          Urgent? <a className="underline" href="https://wa.me/254701730921" target="_blank" rel="noreferrer">WhatsApp 0701730921</a>
        </p>
      </div>
    </div>
  )
}
