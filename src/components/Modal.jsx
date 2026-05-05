import React, { useEffect, useRef, useState } from 'react'

const BUSINESS_WHATSAPP_E164 = '254701730921'
const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin

const WHATSAPP_REMINDER =
  'After payment, please enter your WhatsApp number as requested so we can complete your order.'

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

function makeWhatsAppLink(orderId, itemName) {
  const text = `Hello, I have completed payment and I am ready to receive my logins.\nOrder ID: ${orderId}\nProduct: ${itemName}`
  return `https://wa.me/${BUSINESS_WHATSAPP_E164}?text=${encodeURIComponent(text)}`
}

function getLinkLabel(url) {
  try {
    const u = new URL(url)
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
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setStep('payment')
      setPaymentPhone('')
      setWhatsAppNumber('')
      setMpesaName('')
      setOrderId('')
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
      const response = await apiJson('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          productId: item.id,
          paymentPhone,
        }),
      })

      setOrderId(response.orderId)
      setStep('waiting')
      setStatusMessage('STK Push sent. Complete the payment on your phone.')

      startPolling(response.orderId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function startPolling(newOrderId) {
    let tries = 0
    const maxTries = 60

    if (pollRef.current) {
      clearInterval(pollRef.current)
    }

    pollRef.current = setInterval(async () => {
      tries += 1

      if (tries > maxTries) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setStatusMessage(
          'Payment is taking longer than expected. Please wait a little and try again.',
        )
        return
      }

      try {
        const response = await apiJson(`/api/payment-status/${newOrderId}`)

        if (
          response.paymentState === 'COMPLETE' &&
          response.status === 'PAID_AWAITING_WHATSAPP'
        ) {
          clearInterval(pollRef.current)
          pollRef.current = null
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

        setStatusMessage(`Payment status: ${response.paymentState}`)
      } catch {
        setStatusMessage('Checking payment...')
      }
    }, 5000)
  }

  async function submitDeliveryDetails(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await apiJson('/api/delivery-details', {
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

      <div className="relative card max-w-lg w-full">
        <h3 className="text-xl font-bold">{item.name}</h3>

        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {linkifyText(itemDescription)}
        </p>

        <p className="mt-3 font-semibold italic text-red-600 dark:text-red-400">
          {WHATSAPP_REMINDER}
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

            <div className="flex gap-3 justify-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending STK Push...' : 'Pay Now'}
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
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
              Payment confirmed. Enter the WhatsApp number where you want your logins delivered.
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">WhatsApp Number</label>
              <input
                type="text"
                value={whatsAppNumber}
                onChange={e => setWhatsAppNumber(e.target.value)}
                placeholder="07XXXXXXXX / 01XXXXXXXX / 2547XXXXXXXX"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 px-4 py-3 outline-none"
                required
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
                {loading ? 'Saving...' : 'Submit Delivery Number'}
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
              <p className="mt-1">Tap below to continue on WhatsApp and receive your logins.</p>
            </div>

            <div className="flex gap-3 justify-end">
              <a
                className="btn btn-primary"
                href={makeWhatsAppLink(orderId, item.name)}
                target="_blank"
                rel="noreferrer"
              >
                Continue on WhatsApp
              </a>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}