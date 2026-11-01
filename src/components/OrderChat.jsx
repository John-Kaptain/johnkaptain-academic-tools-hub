import React, { useEffect, useRef, useState } from 'react'
import { shopChat, markShopSeen } from '../shopChat.js'

// Chat with JK Support about one order. Replies from the admin's Telegram
// (💬 Reply button or swipe-reply) appear here — e.g. login details.
export default function OrderChat({ orderId, token, compact = false }) {
  const [thread, setThread] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (!orderId || !token) return undefined
    let alive = true
    const load = () =>
      shopChat
        .thread(orderId, token)
        .then(data => {
          if (!alive) return
          setThread(data)
          setError('')
          const last = (data.messages || []).filter(m => m.from === 'support').at(-1)
          if (last) markShopSeen(orderId, last.at)
        })
        .catch(err => alive && setError(err.message))
    load()
    const timer = setInterval(load, 6000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [orderId, token])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [thread?.messages?.length])

  async function send(e) {
    e?.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      setThread(await shopChat.send(orderId, token, text))
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const messages = thread?.messages || []
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-sm">💬 Chat with JK Support</div>
        <div className="text-xs text-gray-500">Order {orderId}</div>
      </div>
      <div className={`mt-2 space-y-2 overflow-y-auto ${compact ? 'max-h-48' : 'max-h-72'}`}>
        {!messages.length && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your logins and any updates from JK Support will appear here. You can also send us a message.
          </p>
        )}
        {messages.map((m, k) => (
          <div
            key={k}
            className={
              'whitespace-pre-line break-words rounded-xl p-2 text-sm ' +
              (m.from === 'support'
                ? 'mr-8 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 text-gray-900 dark:text-gray-100'
                : 'ml-8 bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100')
            }
          >
            <div className={'text-xs font-semibold ' + (m.from === 'support' ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-300')}>
              {m.from === 'support' ? 'JK Support' : 'You'} · {new Date(m.at).toLocaleString()}
            </div>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <input
          value={text}
          maxLength={2000}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message to JK Support…"
          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 outline-none"
        />
        <button className="btn btn-primary whitespace-nowrap" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
