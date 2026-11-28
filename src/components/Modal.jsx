import React, { useEffect, useRef, useState } from 'react'
import OrderChat from './OrderChat.jsx'
import { rememberShopOrder, SHOP_API } from '../shopChat.js'
import { reportsApi } from '../reportsApi.js'

const BUSINESS_WHATSAPP_E164 = '254701730921'
const API_BASE = SHOP_API

const OLD_WHATSAPP_REMINDER = 'After payment, please enter your WhatsApp number as requested so we can complete your order.'
const WHATSAPP_REMINDER = 'After payment, please enter your WhatsApp number as requested so we can complete your order. Incase of inquiry, WhatsApp 0701730921.'
// JK_SHOP_NOTE_WORDING_V1: names the button customers actually see (💬 Other Service Orders).
const CHAT_REMINDER = 'After paying, your login details are sent right here in the order chat. You can reopen it anytime from 💬 Other Service Orders (bottom right). Need help? WhatsApp 0701730921.'

async function apiJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data?.error || 'Request failed')
  }

  return data
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-outline !px-2 !py-1 text-xs"
      onClick={() => navigator.clipboard?.writeText(String(text)).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})}
    >
      {done ? '✓ Copied' : '📋 Copy'}
    </button>
  )
}

function makeWhatsAppLink(orderId, itemName) {
  const text = `Hello, I have completed payment and I am ready to receive my logins.\nOrder ID: ${orderId}\nProduct: ${itemName}`
  return `https://wa.me/${BUSINESS_WHATSAPP_E164}?text=${encodeURIComponent(text)}`
}

