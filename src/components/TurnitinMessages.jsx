import React from 'react'

function timestamp(at) {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// The caller keys this panel by order so each conversation stays independent.
export default function TurnitinMessages({ messages = [], orderId }) {
  const sorted = [...messages].sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0))
  const conversation = sorted.filter(m => ['support', 'client'].includes(m.kind))
  const updates = sorted.filter(m => !['support', 'client'].includes(m.kind))
  const [showEarlier, setShowEarlier] = React.useState(false)
  const visible = showEarlier ? conversation : conversation.slice(-6)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" aria-label={`Messages for order ${orderId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-sm">💬 Support conversation</h4>
        <span className="text-xs text-slate-500 dark:text-slate-400">Order {orderId}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Messages here belong only to this order.</p>
      {conversation.length > 6 && (
        <button type="button" className="mt-3 text-xs font-semibold text-indigo-700 underline dark:text-indigo-300" onClick={() => setShowEarlier(v => !v)}>
          {showEarlier ? 'Show latest messages' : `Show ${conversation.length - 6} earlier messages`}
        </button>
      )}
      <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1" aria-label="Support messages" tabIndex={0}>
        {!conversation.length && <li className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">No support messages for this order yet.</li>}
        {visible.map((m, k) => (
          <li key={m.id || `${m.at}-${k}`} className={'whitespace-pre-wrap break-words rounded-xl border p-3 text-sm ' + (m.kind === 'support'
            ? 'mr-5 border-teal-200 bg-teal-50 text-slate-900 dark:border-teal-800 dark:bg-teal-950 dark:text-slate-100'
            : 'ml-5 border-indigo-200 bg-indigo-50 text-slate-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-slate-100')}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{m.kind === 'support' ? 'JK Support' : 'You'}</span>
              {m.at && <time>{timestamp(m.at)}</time>}
            </div>
            {m.text}
          </li>
        ))}
      </ol>
      {updates.length > 0 && (
        <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">Automatic order updates ({updates.length})</summary>
          <ol className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm" aria-label="Automatic order updates" tabIndex={0}>
            {[...updates].reverse().map((m, k) => (
              <li key={m.id || `${m.at}-${k}`} className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {m.at && <time className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{timestamp(m.at)}</time>}
                {m.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
