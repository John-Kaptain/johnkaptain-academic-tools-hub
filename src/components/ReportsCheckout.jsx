import React, { useEffect, useMemo, useRef, useState } from 'react'
import { account, currentAccount } from '../account.js'
import { reportsApi, rememberOrder, savedOrders, forgetOrder, markSeen } from '../reportsApi.js'
import NotifyButton from './NotifyButton.jsx'

import TurnitinMessages from './TurnitinMessages.jsx'

const WHATSAPP = 'https://wa.me/254701730921'
const STAGE_TEXT = {
  DRAFT: 'Preparing order',
  PAYMENT: 'Waiting for M-Pesa payment',
  PAYMENT_FAILED: 'Payment not completed',
  PROCESSING: 'Payment confirmed. Your reports are processing.',
  PARTLY_DELIVERED: 'Reports arriving',
  DELIVERED: 'Reports ready',
  CANCELLED: 'Order cancelled',
}
// USDT for a Ksh total, rounded up to the cent (same rule as the bot).
const usdtFor = (kes, rate) => (rate > 0 && kes > 0 ? Math.ceil((kes / rate) * 100 - 1e-9) / 100 : null)
function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-outline !px-2 !py-1 text-xs"
      onClick={() => {
        navigator.clipboard?.writeText(String(text)).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
      }}
    >
      {done ? '✓ Copied' : '📋 Copy'}
    </button>
  )
}
const inputClass =
  'w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 outline-none'

const HIGHLIGHT_TEXT = {
  CHECKING: 'Checking availability…',
  WAITING_PAYMENT: 'M-Pesa prompt sent — enter your PIN on your phone.',
  DELIVERING: 'Paid ✓ Preparing your download…',
  DELIVERED: '✅ Added to your reports above.',
  UNAVAILABLE: 'Not available for this document. No payment was taken.',
  REVIEW: 'Payment is being checked by support. Do not pay again.',
}

