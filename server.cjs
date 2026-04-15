require('dotenv').config()

const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const qs = require('querystring')
const { findProductById } = require('./products.server.cjs')

const app = express()
const PORT = Number(process.env.PORT || 4000)

const INTASEND_TEST =
  String(process.env.INTASEND_TEST_ENVIRONMENT || 'true').toLowerCase() === 'true'

const INTASEND_PUBLISHABLE_KEY = INTASEND_TEST
  ? String(process.env.INTASEND_TEST_PUBLISHABLE_KEY || '')
  : String(process.env.INTASEND_LIVE_PUBLISHABLE_KEY || '')

const INTASEND_SECRET_KEY = INTASEND_TEST
  ? String(process.env.INTASEND_TEST_SECRET_KEY || '')
  : String(process.env.INTASEND_LIVE_SECRET_KEY || '')

const INTASEND_WEBHOOK_CHALLENGE = String(
  process.env.INTASEND_WEBHOOK_CHALLENGE || '',
).trim()

const INTASEND_API_BASE = 'https://api.intasend.com/api/v1'

const BUSINESS_WHATSAPP_NUMBER = String(process.env.BUSINESS_WHATSAPP_NUMBER || '').trim()

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
const TELEGRAM_ADMIN_CHAT_ID = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim()

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean)

const INACTIVE_START_EAT = normalizeHHMM(process.env.INACTIVE_START_EAT, '00:00')
const INACTIVE_END_EAT = normalizeHHMM(process.env.INACTIVE_END_EAT, '06:00')

const STORE_FILE = path.join(__dirname, 'orders.store.json')
const STATUS_POLL_INTERVAL_MS = 10000
const STATUS_POLL_MAX_ATTEMPTS = 48

const ORDER_STATUS = {
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID_AWAITING_WHATSAPP: 'PAID_AWAITING_WHATSAPP',
  PAID_READY_FOR_FULFILLMENT: 'PAID_READY_FOR_FULFILLMENT',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
}

let orders = {}
let activePollers = {}

function normalizeHHMM(value, fallback) {
  const s = String(value || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return fallback

  const hh = Number(m[1])
  const mm = Number(m[2])

  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return fallback
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function getCurrentEATHHMM() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function isTimeWithinWindow(current, start, end) {
  if (start === end) return false
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

function isPaymentInactivePeriod() {
  return isTimeWithinWindow(getCurrentEATHHMM(), INACTIVE_START_EAT, INACTIVE_END_EAT)
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify({}, null, 2), 'utf8')
      return
    }
    orders = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
  } catch {
    orders = {}
  }
}

function saveStore() {
  fs.writeFileSync(STORE_FILE, JSON.stringify(orders, null, 2), 'utf8')
}

function upsertOrder(orderId, patch) {
  orders[orderId] = {
    ...(orders[orderId] || {}),
    ...patch,
    updatedAt: Date.now(),
  }
  saveStore()
  return orders[orderId]
}

function getOrder(orderId) {
  return orders[orderId] || null
}

function findOrderByApiRef(apiRef) {
  return (
    Object.values(orders).find(
      order => String(order.apiRef || '') === String(apiRef || ''),
    ) || null
  )
}

function findOrderByInvoiceId(invoiceId) {
  return (
    Object.values(orders).find(
      order => String(order.invoiceId || '') === String(invoiceId || ''),
    ) || null
  )
}