function getLinkLabel(url) {
  try {
    const u = new URL(url)

    if (u.hostname === 't.me' && u.pathname === '/JKTurnitinBot') {
      return 'JK Turnitin Bot'
    }

    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function linkifyText(text) {
  if (!text) return null

  const urlRegex = /https?:\/\/[^\s]+/g
  const parts = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = urlRegex.exec(text)) !== null) {
    const urlRaw = match[0]
    const start = match.index

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start))
    }

    let url = urlRaw
    let trailing = ''
    while (/[).,!?:;]$/.test(url)) {
      trailing = url.slice(-1) + trailing
      url = url.slice(0, -1)
    }

    parts.push(
      <a
        key={`link-${key++}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline text-blue-600 dark:text-blue-400"
      >
        {getLinkLabel(url)}
      </a>,
    )

    if (trailing) parts.push(trailing)
    lastIndex = start + urlRaw.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function cleanDescription(description) {
  if (!description) return ''

  return description
    .replace(OLD_WHATSAPP_REMINDER, '')
    .replace(WHATSAPP_REMINDER, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function Modal({ open, item, onClose }) {
  const [step, setStep] = useState('payment')
  const [paymentPhone, setPaymentPhone] = useState('')
  const [whatsAppNumber, setWhatsAppNumber] = useState('')
  const [mpesaName, setMpesaName] = useState('')
  const [orderId, setOrderId] = useState('')
  const [chatToken, setChatToken] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)
  // JK_SHOP_INTL_MPESA_V1: paying from outside Kenya (M-Pesa from abroad).
  const [intlInfo, setIntlInfo] = useState(null) // { number, name } from the JK Turnitin Bot's settings
  const [binanceInfo, setBinanceInfo] = useState(null) // JK_SHOP_BINANCE_V1: { kesPerUsdt, id, name }
  const [abroad, setAbroad] = useState(false)
  const [manualPay, setManualPay] = useState(null)
  const [transferRef, setTransferRef] = useState('')
  const [shot, setShot] = useState(null)

  useEffect(() => {
    if (!open) return
    let live = true
    Promise.all([apiJson('/api/shop/options'), reportsApi.config()])
      .then(([shop, bot]) => {
        if (live && shop?.intlMpesa?.enabled && bot?.intlMpesa?.enabled && bot.intlMpesa.number) {
          setIntlInfo({ number: bot.intlMpesa.number, name: bot.intlMpesa.name })
        }
        if (live && shop?.binance?.enabled) setBinanceInfo(shop.binance)
      })
      .catch(() => {})
    return () => { live = false }
  }, [open])

  useEffect(() => {
    if (!open) {
      setAbroad(false)
      setManualPay(null)
      setTransferRef('')
      setShot(null)
      setStep('payment')
      setPaymentPhone('')
      setWhatsAppNumber('')
      setMpesaName('')
      setOrderId('')
      setChatToken('')
      setStatusMessage('')
      setError('')
      setLoading(false)

      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  if (!open || !item) return null

  const itemDescription = cleanDescription(item.description)

  async function startCheckout(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await apiJson('/api/shop/checkout', {
        method: 'POST',
        body: JSON.stringify({
          productId: item.id,
          paymentPhone,
        }),
      })

      setOrderId(response.orderId)
      if (response.chatToken) setChatToken(response.chatToken)
      setStep('waiting')
      setStatusMessage('STK Push sent. Complete the payment on your phone.')

      startPolling(response.orderId, response.chatToken)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function startIntl(method = 'INTL_MPESA') {
    setError('')
    setLoading(true)
    try {
      const response = await apiJson('/api/shop/checkout-intl', { method: 'POST', body: JSON.stringify({ productId: item.id, method }) })
      setOrderId(response.orderId)
      setChatToken(response.chatToken)
      setManualPay(response.manualPay)
      setStep('intl')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function sendTransferProof() {
    setError('')
    if (shot && shot.size > 5 * 1024 * 1024) return setError('The screenshot must be 5 MB or smaller.')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/shop/orders/${encodeURIComponent(orderId)}/payment-proof`, {
        method: 'PUT',
        headers: { 'Content-Type': shot?.type || 'application/octet-stream', 'X-Order-Token': chatToken, 'X-Payment-Ref': transferRef.trim() },
        body: shot || '',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Request failed')
      setManualPay(data.manualPay)
      // Saved under 💬 Other Service Orders now, so the customer can come back while we check.
      rememberShopOrder({ orderId, token: chatToken, product: item.name })
      startPolling(orderId, chatToken, { manual: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function startPolling(newOrderId, newChatToken, { manual = false } = {}) {
    // Saved under 💬 Other Service Orders only once paid (the chat is for paid orders).
    const rememberPaid = () =>
      newChatToken && rememberShopOrder({ orderId: newOrderId, token: newChatToken, product: item.name })
    let tries = 0
    // An M-Pesa prompt is answered in minutes; a transfer from abroad is
    // checked by hand, so keep watching for up to an hour.
    const maxTries = manual ? 900 : 150

    if (pollRef.current) {
      clearInterval(pollRef.current)
    }

    pollRef.current = setInterval(async () => {
      tries += 1

      if (tries > maxTries) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setStatusMessage(
          manual
            ? 'Still checking your transfer. You can close this window: reopen the order anytime from 💬 Other Service Orders.'
            : 'Payment is taking longer than expected. Please wait a little and try again.',
        )
        return
      }

      try {
        const response = await apiJson(`/api/shop/payment-status/${newOrderId}`)

        if (
          response.paymentState === 'COMPLETE' &&
          response.status === 'PAID_AWAITING_WHATSAPP'
        ) {
          clearInterval(pollRef.current)
          pollRef.current = null
          rememberPaid()
          setStep('delivery')
          setStatusMessage('')
          return
        }

        if (
          response.paymentState === 'COMPLETE' &&
          response.status === 'PAID_READY_FOR_FULFILLMENT'
        ) {
          clearInterval(pollRef.current)
          pollRef.current = null
          rememberPaid()
          setStep('success')
          return
        }

        if (
          ['PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_EXPIRED'].includes(
            response.status,
          )
        ) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setError(`Payment not completed: ${response.status.replaceAll('_', ' ')}`)
          setStep('payment')
          return
        }

        if (manual) {
          // Rejected by support: show the reference form again.
          if (response.manualPay && !response.manualPay.refSent) {
            clearInterval(pollRef.current)
            pollRef.current = null
            setManualPay(response.manualPay)
          }
          return
        }
        setStatusMessage(`Payment status: ${response.paymentState}`)
      } catch {
        setStatusMessage('Checking payment...')
      }
    }, 2000)
  }

  async function submitDeliveryDetails(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await apiJson('/api/shop/delivery-details', {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          whatsappNumber: whatsAppNumber,
          mpesaName,
        }),
      })

      setStep('success')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative card max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <h3 className="text-xl font-bold">{item.name}</h3>

        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {linkifyText(itemDescription)}
        </p>

        <p className="mt-3 font-semibold italic text-red-600 dark:text-red-400">
          {CHAT_REMINDER}
        </p>

        <p className="mt-1 font-semibold">{`Ksh. ${item.price}`}</p>

        {step === 'payment' && (
          <form onSubmit={startCheckout} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">M-Pesa Number</label>
              <input
                type="text"
                value={paymentPhone}
                onChange={e => setPaymentPhone(e.target.value)}
                placeholder="07XXXXXXXX / 01XXXXXXXX / 2547XXXXXXXX"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
                required
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Enter the number you want to pay with.
              </p>
            </div>

            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

            <div className="flex flex-wrap gap-3 justify-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending STK Push...' : '🇰🇪 Pay with M-Pesa'}
              </button>
              {(intlInfo || binanceInfo) && (
                <button type="button" className={`btn btn-outline ${abroad ? 'ring-2 ring-primary' : ''}`} onClick={() => setAbroad(v => !v)} aria-expanded={abroad}>
                  🌍 Paying from outside Kenya
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Cancel
              </button>
            </div>
            {(intlInfo || binanceInfo) && abroad && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <div className="text-sm font-semibold">How will you pay?</div>
                {intlInfo && (
                  <button type="button" className="btn btn-outline w-full flex flex-col items-start !py-3 text-left" disabled={loading} onClick={() => startIntl('INTL_MPESA')}>
                    <span>📱 Send to M-Pesa from abroad — Ksh {item.price}</span>
                    <span className="text-xs font-normal text-gray-500">Wise, WorldRemit, Remitly, Vodacom M-Pesa TZ, Airtel Money…</span>
                  </button>
                )}
                {binanceInfo && (
                  <button type="button" className="btn w-full flex flex-col items-start !py-3 text-left bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50"
                    disabled={loading} onClick={() => startIntl('BINANCE_USDT')}>
                    <span>🟡 Binance — {(Math.ceil((item.price / binanceInfo.kesPerUsdt) * 100 - 1e-9) / 100).toFixed(2)} USDT</span>
                    <span className="text-xs font-normal">Binance Pay, no fees</span>
                  </button>
                )}
              </div>
            )}
          </form>
        )}

        {step === 'intl' && manualPay?.method === 'BINANCE_USDT' && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border-2 border-yellow-400 p-3 space-y-3">
              <div className="font-semibold">🟡 Pay {Number(manualPay.amount).toFixed(2)} USDT with Binance Pay</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>Binance Pay ID: <strong>{manualPay.id}</strong></span>
                  <CopyButton text={manualPay.id} />
                </div>
                <div>Name: <strong>{manualPay.name}</strong></div>
                <div className="flex items-center justify-between gap-2">
                  <span>Note: <strong>{manualPay.note}</strong></span>
                  <CopyButton text={manualPay.note} />
                </div>
                <p className="text-xs text-gray-500">Send exactly {Number(manualPay.amount).toFixed(2)} USDT and put the note in the Binance payment note.</p>
              </div>
              {manualPay.refSent ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  ✅ Binance Order ID {manualPay.refSent} received. Support will confirm your payment shortly — this window updates
                  automatically, and the order is saved under 💬 Other Service Orders. {statusMessage}
                </p>
              ) : (
                <div className="space-y-2">
                  {manualPay.rejected && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      We could not find your Binance payment yet. Check the Order ID (and that the full USDT amount was sent), then send it again.
                    </p>
                  )}
                  <label className="block text-sm font-medium">After paying: Binance Order ID (from Payment Details)</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
                    value={transferRef}
                    onChange={e => setTransferRef(e.target.value)}
                    placeholder="e.g. 321547896541235"
                  />
                  <label className="block text-sm font-medium">Screenshot (optional)</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setShot(e.target.files?.[0] || null)} />
                  <button type="button" className="btn btn-primary w-full" onClick={sendTransferProof} disabled={loading || transferRef.trim().length < 8}>
                    {loading ? 'Sending…' : "I've paid"}
                  </button>
                </div>
              )}
            </div>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex justify-end">
              <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {step === 'intl' && manualPay?.method !== 'BINANCE_USDT' && manualPay && intlInfo && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border-2 border-emerald-500 p-3 space-y-3">
              <div className="font-semibold">📱 Send Ksh {manualPay.amount} to M-Pesa from abroad</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>M-Pesa number: <strong>{intlInfo.number}</strong></span>
                  <CopyButton text={intlInfo.number} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Name: <strong>{intlInfo.name}</strong></span>
                  <CopyButton text={intlInfo.name} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Amount to arrive: <strong>Ksh {manualPay.amount}</strong></span>
                  <CopyButton text={manualPay.amount} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Reference / note: <strong>{manualPay.note}</strong></span>
                  <CopyButton text={manualPay.note} />
                </div>
                <p className="text-xs text-gray-500">
                  Use Wise, WorldRemit, Remitly, Vodacom M-Pesa (TZ), Airtel Money or any service that sends to Kenyan M-Pesa. Choose
                  Kenya → M-Pesa (mobile money) and add the reference in the note if the service allows it.
                </p>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  ⚠️ The full Ksh {manualPay.amount} must arrive. Sending fees are yours — choose “recipient gets Ksh {manualPay.amount}” where offered.
                </p>
              </div>
              {manualPay.refSent ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  ✅ Transfer reference {manualPay.refSent} received. Support will confirm your payment once the money arrives — this window
                  updates automatically, and the order is saved under 💬 Other Service Orders. {statusMessage}
                </p>
              ) : (
                <div className="space-y-2">
                  {manualPay.rejected && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      We could not find your transfer yet. Check the reference (and that the full amount arrived), then send it again.
                    </p>
                  )}
                  <label className="block text-sm font-medium">After sending: transfer reference (from the service's receipt)</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
                    value={transferRef}
                    onChange={e => setTransferRef(e.target.value)}
                    placeholder="e.g. Wise #123456789 or the M-Pesa code"
                  />
                  <label className="block text-sm font-medium">Screenshot of the receipt (optional)</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setShot(e.target.files?.[0] || null)} />
                  <button type="button" className="btn btn-primary w-full" onClick={sendTransferProof} disabled={loading || transferRef.trim().length < 6}>
                    {loading ? 'Sending…' : "I've paid"}
                  </button>
                </div>
              )}
            </div>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex justify-end">
              <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {step === 'waiting' && (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-gray-100 dark:bg-slate-800 p-4 text-sm">
              {statusMessage || 'Waiting for payment confirmation...'}
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {step === 'delivery' && (
          <form onSubmit={submitDeliveryDetails} className="mt-5 space-y-4">
            <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 p-4 text-sm text-green-700 dark:text-green-300">
              Payment confirmed. Your logins will be sent in the order chat on this page. You can also leave your WhatsApp number if you'd like us to reach you there.
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Your WhatsApp Number</label>
              <input
                type="text"
                value={whatsAppNumber}
                onChange={e => setWhatsAppNumber(e.target.value)}
                placeholder="07XXXXXXXX / 01XXXXXXXX / 2547XXXXXXXX"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">M-Pesa Name (optional)</label>
              <input
                type="text"
                value={mpesaName}
                onChange={e => setMpesaName(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
              />
            </div>

            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

            <div className="flex gap-3 justify-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Continue'}
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 p-4 text-sm text-green-700 dark:text-green-300">
              <p className="font-semibold">Order received successfully.</p>
              <p className="mt-1">Order ID: {orderId}</p>
              <p className="mt-1">
                {chatToken
                  ? 'JK Support will send your logins in the chat below. You can close this window — reopen it anytime from 💬 Other Service Orders.'
                  : 'Tap below to continue on WhatsApp and receive your logins.'}
              </p>
            </div>

            {chatToken && <OrderChat orderId={orderId} token={chatToken} />}

            <div className="flex flex-wrap gap-3 justify-end items-center">
              <a
                className={chatToken ? 'text-sm underline text-gray-600 dark:text-gray-300' : 'btn btn-primary'}
                href={makeWhatsAppLink(orderId, item.name)}
                target="_blank"
                rel="noreferrer"
              >
                {chatToken ? 'You can also reach us on WhatsApp' : 'Continue on WhatsApp'}
              </a>
              <button type="button" className={chatToken ? 'btn btn-primary' : 'btn btn-outline'} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