// Paid AI highlights (AI score below 20%): one row per document, with the
// price on the button. No chat messages.
function HighlightsOffer({ order, items, defaultPhone, onStatus }) {
  const [openId, setOpenId] = useState(null)
  const [phone, setPhone] = useState(defaultPhone || '')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  async function buy(id) {
    setError('')
    setSending(true)
    try {
      const res = await reportsApi.highlights(order.orderId, order.token, id, phone)
      onStatus(res.status)
      setOpenId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="space-y-2">
      <div className="font-semibold">✨ AI highlights</div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        See which sentences were flagged as AI (available when the AI score is below 20%).
      </p>
      {items.map(h => (
        <div key={h.id} className="rounded-xl border border-violet-300 dark:border-violet-700 p-3 text-sm">
          <div className="truncate font-medium">📄 {h.name}</div>
          {['AVAILABLE', 'FAILED'].includes(h.state) && openId !== h.id && (
            <button className="btn btn-primary mt-2 w-full" onClick={() => { setOpenId(h.id); setError('') }}>
              Get AI highlights — Ksh {h.price}
            </button>
          )}
          {h.state === 'FAILED' && openId !== h.id && (
            <p className="mt-1 text-xs text-gray-500">The last payment was not completed. You can try again.</p>
          )}
          {openId === h.id && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className={inputClass + ' flex-1 min-w-[10rem]'}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="M-Pesa number 07XXXXXXXX"
                inputMode="tel"
              />
              <button className="btn btn-primary whitespace-nowrap" disabled={sending || !phone.trim()} onClick={() => buy(h.id)}>
                {sending ? 'Sending…' : `Pay Ksh ${h.price}`}
              </button>
              <button className="btn btn-outline" onClick={() => setOpenId(null)}>Cancel</button>
            </div>
          )}
          {HIGHLIGHT_TEXT[h.state] && <p className="mt-2 text-gray-700 dark:text-gray-300">{HIGHLIGHT_TEXT[h.state]}</p>}
        </div>
      ))}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return ''
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

// "📄 Your reports": each order on this device as a card — document names,
// a plain status and the report downloads right there (no need to open it).
const GLANCE = {
  DRAFT: ['Not paid yet', 'text-gray-600 dark:text-gray-300'],
  PAYMENT: ['Waiting for payment', 'text-amber-700 dark:text-amber-400'],
  PAYMENT_FAILED: ['Payment not completed', 'text-red-600 dark:text-red-400'],
  PAID: ['⏳ Processing', 'text-blue-700 dark:text-blue-400'],
  PROCESSING: ['⏳ Processing', 'text-blue-700 dark:text-blue-400'],
  PARTLY_DELIVERED: ['📥 Reports arriving', 'text-blue-700 dark:text-blue-400'],
  DELIVERED: ['✅ Reports ready', 'text-emerald-700 dark:text-emerald-400'],
  CANCELLED: ['Cancelled', 'text-gray-500'],
}
function RecentOrders({ recent, onOpen, onForget }) {
  const [info, setInfo] = useState({})
  useEffect(() => {
    let alive = true
    recent.slice(0, 10).forEach(o => {
      reportsApi
        .status(o.orderId, o.token)
        .then(r => alive && setInfo(m => ({ ...m, [o.orderId]: r.status })))
        .catch(() => alive && setInfo(m => ({ ...m, [o.orderId]: { missing: true } })))
    })
    return () => { alive = false }
  }, [recent])
  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="font-semibold">📄 Your reports</div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Your orders on this device. Tap ⬇ to download a report.</p>
      <div className="mt-3 space-y-3">
        {recent.map(o => {
          const st = info[o.orderId]
          const names = (st?.files || []).map(f => f.name).filter(Boolean)
          const title = names.length ? names[0] + (names.length > 1 ? ` (+${names.length - 1} more)` : '') : 'Turnitin order'
          const [label, color] = st?.missing
            ? ['Not found (expired)', 'text-gray-500']
            : st?.deleted ? ['Files deleted', 'text-gray-500'] : GLANCE[st?.stage] || ['…', 'text-gray-500']
          return (
            <div key={o.orderId} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{st ? title : 'Loading…'}</div>
                  <div className="text-xs text-gray-500">
                    {st?.createdAt ? new Date(st.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' : ''}Order {o.orderId}
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${color}`}>{label}</span>
              </div>
              {st?.reports?.length > 0 && !st.deleted && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {st.reports.map(r => (
                    <a
                      key={r.id}
                      className="btn btn-primary !py-1.5 !px-3 text-sm max-w-full truncate"
                      href={reportsApi.reportUrl(o.orderId, o.token, r.id)}
                    >
                      ⬇ {r.name}
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <button className="text-sm font-semibold text-blue-700 dark:text-blue-400" onClick={() => onOpen(o)}>
                  Open order ›
                </button>
                <button className="text-xs text-gray-500 hover:text-red-600" title="Remove from this device" onClick={() => onForget(o.orderId)}>
                  Remove ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ReportsCheckout({ open, presetType, openOrder, ordersFirst = false, initialFiles = null, onClose }) {
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState('')
  const [files, setFiles] = useState([]) // { file, type, filter }
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState(null) // { orderId, token }
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [recent, setRecent] = useState([])
  const [showOrdersFirst, setShowOrdersFirst] = useState(false)
  const [note, setNote] = useState('')
  const [sms, setSms] = useState('')
  const [binanceId, setBinanceId] = useState('')
  const [binanceShot, setBinanceShot] = useState(null)
  const [abroad, setAbroad] = useState(false)
  const pollRef = useRef(null)
  const pollVersion = useRef(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setConfigError('')
    setRecent(savedOrders())
    setShowOrdersFirst(Boolean(ordersFirst && !openOrder))
    reportsApi.config().then(setConfig).catch(err => setConfigError(err.message))
    if (openOrder) openSaved(openOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => () => { pollVersion.current++; clearInterval(pollRef.current) }, [])

  useEffect(() => {
    if (!open) {
      pollVersion.current++
      clearInterval(pollRef.current)
      setFiles([])
      setCode('')
      setOrder(null)
      setStatus(null)
      setBusy('')
      setError('')
      setShowOrdersFirst(false)
    }
  }, [open])

  // Service options exactly as the bot offers them right now.
  const services = useMemo(() => {
    if (!config) return []
    const list = [...config.services]
    const d = config.discount
    if (d?.enabled && d.requiresCode && !list.some(s => s.type === 'RESALE')) {
      list.push({ type: 'RESALE', label: `${d.label} (code required)`, price: d.price, needsCode: true })
    }
    return list
  }, [config])
  // The card button the customer clicked decides the first choice.
  const defaultType = services.find(s => s.type === presetType)?.type || services[0]?.type || ''
  // JK_WEB_IDENTITY_V1: RECHECK for signed-in customers (same file within 24 h of a paid check).
  const [recheckable, setRecheckable] = useState({})
  const fileNames = files.map(f => f.file.name).join('\n')
  useEffect(() => {
    if (!open || !files.length || !currentAccount()) { setRecheckable({}); return }
    let live = true
    account.recheck(files.map(f => f.file.name))
      .then(r => {
        if (!live) return
        const map = {}
        for (const x of r.files || []) if (x.recheck) map[x.name] = x.recheck
        setRecheckable(map)
        // Pick the cheaper recheck for qualifying files still on the full check.
        setFiles(list => list.map(f => (map[f.file.name] && f.type === 'CHECK' ? { ...f, type: 'RECHECK' } : f)))
      })
      .catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fileNames])
  const priceOf = (type, f) => (type === 'RECHECK' ? recheckable[f?.file?.name]?.price ?? null : services.find(s => s.type === type)?.price ?? null)
  const total = files.reduce((sum, f) => sum + (priceOf(f.type, f) || 0), 0)
  const needsCode = files.some(f => services.find(s => s.type === f.type)?.needsCode)
  const priceKnown = files.every(f => priceOf(f.type, f) !== null)

  function addFiles(list) {
    setError('')
    const accepted = config?.acceptedExtensions || ['.pdf', '.docx', '.doc', '.pptx']
    const next = [...files]
    for (const file of list) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      if (!accepted.includes(ext)) {
        setError(`${file.name}: only PDF, DOC and DOCX files are supported.`)
        continue
      }
      if (file.size > (config?.maxFileBytes || 20 * 1024 * 1024)) {
        setError(`${file.name}: the file is larger than 20 MB.`)
        continue
      }
      if (next.length >= (config?.maxFiles || 10)) {
        setError(`You can check up to ${config?.maxFiles || 10} documents per order.`)
        break
      }
      if (next.some(f => f.file.name === file.name && f.file.size === file.size)) continue
      next.push({ file, type: defaultType, filter: 'FILTERED' })
    }
    setFiles(next)
    setOrder(null)
  }

  // JK_UPLOAD_BOX_V1: documents chosen on the card are added once the prices are known.
  const addedInitial = useRef(null)
  useEffect(() => {
    if (!open) { addedInitial.current = null; return }
    if (!config || !initialFiles?.length || addedInitial.current === initialFiles) return
    addedInitial.current = initialFiles
    addFiles(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config, initialFiles])

  function startPolling(orderId, token) {
    clearInterval(pollRef.current)
    const version = ++pollVersion.current
    let slow = false
    const tick = async () => {
      try {
        const res = await reportsApi.status(orderId, token)
        if (version !== pollVersion.current) return
        setStatus(res.status)
        const last = res.status.messages?.filter(m => m.kind === 'support').at(-1)
        if (last) markSeen(orderId, last.at)
        if (['DELIVERED', 'CANCELLED'].includes(res.status.stage) && !slow) {
          // Reports are done: keep listening for support replies, less often.
          slow = true
          clearInterval(pollRef.current)
          pollRef.current = setInterval(tick, 15000)
        }
      } catch (err) {
        if (version === pollVersion.current) setError(err.message)
      }
    }
    tick()
    pollRef.current = setInterval(tick, 4000)
  }

  async function pay(e, method = 'mpesa') {
    e?.preventDefault?.()
    setError('')
    if (!files.length) return setError('Add at least one document.')
    if (method === 'mpesa' && !phone.trim()) return setError('Enter your M-Pesa number, or tap “Paying from outside Kenya”.')
    try {
      // Reuse an already-uploaded draft (e.g. after a mistyped code);
      // any change to the document list starts a fresh order.
      let current = order?.uploaded ? order : null
      if (!current) {
        setBusy('Creating order…')
        const created = await reportsApi.createOrder()
        current = { orderId: created.orderId, token: created.token }
        setOrder(current)
        for (let i = 0; i < files.length; i++) {
          setBusy(`Uploading ${i + 1} of ${files.length}: ${files[i].file.name}`)
          await reportsApi.upload(current.orderId, current.token, files[i].file)
        }
        current = { ...current, uploaded: true }
        setOrder(current)
      }
      const choices = files.map(f => ({ type: f.type, filter: config.similarityFilterChoice ? f.filter : undefined }))
      let res
      if (method === 'binance') {
        setBusy('Preparing Binance payment…')
        res = await reportsApi.binance(current.orderId, current.token, { files: choices })
      } else if (method === 'intl') {
        setBusy('Preparing payment details…')
        res = await reportsApi.manual(current.orderId, current.token, { files: choices, code: needsCode ? code : '', method: 'INTL_MPESA' })
      } else {
        setBusy('Sending M-Pesa request…')
        res = await reportsApi.checkout(current.orderId, current.token, { files: choices, code: needsCode ? code : '', phone })
      }
      setStatus(res.status)
      rememberOrder(current.orderId, current.token)
      startPolling(current.orderId, current.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function resend() {
    setError('')
    setBusy('Resending M-Pesa request…')
    try {
      const res = await reportsApi.resend(order.orderId, order.token, phone)
      setStatus(res.status)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function cancelOrder() {
    setError('')
    try {
      const res = await reportsApi.cancel(order.orderId, order.token)
      setStatus(res.status)
      forgetOrder(order.orderId)
      clearInterval(pollRef.current)
    } catch (err) {
      setError(err.message)
    }
  }

  async function sendNote() {
    setError('')
    try {
      const res = await reportsApi.message(order.orderId, order.token, note)
      setStatus(res.status)
      setNote('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function sendBinanceProof() {
    setError('')
    if (binanceShot && binanceShot.size > 5 * 1024 * 1024) return setError('The screenshot must be 5 MB or smaller.')
    setBusy('Sending…')
    try {
      const res = status?.paymentMethod === 'INTL_MPESA'
        ? await reportsApi.manualProof(order.orderId, order.token, binanceId, binanceShot)
        : await reportsApi.binanceProof(order.orderId, order.token, binanceId, binanceShot)
      setStatus(res.status)
      setBinanceId('')
      setBinanceShot(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function sendProof() {
    setError('')
    setBusy('Sending payment confirmation…')
    try {
      const res = await reportsApi.proof(order.orderId, order.token, sms)
      setStatus(res.status)
      setSms('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function deleteFiles() {
    if (!window.confirm('Delete your documents and reports from our server? This cannot be undone.')) return
    setError('')
    try {
      const res = await reportsApi.deleteData(order.orderId, order.token)
      setStatus(res.status)
      forgetOrder(order.orderId)
      setRecent(savedOrders())
      clearInterval(pollRef.current)
    } catch (err) {
      setError(err.message)
    }
  }

  function forgetSaved(orderId) {
    forgetOrder(orderId)
    setRecent(savedOrders())
  }

  function openSaved(saved) {
    setNote('')
    setSms('')
    setError('')
    setShowOrdersFirst(false)
    setOrder(saved)
    setStatus(null)
    startPolling(saved.orderId, saved.token)
  }

  if (!open) return null
  const stage = status?.stage
  const showForm = !order || (!status && !busy)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Turnitin AI &amp; Similarity Reports</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Upload, pay, and download your reports right here when they're ready.</p>
          </div>
          <button className="btn btn-outline px-3" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {configError && (
          <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
            {configError}{' '}
            <a className="underline" href={WHATSAPP} target="_blank" rel="noreferrer">
              Message us on WhatsApp
            </a>
          </div>
        )}

        {config && (!config.enabled || !config.open) && !order && (
          <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 p-3 text-sm">
            {config.closedMessage || 'Website orders are temporarily unavailable.'}
          </div>
        )}

        {showOrdersFirst && !order && (
          <div className="mt-5 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">Your Turnitin orders and reports</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">Choose an existing order below to see its status and download available reports.</p>
            <button type="button" className="btn btn-outline mt-3" onClick={() => setShowOrdersFirst(false)}>
              ➕ Start a new Turnitin check
            </button>
          </div>
        )}

        {config && config.enabled && config.open && showForm && !showOrdersFirst && (
          <form onSubmit={pay} className="mt-5 space-y-4">
            {config.discount?.enabled && config.discount.timeText && (
              <p className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm">
                🏷️ {config.discount.timeText}
                {config.discount.publicActive ? ' Discount price is active now.' : ''}
              </p>
            )}

            <div
              className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-5 text-center"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                addFiles([...e.dataTransfer.files])
              }}
            >
              <p className="font-medium">Drop documents here or</p>
              <button type="button" className="btn btn-primary mt-2" onClick={() => inputRef.current?.click()}>
                Choose documents
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                accept={(config.acceptedExtensions || []).join(',')}
                onChange={e => {
                  addFiles([...e.target.files])
                  e.target.value = ''
                }}
              />
              <p className="mt-2 text-xs text-gray-500">
                PDF, DOC or DOCX · up to {config.maxFiles} documents · 20 MB each
              </p>
            </div>

            {files.map((f, i) => (
              <div key={`${f.file.name}-${i}`} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {i + 1}. {f.file.name}
                    </div>
                    <div className="text-xs text-gray-500">{formatSize(f.file.size)}</div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-red-600"
                    onClick={() => {
                      setFiles(files.filter((_, k) => k !== i))
                      setOrder(null)
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <select
                    className={inputClass}
                    value={f.type}
                    onChange={e => setFiles(files.map((x, k) => (k === i ? { ...x, type: e.target.value } : x)))}
                  >
                    {recheckable[f.file.name] && (
                      <option value="RECHECK">🔁 Recheck (AI + Similarity) — Ksh. {recheckable[f.file.name].price}</option>
                    )}
                    {services.map(s => (
                      <option key={s.type} value={s.type}>
                        {s.label}
                        {s.price !== null && s.price !== undefined ? ` — Ksh. ${s.price}` : ''}
                      </option>
                    ))}
                  </select>
                  {config.similarityFilterChoice && (
                    <select
                      className={inputClass}
                      value={f.filter}
                      onChange={e => setFiles(files.map((x, k) => (k === i ? { ...x, filter: e.target.value } : x)))}
                      title="Similarity filtering"
                    >
                      <option value="FILTERED">Filter quotes + bibliography</option>
                      {config.clientUnfilteredAvailable !== false && <option value="UNFILTERED">Do not filter</option>}
                    </select>
                  )}
                </div>
              </div>
            ))}

            {needsCode && (
              <div>
                <label className="block text-sm font-medium mb-1">{config.discount.label} code</label>
                <input className={inputClass} value={code} onChange={e => setCode(e.target.value)} required />
              </div>
            )}

            {!abroad && <div>
              <label className="block text-sm font-medium mb-1">M-Pesa number <span className="text-gray-500 font-normal">(for M-Pesa)</span></label>
              <input
                className={inputClass}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="07XXXXXXXX / 01XXXXXXXX"
                inputMode="tel"
              />
            </div>}

            <div className="font-semibold">
              {files.length ? (priceKnown ? `Total: Ksh. ${total}` : 'Total shown after code check') : ''}
            </div>
            {(() => {
              const binanceOn = Boolean(config?.binance?.enabled)
              const intlOn = Boolean(config?.intlMpesa?.enabled)
              // JK_BINANCE_PUBLIC_DISCOUNT_V1: the public discount can be paid by Binance; reseller codes can't.
              const binanceBlocked = needsCode || (files.some(f => f.type === 'RESALE') && !config?.discount?.publicActive)
              const usdt = priceKnown ? usdtFor(total, config?.binance?.kesPerUsdt) : null
              const abroadOn = intlOn || binanceOn
              return (
                <div className="space-y-3">
                  <div className={`grid gap-3 ${abroadOn ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {/* JK_PAY_CHOICE_HIGHLIGHT_V1: the blue (selected) look follows the customer's choice.
                        While "outside Kenya" is chosen, tapping M-Pesa switches back to it first. */}
                    <button
                      type={abroad ? 'button' : 'submit'}
                      onClick={abroad ? () => setAbroad(false) : undefined}
                      aria-pressed={!abroad}
                      className={`btn ${abroad ? 'btn-outline' : 'btn-primary'} flex flex-col items-center !py-3`}
                      disabled={!files.length || Boolean(busy)}
                    >
                      <span>🇰🇪 Pay with M-Pesa</span>
                      {files.length && priceKnown ? <span className="text-xs font-normal opacity-90">Ksh {total}</span> : null}
                    </button>
                    {abroadOn && (
                      <button
                        type="button"
                        className={`btn ${abroad ? 'btn-primary' : 'btn-outline'} flex flex-col items-center !py-3`}
                        disabled={!files.length || Boolean(busy)}
                        onClick={() => setAbroad(v => !v)}
                        aria-expanded={abroad}
                      >
                        <span>🌍 Paying from outside Kenya</span>
                        <span className="text-xs font-normal">{abroad ? 'Choose below' : 'Wise, WorldRemit, Binance…'}</span>
                      </button>
                    )}
                  </div>
                  {abroadOn && abroad && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                      <div className="text-sm font-semibold">How will you pay?</div>
                      {intlOn && (
                        <button type="button" className="btn btn-outline w-full flex flex-col items-start !py-3 text-left"
                          disabled={!files.length || Boolean(busy)} onClick={e => pay(e, 'intl')}>
                          <span>📱 Send to M-Pesa from abroad{files.length && priceKnown ? ` — Ksh ${total}` : ''}</span>
                          <span className="text-xs font-normal text-gray-500">Wise, WorldRemit, Remitly, Vodacom M-Pesa TZ, Airtel Money…</span>
                        </button>
                      )}
                      {binanceOn && (
                        <button
                          type="button"
                          className="btn w-full flex flex-col items-start !py-3 text-left bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50"
                          disabled={!files.length || Boolean(busy) || binanceBlocked}
                          onClick={e => pay(e, 'binance')}
                          title={binanceBlocked ? 'Not available with a reseller code' : 'Binance Pay (USDT)'}
                        >
                          <span>🟡 Binance{!binanceBlocked && usdt ? ` — ${usdt.toFixed(2)} USDT` : ' (USDT)'}</span>
                          <span className="text-xs font-normal">{binanceBlocked ? 'Not available with a reseller code — use M-Pesa from abroad' : 'Binance Pay, no fees'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </form>
        )}

        {busy && <p className="mt-4 text-sm font-medium">{busy}</p>}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {status && (() => {
          const isManual = ['BINANCE_USDT', 'INTL_MPESA'].includes(status.paymentMethod)
          const intl = status.paymentMethod === 'INTL_MPESA' ? status.manualPay : null
          return (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-gray-500">Order {status.orderId}</div>
              <div className="font-semibold">
                {status.paymentMethod === 'BINANCE_USDT' && stage === 'PAYMENT' ? 'Waiting for your Binance payment'
                  : intl && stage === 'PAYMENT' ? 'Waiting for your transfer' : STAGE_TEXT[stage] || stage}
              </div>
              {status.paymentMethod === 'BINANCE_USDT' && status.binance
                ? <div className="text-sm">Amount: {Number(status.binance.amount).toFixed(2)} USDT (Binance)</div>
                : status.amount ? <div className="text-sm">Amount: Ksh. {status.amount}</div> : null}
            </div>

            {['PAID', 'PROCESSING', 'PARTLY_DELIVERED'].includes(stage) && !status.deleted && (
              <NotifyButton label="🔔 Notify me when my reports are ready" />
            )}

            {status.paymentMethod === 'BINANCE_USDT' && status.binance && stage === 'PAYMENT' && (
              <div className="rounded-xl border-2 border-yellow-400 p-3 space-y-3">
                <div className="font-semibold">🟡 Pay {Number(status.binance.amount).toFixed(2)} USDT with Binance Pay</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>Binance Pay ID: <strong>{status.binance.id}</strong></span>
                    <CopyButton text={status.binance.id} />
                  </div>
                  <div>Name: <strong>{status.binance.name}</strong></div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Note: <strong>{status.binance.note}</strong></span>
                    <CopyButton text={status.binance.note} />
                  </div>
                  <p className="text-xs text-gray-500">Send exactly {Number(status.binance.amount).toFixed(2)} USDT and put the note in the Binance payment note.</p>
                </div>
                {status.binance.orderIdSent ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    ✅ Binance Order ID {status.binance.orderIdSent} received. Support will confirm your payment shortly — this page
                    updates automatically.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">After paying: Binance Order ID (from Payment Details)</label>
                    <input className={inputClass} value={binanceId} onChange={e => setBinanceId(e.target.value)} placeholder="e.g. 321547896541235" />
                    <label className="block text-sm font-medium">Screenshot (optional)</label>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setBinanceShot(e.target.files?.[0] || null)} />
                    <button className="btn btn-primary w-full" onClick={sendBinanceProof} disabled={Boolean(busy) || binanceId.trim().length < 8}>
                      I've paid
                    </button>
                  </div>
                )}
              </div>
            )}
            {intl && stage === 'PAYMENT' && (
              <div className="rounded-xl border-2 border-emerald-500 p-3 space-y-3">
                <div className="font-semibold">📱 Send Ksh {intl.amount} to M-Pesa from abroad</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>M-Pesa number: <strong>{intl.number}</strong></span>
                    <CopyButton text={intl.number} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Name: <strong>{intl.name}</strong></span>
                    <CopyButton text={intl.name} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Amount to arrive: <strong>Ksh {intl.amount}</strong></span>
                    <CopyButton text={intl.amount} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Reference / note: <strong>{intl.note}</strong></span>
                    <CopyButton text={intl.note} />
                  </div>
                  <p className="text-xs text-gray-500">
                    Use Wise, WorldRemit, Remitly, Vodacom M-Pesa (TZ), Airtel Money or any service that sends to Kenyan M-Pesa. Choose
                    Kenya → M-Pesa (mobile money) and add the reference in the note if the service allows it.
                  </p>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    ⚠️ The full Ksh {intl.amount} must arrive. Sending fees are yours — choose “recipient gets Ksh {intl.amount}” where offered.
                  </p>
                </div>
                {intl.refSent ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    ✅ Transfer reference {intl.refSent} received. Support will confirm your payment once the money arrives — this page
                    updates automatically.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">After sending: transfer reference (from the service's receipt)</label>
                    <input className={inputClass} value={binanceId} onChange={e => setBinanceId(e.target.value)} placeholder="e.g. Wise #123456789 or the M-Pesa code" />
                    <label className="block text-sm font-medium">Screenshot of the receipt (optional)</label>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setBinanceShot(e.target.files?.[0] || null)} />
                    <button className="btn btn-primary w-full" onClick={sendBinanceProof} disabled={Boolean(busy) || binanceId.trim().length < 8}>
                      I've paid
                    </button>
                  </div>
                )}
              </div>
            )}
            {intl && stage === 'PAYMENT_FAILED' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                The transfer was not confirmed. If you sent it, message support below with your transfer reference.
              </p>
            )}
            {status.paymentMethod === 'BINANCE_USDT' && stage === 'PAYMENT_FAILED' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                The Binance payment was not confirmed. If you paid, message support below with your Binance Order ID.
              </p>
            )}

            {!isManual && stage === 'PAYMENT' && (
              <p className="text-sm">
                Check your phone and enter your M-Pesa PIN. This page updates automatically once payment is confirmed.
              </p>
            )}
            {!isManual && stage === 'PAYMENT_FAILED' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                The M-Pesa request did not go through. Check the number and tap “Resend M-Pesa request”, or pay
                to the till and paste the M-Pesa message below.
              </p>
            )}
            {['PAYMENT', 'PAYMENT_FAILED'].includes(stage) && (
              <div className="flex flex-wrap gap-2">
                {!isManual && (
                  <>
                    <input className={`${inputClass} max-w-xs`} value={phone} onChange={e => setPhone(e.target.value)} />
                    <button className="btn btn-primary" onClick={resend} disabled={Boolean(busy)}>
                      Resend M-Pesa request
                    </button>
                  </>
                )}
                <button className="btn btn-outline" onClick={cancelOrder}>
                  Cancel order
                </button>
              </div>
            )}

            {['PAYMENT', 'PAYMENT_FAILED'].includes(stage) && config?.tillNumber && !isManual && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <div className="font-semibold text-sm">
                  Paid via Buy Goods Till {config.tillNumber} instead? (Ksh. {status.amount})
                </div>
                {status.proofSubmitted ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    ✅ Payment message received. Support will confirm it shortly — this page updates automatically.
                  </p>
                ) : (
                  <>
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={sms}
                      onChange={e => setSms(e.target.value)}
                      placeholder="Paste the full M-Pesa confirmation message here"
                    />
                    <button className="btn btn-primary" onClick={sendProof} disabled={Boolean(busy) || sms.trim().length < 20}>
                      Send payment confirmation
                    </button>
                  </>
                )}
              </div>
            )}

            {status.reports?.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold">Your reports</div>
                {status.reports.map(r => (
                  <a
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800"
                    href={reportsApi.reportUrl(status.orderId, order.token, r.id)}
                  >
                    <span className="truncate">📄 {r.name}</span>
                    <span className="text-sm text-blue-600 dark:text-blue-400">Download</span>
                  </a>
                ))}
                <p className="text-xs text-gray-500">
                  Only this device can open this order. Reports are removed automatically after 48 hours.
                </p>
              </div>
            )}

            {status.highlights?.length > 0 && !status.deleted && (
              <HighlightsOffer order={order} items={status.highlights} defaultPhone={phone} onStatus={setStatus} />
            )}

            {stage === 'DELIVERED' && !status.deleted && (
              <button className="btn btn-outline text-sm text-red-600" onClick={deleteFiles}>
                🗑 Delete my documents and reports
              </button>
            )}
            {status.deleted && (
              <p className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3 text-sm">
                Your documents and reports have been deleted from our server.
              </p>
            )}

            <div>
              <TurnitinMessages key={order.orderId} orderId={order.orderId} messages={status.messages || []} />
              {status.chatOpensAt && !status.deleted && (
                <p className="mt-2 rounded-xl bg-gray-50 dark:bg-slate-800 p-3 text-sm text-gray-700 dark:text-gray-300">
                  ⏳ Your reports are processing and usually arrive in time. Messaging opens at{' '}
                  <b>{new Date(status.chatOpensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b> if they
                  have not arrived by then.
                </p>
              )}
              {stage !== 'CANCELLED' && !status.deleted && !status.chatOpensAt && (
                <div className="mt-2 flex gap-2">
                  <input
                    className={inputClass}
                    value={note}
                    maxLength={1000}
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && note.trim() && sendNote()}
                    placeholder="Message support about this order…"
                  />
                  <button className="btn btn-outline whitespace-nowrap" onClick={sendNote} disabled={!note.trim() || Boolean(busy)}>
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
          )
        })()}

        {!order && recent.length > 0 && (
          <RecentOrders recent={recent} onOpen={openSaved} onForget={forgetSaved} />
        )}
      </div>
    </div>
  )
}