function createOrderId() {
  return `ORD_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

function createPaymentRef(orderId) {
  return `PAY_${orderId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

function normalizePhoneTo254(phoneRaw) {
  const t = String(phoneRaw || '').trim().replace(/\s+/g, '')
  if (!t) return null
  if (t.startsWith('+')) {
    const x = t.slice(1)
    if (/^254(?:7|1)\d{8}$/.test(x)) return x
    return null
  }
  if (/^254(?:7|1)\d{8}$/.test(t)) return t
  if (/^0(?:7|1)\d{8}$/.test(t)) return '254' + t.slice(1)
  if (/^(?:7|1)\d{8}$/.test(t)) return '254' + t
  return null
}

function extractApiRef(payload) {
  return (
    payload?.api_ref ||
    payload?.apiRef ||
    payload?.invoice?.api_ref ||
    payload?.invoice?.apiRef ||
    payload?.data?.api_ref ||
    payload?.data?.apiRef ||
    payload?.payload?.api_ref ||
    payload?.payload?.apiRef ||
    null
  )
}

function extractInvoiceId(payload) {
  return (
    payload?.invoice_id ||
    payload?.invoiceId ||
    payload?.id ||
    payload?.invoice?.invoice_id ||
    payload?.invoice?.invoiceId ||
    payload?.invoice?.id ||
    payload?.data?.invoice_id ||
    payload?.data?.invoiceId ||
    payload?.data?.invoice?.invoice_id ||
    payload?.data?.invoice?.invoiceId ||
    payload?.data?.invoice?.id ||
    payload?.payload?.invoice_id ||
    payload?.payload?.invoiceId ||
    payload?.payload?.invoice?.invoice_id ||
    payload?.payload?.invoice?.invoiceId ||
    payload?.payload?.invoice?.id ||
    null
  )
}

function extractState(payload) {
  return (
    payload?.state ||
    payload?.status ||
    payload?.invoice?.state ||
    payload?.invoice?.status ||
    payload?.data?.state ||
    payload?.data?.status ||
    payload?.data?.invoice?.state ||
    payload?.data?.invoice?.status ||
    payload?.payload?.state ||
    payload?.payload?.status ||
    payload?.payload?.invoice?.state ||
    payload?.payload?.invoice?.status ||
    null
  )
}

function normalizePaymentState(raw) {
  const s = String(raw || '').trim().toUpperCase()

  if (['COMPLETE', 'COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PAID', 'TS100'].includes(s)) {
    return 'COMPLETE'
  }
  if (['FAILED', 'FAIL', 'ERROR', 'TF103', 'TF106'].includes(s)) {
    return 'FAILED'
  }
  if (['CANCELLED', 'CANCELED', 'TC108'].includes(s)) {
    return 'CANCELLED'
  }
  if (['EXPIRED', 'TIMEOUT', 'TIMEDOUT'].includes(s)) {
    return 'EXPIRED'
  }
  if (
    ['PENDING', 'PROCESSING', 'IN_PROGRESS', 'INPROGRESS', 'TP101', 'TP102', 'BP101', 'BP103'].includes(s)
  ) {
    return 'PENDING'
  }

  return s || 'UNKNOWN'
}

async function intasendRequest(endpoint, body) {
  const response = await fetch(`${INTASEND_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${INTASEND_SECRET_KEY}`,
    },
    body: JSON.stringify(body || {}),
  })

  const text = await response.text()
  let data

  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const error = new Error(
      (data && (data.detail || data.message || JSON.stringify(data))) ||
        `HTTP ${response.status}`,
    )
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

async function intasendSendStkPush({ amount, phone_number, api_ref }) {
  return intasendRequest('/payment/mpesa-stk-push/', {
    amount: String(amount),
    phone_number,
    api_ref,
  })
}

async function intasendCheckPaymentStatus({ invoice_id }) {
  return intasendRequest('/payment/status/', {
    invoice_id,
  })
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
    console.log('Telegram notification not configured. Message would be:')
    console.log(text)
    return
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text,
      }),
    },
  )

  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.ok) {
    throw new Error(data?.description || 'Failed to send Telegram message')
  }

  return data
}

async function notifyAdmin(order) {
  const text = [
    'New paid order ready for fulfillment',
    `Order ID: ${order.id}`,
    `Product: ${order.productName}`,
    `Amount: Ksh. ${order.amount}`,
    `Payment number: ${order.paymentPhone}`,
    `WhatsApp delivery number: ${order.deliveryWhatsAppNumber}`,
    `M-Pesa name: ${order.mpesaName || 'Not provided'}`,
    `Buyer WhatsApp link: https://wa.me/${order.deliveryWhatsAppNumber}`,
  ].join('\n')

  await sendTelegramMessage(text)
}

async function notifyAdminFailure(order, state) {
  const text = [
    'Payment was not completed',
    `Order ID: ${order.id}`,
    `Product: ${order.productName}`,
    `Amount: Ksh. ${order.amount}`,
    `Payment number: ${order.paymentPhone}`,
    `Status: ${state}`,
  ].join('\n')

  await sendTelegramMessage(text)
}

function stopStatusPolling(apiRef) {
  if (activePollers[apiRef]) {
    clearInterval(activePollers[apiRef])
    delete activePollers[apiRef]
  }
}

async function markOrderPaymentComplete(orderId, invoiceId, source) {
  const order = getOrder(orderId)
  if (!order) return

  const nextStatus = order.deliveryWhatsAppNumber
    ? ORDER_STATUS.PAID_READY_FOR_FULFILLMENT
    : ORDER_STATUS.PAID_AWAITING_WHATSAPP

  upsertOrder(orderId, {
    paymentState: 'COMPLETE',
    status: nextStatus,
    invoiceId: invoiceId || order.invoiceId || null,
    paymentConfirmedAt: Date.now(),
    paymentConfirmationSource: source || 'unknown',
  })

  const updated = getOrder(orderId)

  if (updated.status === ORDER_STATUS.PAID_READY_FOR_FULFILLMENT && !updated.adminNotifiedAt) {
    try {
      await notifyAdmin(updated)
      upsertOrder(orderId, { adminNotifiedAt: Date.now() })
    } catch (err) {
      console.error('Admin Telegram notification failed:', err.message)
    }
  }
}

