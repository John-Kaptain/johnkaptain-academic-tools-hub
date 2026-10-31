import React, { useEffect, useMemo, useRef, useState } from 'react'
import { reportsApi, rememberOrder, savedOrders, forgetOrder } from '../reportsApi.js'

const TELEGRAM_BOT = 'https://t.me/JKTurnitinBot'
const STAGE_TEXT = {
  DRAFT: 'Preparing order',
  PAYMENT: 'Waiting for M-Pesa payment',
  PAYMENT_FAILED: 'Payment not completed',
  PROCESSING: 'Payment confirmed. Your reports are being prepared.',
  PARTLY_DELIVERED: 'Reports arriving',
  DELIVERED: 'Reports ready',
  CANCELLED: 'Order cancelled',
}
const inputClass =
  'w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 outline-none'

function formatSize(bytes) {
  if (!bytes) return ''
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

export default function ReportsCheckout({ open, presetType, onClose }) {
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
  const pollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setConfigError('')
    setRecent(savedOrders())
    reportsApi.config().then(setConfig).catch(err => setConfigError(err.message))
  }, [open])

  useEffect(() => () => clearInterval(pollRef.current), [])

  useEffect(() => {
    if (!open) {
      clearInterval(pollRef.current)
      setFiles([])
      setCode('')
      setOrder(null)
      setStatus(null)
      setBusy('')
      setError('')
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
  const priceOf = type => services.find(s => s.type === type)?.price ?? null
  const total = files.reduce((sum, f) => sum + (priceOf(f.type) || 0), 0)
  const needsCode = files.some(f => services.find(s => s.type === f.type)?.needsCode)
  const priceKnown = files.every(f => priceOf(f.type) !== null)

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

  function startPolling(orderId, token) {
    clearInterval(pollRef.current)
    const tick = async () => {
      try {
        const res = await reportsApi.status(orderId, token)
        setStatus(res.status)
        if (['DELIVERED', 'CANCELLED'].includes(res.status.stage)) clearInterval(pollRef.current)
      } catch (err) {
        setError(err.message)
      }
    }
    tick()
    pollRef.current = setInterval(tick, 4000)
  }

  async function pay(e) {
    e.preventDefault()
    setError('')
    if (!files.length) return setError('Add at least one document.')
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
      setBusy('Sending M-Pesa request…')
      const res = await reportsApi.checkout(current.orderId, current.token, {
        files: files.map(f => ({ type: f.type, filter: config.similarityFilterChoice ? f.filter : undefined })),
        code: needsCode ? code : '',
        phone,
      })
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
    setOrder(saved)
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
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Same service and prices as the{' '}
              <a className="underline text-blue-600 dark:text-blue-400" href={TELEGRAM_BOT} target="_blank" rel="noreferrer">
                JK Turnitin Bot
              </a>
              . Reports download here when ready.
            </p>
          </div>
          <button className="btn btn-outline px-3" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {configError && (
          <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
            {configError}{' '}
            <a className="underline" href={TELEGRAM_BOT} target="_blank" rel="noreferrer">
              Open the Telegram bot
            </a>
          </div>
        )}

        {config && (!config.enabled || !config.open) && !order && (
          <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 p-3 text-sm">
            {config.closedMessage || 'Website orders are temporarily unavailable.'}
          </div>
        )}

        {config && config.enabled && config.open && showForm && (
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
                      <option value="UNFILTERED">Do not filter</option>
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

            <div>
              <label className="block text-sm font-medium mb-1">M-Pesa number</label>
              <input
                className={inputClass}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="07XXXXXXXX / 01XXXXXXXX"
                required
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">
                {files.length ? (priceKnown ? `Total: Ksh. ${total}` : 'Total shown after code check') : ''}
              </div>
              <button className="btn btn-primary" disabled={!files.length || Boolean(busy)}>
                Pay with M-Pesa
              </button>
            </div>
          </form>
        )}

        {busy && <p className="mt-4 text-sm font-medium">{busy}</p>}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {status && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-gray-500">Order {status.orderId}</div>
              <div className="font-semibold">{STAGE_TEXT[stage] || stage}</div>
              {status.amount ? <div className="text-sm">Amount: Ksh. {status.amount}</div> : null}
            </div>

            {stage === 'PAYMENT' && (
              <p className="text-sm">
                Check your phone and enter your M-Pesa PIN. This page updates automatically once payment is confirmed.
              </p>
            )}
            {stage === 'PAYMENT_FAILED' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                The M-Pesa request did not go through. Check the number and tap “Resend M-Pesa request”. If you pay to
                the till directly instead, contact support with your order number so it can be matched.
              </p>
            )}
            {['PAYMENT', 'PAYMENT_FAILED'].includes(stage) && (
              <div className="flex flex-wrap gap-2">
                <input className={`${inputClass} max-w-xs`} value={phone} onChange={e => setPhone(e.target.value)} />
                <button className="btn btn-primary" onClick={resend} disabled={Boolean(busy)}>
                  Resend M-Pesa request
                </button>
                <button className="btn btn-outline" onClick={cancelOrder}>
                  Cancel order
                </button>
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
                  Only this device can open this order. Reports are removed automatically after 14 days.
                </p>
              </div>
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

            {status.messages?.length > 0 && (
              <div>
                <div className="font-semibold text-sm">Updates</div>
                <ul className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  {status.messages
                    .slice()
                    .reverse()
                    .map((m, k) => (
                      <li key={k} className="whitespace-pre-line rounded-lg bg-gray-50 dark:bg-slate-800 p-2">
                        {m.text}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!order && recent.length > 0 && (
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-sm font-semibold">Your recent orders on this device</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent.map(o => (
                <span key={o.orderId} className="inline-flex items-center gap-1">
                  <button className="btn btn-outline text-sm" onClick={() => openSaved(o)}>
                    {o.orderId}
                  </button>
                  <button
                    className="text-xs text-gray-500 hover:text-red-600"
                    title="Remove from this device"
                    onClick={() => forgetSaved(o.orderId)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