async function markOrderPaymentFailed(orderId, state) {
  const order = getOrder(orderId)
  if (!order) return

  let status = ORDER_STATUS.PAYMENT_FAILED
  if (state === 'CANCELLED') status = ORDER_STATUS.PAYMENT_CANCELLED
  if (state === 'EXPIRED') status = ORDER_STATUS.PAYMENT_EXPIRED

  upsertOrder(orderId, {
    paymentState: state,
    status,
  })

  const updated = getOrder(orderId)

  if (updated && !updated.failureNotifiedAt) {
    try {
      await notifyAdminFailure(updated, state)
      upsertOrder(orderId, { failureNotifiedAt: Date.now() })
    } catch (err) {
      console.error('Admin failure notification failed:', err.message)
    }
  }
}

function startStatusPolling(orderId, apiRef, invoiceId) {
  stopStatusPolling(apiRef)
  let attempts = 0

  activePollers[apiRef] = setInterval(async () => {
    attempts += 1

    if (attempts > STATUS_POLL_MAX_ATTEMPTS) {
      stopStatusPolling(apiRef)
      return
    }

    const order = getOrder(orderId)
    if (!order || order.paymentState === 'COMPLETE') {
      stopStatusPolling(apiRef)
      return
    }

    try {
      const response = await intasendCheckPaymentStatus({ invoice_id: invoiceId })
      const state = normalizePaymentState(extractState(response))
      const returnedInvoiceId = extractInvoiceId(response) || invoiceId

      if (state === 'COMPLETE') {
        stopStatusPolling(apiRef)
        await markOrderPaymentComplete(orderId, returnedInvoiceId, 'status-poll')
        return
      }

      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(state)) {
        stopStatusPolling(apiRef)
        await markOrderPaymentFailed(orderId, state)
      }
    } catch (err) {
      console.error('Status polling failed:', err.message)
    }
  }, STATUS_POLL_INTERVAL_MS)
}

loadStore()

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
)

app.options('*', cors())

app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf?.toString() || ''
    },
  }),
)

app.use(
  express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
      req.rawBody = buf?.toString() || ''
    },
  }),
)

app.post('/api/checkout', async (req, res) => {
  console.log('POST /api/checkout hit')
  console.log('Body:', req.body)

  try {
    if (isPaymentInactivePeriod()) {
      return res.status(403).json({
        error: `Payments are currently unavailable between ${INACTIVE_START_EAT} and ${INACTIVE_END_EAT} EAT. Please try again after ${INACTIVE_END_EAT} EAT.`,
      })
    }

    const { productId, paymentPhone } = req.body

    const product = findProductById(productId)
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    const normalizedPhone = normalizePhoneTo254(paymentPhone)
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid M-Pesa number' })
    }

    const orderId = createOrderId()
    const apiRef = createPaymentRef(orderId)

    upsertOrder(orderId, {
      id: orderId,
      productId: product.id,
      productName: product.name,
      amount: product.price,
      paymentPhone: normalizedPhone,
      deliveryWhatsAppNumber: null,
      mpesaName: null,
      apiRef,
      invoiceId: null,
      paymentState: 'PENDING',
      status: ORDER_STATUS.PAYMENT_PENDING,
      createdAt: Date.now(),
    })

    const stkResponse = await intasendSendStkPush({
      amount: product.price,
      phone_number: normalizedPhone,
      api_ref: apiRef,
    })

    const invoiceId = extractInvoiceId(stkResponse)
    const state = normalizePaymentState(extractState(stkResponse) || 'PENDING')

    upsertOrder(orderId, {
      invoiceId: invoiceId || null,
      paymentState: state,
    })

    if (invoiceId) {
      startStatusPolling(orderId, apiRef, invoiceId)
    }

    return res.json({
      ok: true,
      orderId,
      status: ORDER_STATUS.PAYMENT_PENDING,
    })
  } catch (err) {
    console.error('Checkout error message:', err.message)
    console.error('Checkout error status:', err.status || 'no-status')
    console.error('Checkout error payload:', JSON.stringify(err.payload || {}, null, 2))
    console.error('Checkout raw error:', err)

    return res.status(500).json({
      error: err.message || 'Failed to initiate payment',
    })
  }
})

app.get('/api/payment-status/:orderId', (req, res) => {
  const order = getOrder(req.params.orderId)
  if (!order) {
    return res.status(404).json({ error: 'Order not found' })
  }

  return res.json({
    ok: true,
    orderId: order.id,
    status: order.status,
    paymentState: order.paymentState,
    productName: order.productName,
    amount: order.amount,
  })
})

app.post('/api/delivery-details', async (req, res) => {
  try {
    const { orderId, whatsappNumber, mpesaName } = req.body

    const order = getOrder(orderId)
    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    if (order.paymentState !== 'COMPLETE') {
      return res.status(400).json({ error: 'Payment is not confirmed yet' })
    }

    const normalizedWhatsApp = normalizePhoneTo254(whatsappNumber)
    if (!normalizedWhatsApp) {
      return res.status(400).json({ error: 'Invalid WhatsApp number' })
    }

    upsertOrder(orderId, {
      deliveryWhatsAppNumber: normalizedWhatsApp,
      mpesaName: String(mpesaName || '').trim(),
      status: ORDER_STATUS.PAID_READY_FOR_FULFILLMENT,
      deliveryDetailsSubmittedAt: Date.now(),
    })

    const updated = getOrder(orderId)

    if (!updated.adminNotifiedAt) {
      try {
        await notifyAdmin(updated)
        upsertOrder(orderId, { adminNotifiedAt: Date.now() })
      } catch (err) {
        console.error('Admin notification failed:', err.message)
      }
    }

    return res.json({
      ok: true,
      orderId: updated.id,
      status: updated.status,
      whatsappLink: `https://wa.me/${BUSINESS_WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `Hello, I have completed payment and I am ready to receive my logins.\nOrder ID: ${updated.id}\nProduct: ${updated.productName}`,
      )}`,
    })
  } catch (err) {
    console.error('Delivery details error:', err.message)
    return res.status(500).json({
      error: 'Failed to save WhatsApp delivery number',
    })
  }
})

app.get('/intasend/webhook', (req, res) => {
  const challenge = req.query?.challenge
  if (!challenge) return res.status(200).send('OK')

  if (INTASEND_WEBHOOK_CHALLENGE && challenge !== INTASEND_WEBHOOK_CHALLENGE) {
    return res.status(401).send('Invalid challenge')
  }

  return res.status(200).send(challenge)
})

app.post('/intasend/webhook', (req, res) => {
  res.status(200).json({ ok: true })

  setImmediate(async () => {
    try {
      let payload = req.body

      const bodyIsEmptyObject =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Object.keys(payload).length === 0

      if (!payload || typeof payload === 'string' || bodyIsEmptyObject) {
        const raw = String(req.rawBody || '').trim()
        if (raw) {
          try {
            payload = JSON.parse(raw)
          } catch {
            payload = qs.parse(raw)
          }
        } else {
          payload = {}
        }
      }

      let apiRef = extractApiRef(payload)
      const invoiceId = extractInvoiceId(payload)
      const state = normalizePaymentState(extractState(payload))

      let order = null
      if (apiRef) order = findOrderByApiRef(apiRef)
      if (!order && invoiceId) order = findOrderByInvoiceId(invoiceId)

      if (!order) {
        console.log(
          `Webhook received for unknown payment. apiRef=${String(apiRef || '')} invoiceId=${String(
            invoiceId || '',
          )} state=${String(state || '')}`,
        )
        return
      }

      if (state === 'COMPLETE') {
        await markOrderPaymentComplete(order.id, invoiceId, 'webhook')
        return
      }

      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(state)) {
        await markOrderPaymentFailed(order.id, state)
      }
    } catch (err) {
      console.error('Webhook processing error:', err.message)
    }
  })
})

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    intasendMode: INTASEND_TEST ? 'TEST' : 'LIVE',
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID),
    businessWhatsAppConfigured: Boolean(BUSINESS_WHATSAPP_NUMBER),
    allowedOrigins: ALLOWED_ORIGINS,
    secretKeyPresent: Boolean(INTASEND_SECRET_KEY),
    secretKeyLooksValid: String(INTASEND_SECRET_KEY || '').startsWith('ISSecretKey_'),
    publishableKeyPresent: Boolean(INTASEND_PUBLISHABLE_KEY),
    publishableKeyLooksValid: String(INTASEND_PUBLISHABLE_KEY || '').startsWith('ISPubKey_'),
    inactiveStartEAT: INACTIVE_START_EAT,
    inactiveEndEAT: INACTIVE_END_EAT,
    currentTimeEAT: getCurrentEATHHMM(),
    paymentsInactiveNowEAT: isPaymentInactivePeriod(),
  })
})

app.use((err, req, res, next) => {
  if (err && String(err.message || '').startsWith('CORS blocked')) {
    return res.status(403).json({ error: err.message })
  }

  return next(err)
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ') || 'none configured'}`)
  console.log(`Inactive payments window (EAT): ${INACTIVE_START_EAT} - ${INACTIVE_END_EAT}`)
})