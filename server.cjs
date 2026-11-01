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

// The site's own domain is always allowed; ALLOWED_ORIGINS adds more.
const ALLOWED_ORIGINS = [...new Set([
  'https://jkacademictoolshub.com',
  'https://www.jkacademictoolshub.com',
  ...String(process.env.ALLOWED_ORIGINS || '').split(','),
].map(v => v.trim()).filter(Boolean))]

// Telegram webhook for admin replies (website order chat).
// Works with no setup on Render: the public URL comes from RENDER_EXTERNAL_URL
// and the secret is derived from the bot token. A custom secret with characters
// Telegram does not accept (only A-Z a-z 0-9 _ -) is hashed into a valid one.
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '')
function webhookSecret() {
  const raw = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()
  if (/^[A-Za-z0-9_-]{1,256}$/.test(raw)) return raw
  const seed = raw || String(process.env.TELEGRAM_BOT_TOKEN || '')
  return seed ? require('crypto').createHash('sha256').update('jk-shop-webhook:' + seed).digest('hex') : ''
}
const TELEGRAM_WEBHOOK_SECRET = webhookSecret()
const TELEGRAM_WEBHOOK_URL = PUBLIC_BASE_URL ? PUBLIC_BASE_URL + '/telegram/webhook' : ''

const INACTIVE_START_EAT = normalizeHHMM(process.env.INACTIVE_START_EAT, '00:00')
const INACTIVE_END_EAT = normalizeHHMM(process.env.INACTIVE_END_EAT, '06:00')

const STORE_FILE = process.env.ORDER_STORE_FILE ? path.resolve(process.env.ORDER_STORE_FILE) : path.join(__dirname, 'orders.store.json')
const STATUS_POLL_INTERVAL_MS = 3000
const STATUS_POLL_MAX_ATTEMPTS = 120

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
    const storeDir = path.dirname(STORE_FILE)
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true })
    }
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
  const storeDir = path.dirname(STORE_FILE)
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true })
  }

  fs.writeFileSync(STORE_FILE, JSON.stringify(orders, null, 2), 'utf8')
  scheduleRemotePush()
}

// ---- Order list kept on the JK Turnitin Bot's persistent disk ----
// This service's own disk is wiped on every deploy/restart, so with
// SHOP_STORE_KEY set (same value on both services) the order list and chats
// are loaded from and saved to the bot. The local file is only a cache.
const SHOP_STORE_KEY = String(process.env.SHOP_STORE_KEY || '').trim()
const SHOP_STORE_URL = String(process.env.SHOP_STORE_URL || 'https://jk-turnitin-telegram-bot.onrender.com/api/shop-store').trim()
const remoteStore = { enabled: SHOP_STORE_KEY.length >= 16, loaded: false, lastError: null, lastSavedAt: null }
let remotePushTimer = null

async function remoteStoreRequest(method, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(SHOP_STORE_URL, {
      method,
      headers: { Authorization: 'Bearer ' + SHOP_STORE_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`order store ${method} failed (${res.status})`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function loadRemoteStore() {
  if (!remoteStore.enabled || remoteStore.loaded) return
  try {
    const data = await remoteStoreRequest('GET')
    for (const [id, order] of Object.entries(data.orders || {})) {
      const local = orders[id]
      if (!local || Number(order.updatedAt || 0) > Number(local.updatedAt || 0)) orders[id] = order
    }
    remoteStore.loaded = true
    remoteStore.lastError = null
    console.log(`Order store loaded from the bot: ${Object.keys(data.orders || {}).length} orders`)
    saveStore()
  } catch (err) {
    remoteStore.lastError = err.message
    console.error('Order store load failed (retrying):', err.message)
    setTimeout(loadRemoteStore, 15000).unref()
  }
}

function scheduleRemotePush(delay = 1500) {
  // Never push before loading, or an empty list would replace the saved one.
  if (!remoteStore.enabled || !remoteStore.loaded || remotePushTimer) return
  remotePushTimer = setTimeout(async () => {
    remotePushTimer = null
    try {
      await remoteStoreRequest('PUT', { orders })
      remoteStore.lastSavedAt = new Date().toISOString()
      remoteStore.lastError = null
    } catch (err) {
      remoteStore.lastError = err.message
      console.error('Order store save failed (retrying):', err.message)
      scheduleRemotePush(30000)
    }
  }, delay)
  remotePushTimer.unref?.()
}

// Order records are small (no files: those stay on Telegram). Unpaid orders
// are dropped after 36 h; paid orders keep their chat (logins) for 30 days.
const UNPAID_ORDER_RETENTION_MS = 36 * 60 * 60 * 1000
const PAID_ORDER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
function pruneOrders(now = Date.now()) {
  let removed = 0
  for (const [id, order] of Object.entries(orders)) {
    const created = Number(order.createdAt) || Number((/^ORD_(\d{12,})_/.exec(id) || [])[1]) || 0
    if (!created) continue
    const age = now - created
    const paid = order.paymentState === 'COMPLETE'
    if (age > (paid ? PAID_ORDER_RETENTION_MS : UNPAID_ORDER_RETENTION_MS)) {
      delete orders[id]
      removed += 1
    }
  }
  if (removed) saveStore()
  return removed
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

function extractOrderIdFromApiRef(apiRef) {
  const match = String(apiRef || '').match(/PAY_(ORD_\d+_\d+)_/)
  return match ? match[1] : null
}

function findOrderFromPaymentRefs(apiRef, invoiceId) {
  let order = null

  if (apiRef) {
    order = findOrderByApiRef(apiRef)
  }

  if (!order && invoiceId) {
    order = findOrderByInvoiceId(invoiceId)
  }

  if (!order && apiRef) {
    const orderId = extractOrderIdFromApiRef(apiRef)
    if (orderId) {
      order = getOrder(orderId)
    }
  }

  return order
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
    payload?.tracking_id ||
    payload?.trackingId ||
    payload?.invoice?.api_ref ||
    payload?.invoice?.apiRef ||
    payload?.invoice?.tracking_id ||
    payload?.invoice?.trackingId ||
    payload?.data?.api_ref ||
    payload?.data?.apiRef ||
    payload?.data?.tracking_id ||
    payload?.data?.trackingId ||
    payload?.data?.invoice?.api_ref ||
    payload?.data?.invoice?.apiRef ||
    payload?.data?.invoice?.tracking_id ||
    payload?.data?.invoice?.trackingId ||
    payload?.payload?.api_ref ||
    payload?.payload?.apiRef ||
    payload?.payload?.tracking_id ||
    payload?.payload?.trackingId ||
    payload?.payload?.invoice?.api_ref ||
    payload?.payload?.invoice?.apiRef ||
    payload?.payload?.invoice?.tracking_id ||
    payload?.payload?.invoice?.trackingId ||
    null
  )
}

function extractInvoiceId(payload) {
  return (
    payload?.invoice_id ||
    payload?.invoiceId ||
    payload?.invoice?.invoice_id ||
    payload?.invoice?.invoiceId ||
    payload?.data?.invoice_id ||
    payload?.data?.invoiceId ||
    payload?.data?.invoice?.invoice_id ||
    payload?.data?.invoice?.invoiceId ||
    payload?.payload?.invoice_id ||
    payload?.payload?.invoiceId ||
    payload?.payload?.invoice?.invoice_id ||
    payload?.payload?.invoice?.invoiceId ||
    payload?.id ||
    payload?.invoice?.id ||
    payload?.data?.invoice?.id ||
    payload?.payload?.invoice?.id ||
    null
  )
}

function extractState(payload) {
  return (
    payload?.state ||
    payload?.status ||
    payload?.payment_state ||
    payload?.paymentState ||
    payload?.invoice?.state ||
    payload?.invoice?.status ||
    payload?.invoice?.payment_state ||
    payload?.invoice?.paymentState ||
    payload?.data?.state ||
    payload?.data?.status ||
    payload?.data?.payment_state ||
    payload?.data?.paymentState ||
    payload?.data?.invoice?.state ||
    payload?.data?.invoice?.status ||
    payload?.data?.invoice?.payment_state ||
    payload?.data?.invoice?.paymentState ||
    payload?.payload?.state ||
    payload?.payload?.status ||
    payload?.payload?.payment_state ||
    payload?.payload?.paymentState ||
    payload?.payload?.invoice?.state ||
    payload?.payload?.invoice?.status ||
    payload?.payload?.invoice?.payment_state ||
    payload?.payload?.invoice?.paymentState ||
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
    [
      'PENDING',
      'PROCESSING',
      'IN_PROGRESS',
      'INPROGRESS',
      'TP101',
      'TP102',
      'BP101',
      'BP103',
    ].includes(s)
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

async function telegramApi(method, body) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('Telegram not configured. ' + method + ':', JSON.stringify(body))
    return { ok: true, result: {} }
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.ok) {
    throw new Error(data?.description || 'Telegram ' + method + ' failed')
  }

  return data
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
    console.log('Telegram notification not configured. Message would be:')
    console.log(text)
    return
  }
  return telegramApi('sendMessage', { chat_id: TELEGRAM_ADMIN_CHAT_ID, text })
}

const shopChat = require('./shop-chat.cjs').createShopChat({
  getOrder: id => getOrder(id),
  upsertOrder: (id, patch) => upsertOrder(id, patch),
  listOrders: () => Object.values(orders),
  telegramApi,
  adminChatId: TELEGRAM_ADMIN_CHAT_ID,
})

async function notifyAdmin(order) {
  const text = [
    '✅ PAYMENT COMPLETE — new website order',
    'New paid order ready for fulfillment',
    `Order ID: ${order.id}`,
    `Product: ${order.productName}`,
    `Amount: Ksh. ${order.amount}`,
    `Payment number: ${order.paymentPhone}`,
    `M-Pesa name: ${order.mpesaName || 'Not provided'}`,
    order.deliveryWhatsAppNumber
      ? `WhatsApp (optional contact): https://wa.me/${order.deliveryWhatsAppNumber}`
      : 'WhatsApp: not provided — use the website chat',
    '',
    'Tap 💬 Reply to send logins, or 📎 Send files for documents — they appear on the customer\'s order page.',
  ].join('\n')

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return sendTelegramMessage(text)
  await shopChat.notifyAdmin(order.id, text)
}

// Details the customer adds after paying (optional WhatsApp / M-Pesa name).
async function notifyAdminDetails(order) {
  if (!order.deliveryWhatsAppNumber && !order.mpesaName) return
  const text = [
    'ℹ️ Customer details added',
    `Order ID: ${order.id}`,
    `Product: ${order.productName}`,
    `M-Pesa name: ${order.mpesaName || 'Not provided'}`,
    order.deliveryWhatsAppNumber ? `WhatsApp (optional contact): https://wa.me/${order.deliveryWhatsAppNumber}` : 'WhatsApp: not provided',
  ].join('\n')
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return sendTelegramMessage(text)
  await shopChat.notifyAdmin(order.id, text)
}

async function notifyAdminFailure(order, state) {
  const text = [
    '❌ PAYMENT FAILED — website order',
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

  // One "payment complete" alert as soon as the money arrives, even if the
  // customer closes the page before the (optional) details step.
  if (!updated.adminNotifiedAt) {
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
    allowedHeaders: ['Content-Type', 'X-Order-Token'],
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

    if (state === 'COMPLETE') {
      await markOrderPaymentComplete(orderId, invoiceId, 'checkout-response')
    } else if (invoiceId) {
      startStatusPolling(orderId, apiRef, invoiceId)
    }

    return res.json({
      ok: true,
      orderId,
      chatToken: shopChat.issueToken(orderId),
      status: getOrder(orderId)?.status || ORDER_STATUS.PAYMENT_PENDING,
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

app.get('/api/payment-status/:orderId', async (req, res) => {
  let order = getOrder(req.params.orderId)

  if (!order) {
    return res.status(404).json({ error: 'Order not found' })
  }

  if (order.paymentState !== 'COMPLETE' && order.invoiceId) {
    try {
      const response = await intasendCheckPaymentStatus({ invoice_id: order.invoiceId })
      const state = normalizePaymentState(extractState(response))
      const returnedInvoiceId = extractInvoiceId(response) || order.invoiceId

      if (state === 'COMPLETE') {
        await markOrderPaymentComplete(order.id, returnedInvoiceId, 'frontend-status-check')
      }

      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(state)) {
        await markOrderPaymentFailed(order.id, state)
      }

      order = getOrder(req.params.orderId) || order
    } catch (err) {
      console.error('Payment status live check failed:', err.message)
    }
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

    // WhatsApp is optional: the website chat is the main delivery channel.
    const normalizedWhatsApp = String(whatsappNumber || '').trim()
      ? normalizePhoneTo254(whatsappNumber)
      : null
    if (String(whatsappNumber || '').trim() && !normalizedWhatsApp) {
      return res.status(400).json({ error: 'Invalid WhatsApp number' })
    }

    upsertOrder(orderId, {
      deliveryWhatsAppNumber: normalizedWhatsApp,
      mpesaName: String(mpesaName || '').trim(),
      status: ORDER_STATUS.PAID_READY_FOR_FULFILLMENT,
      deliveryDetailsSubmittedAt: Date.now(),
    })

    const updated = getOrder(orderId)

    try {
      if (!updated.adminNotifiedAt) {
        await notifyAdmin(updated)
        upsertOrder(orderId, { adminNotifiedAt: Date.now() })
      } else if (!updated.detailsNotifiedAt) {
        await notifyAdminDetails(updated)
        upsertOrder(orderId, { detailsNotifiedAt: Date.now() })
      }
    } catch (err) {
      console.error('Admin notification failed:', err.message)
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

      let order = findOrderFromPaymentRefs(apiRef, invoiceId)

      if (!order && invoiceId) {
        try {
          const statusResponse = await intasendCheckPaymentStatus({ invoice_id: invoiceId })
          const statusApiRef = extractApiRef(statusResponse)
          const statusInvoiceId = extractInvoiceId(statusResponse) || invoiceId

          order = findOrderFromPaymentRefs(statusApiRef || apiRef, statusInvoiceId)

          if (statusApiRef) {
            apiRef = statusApiRef
          }
        } catch (err) {
          console.error('Webhook fallback status lookup failed:', err.message)
        }
      }

      if (!order) {
        console.log(
          `Webhook received for unknown payment. apiRef=${String(apiRef || '')} invoiceId=${String(
            invoiceId || '',
          )} state=${String(state || '')}`,
        )
        return
      }

      if (state === 'COMPLETE') {
        await markOrderPaymentComplete(order.id, invoiceId || order.invoiceId, 'webhook')
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

// ---- Website order chat ----
const chatToken = req => req.headers['x-order-token'] || req.query.token
app.get('/api/orders/:orderId/messages', (req, res) => {
  try {
    const order = shopChat.authorize(req.params.orderId, chatToken(req))
    return res.json({ ok: true, ...shopChat.view(order) })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }
})
app.post('/api/orders/:orderId/messages', async (req, res) => {
  try {
    const order = shopChat.authorize(req.params.orderId, chatToken(req))
    return res.json({ ok: true, ...(await shopChat.clientMessage(order, req.body?.text)) })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }
})
// Files JK Support sent from Telegram (documents, photos...), passed through
// from Telegram's servers; nothing is stored on this service.
app.get('/api/orders/:orderId/files/:key', async (req, res) => {
  try {
    const order = shopChat.authorize(req.params.orderId, chatToken(req))
    const file = shopChat.findFile(order, req.params.key)
    if (!file) return res.status(404).json({ error: 'File not found' })
    const info = await telegramApi('getFile', { file_id: file.telegramFileId })
    const download = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${info.result.file_path}`)
    if (!download.ok) throw new Error('Telegram file download failed')
    const body = Buffer.from(await download.arrayBuffer())
    const safeName = String(file.name || 'file').replace(/[\r\n"]/g, '_')
    res.setHeader('Content-Type', file.mime || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    return res.end(body)
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.status ? err.message : 'Could not fetch the file. Please try again.' })
  }
})
app.post('/telegram/webhook', (req, res) => {
  if (!TELEGRAM_WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end()
  }
  res.status(200).end()
  shopChat.handleUpdate(req.body).catch(err => console.error('Telegram update failed:', err.message))
})

// Telegram's own view of the webhook (no secrets): shows why replies fail.
async function telegramWebhookStatus() {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, problem: 'TELEGRAM_BOT_TOKEN not set' }
  if (!TELEGRAM_WEBHOOK_URL) return { ok: false, problem: 'Public URL unknown: set PUBLIC_BASE_URL' }
  try {
    const info = (await telegramApi('getWebhookInfo', {})).result || {}
    return {
      ok: info.url === TELEGRAM_WEBHOOK_URL && !info.last_error_message,
      registeredUrl: info.url || '(none)',
      expectedUrl: TELEGRAM_WEBHOOK_URL,
      pendingUpdates: info.pending_update_count || 0,
      lastError: info.last_error_message || null,
      lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    }
  } catch (err) {
    return { ok: false, problem: err.message }
  }
}
async function ensureTelegramWebhook(force = false) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) {
    console.log('Website order chat replies disabled: set PUBLIC_BASE_URL')
    return
  }
  try {
    const info = (await telegramApi('getWebhookInfo', {})).result || {}
    if (!force && info.url === TELEGRAM_WEBHOOK_URL && !info.last_error_message) return
  } catch { /* fall through and set it */ }
  await telegramApi('setWebhook', {
    url: TELEGRAM_WEBHOOK_URL,
    secret_token: TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
  })
    .then(() => console.log('Telegram webhook set for website order chat: ' + TELEGRAM_WEBHOOK_URL))
    .catch(err => console.error('Telegram webhook setup failed:', err.message))
}

app.get('/health', async (req, res) => {
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
    storeFile: STORE_FILE,
    storeFileExists: fs.existsSync(STORE_FILE),
    ordersLoaded: Object.keys(orders).length,
    telegramWebhookConfigured: Boolean(TELEGRAM_WEBHOOK_SECRET && TELEGRAM_WEBHOOK_URL),
    telegramWebhook: await telegramWebhookStatus(),
    orderStore: remoteStore.enabled
      ? { where: 'JK Turnitin Bot disk', loaded: remoteStore.loaded, lastSavedAt: remoteStore.lastSavedAt, lastError: remoteStore.lastError }
      : { where: 'this service only (wiped on deploy/restart) — set SHOP_STORE_KEY' },
    deployMarker: 'shop-chat-v3',
  })
})

app.use((err, req, res, next) => {
  if (err && String(err.message || '').startsWith('CORS blocked')) {
    return res.status(403).json({ error: err.message })
  }

  return next(err)
})

// Load the saved orders (up to 20 s) before taking requests.
Promise.race([loadRemoteStore(), new Promise(resolve => setTimeout(resolve, 20000))]).then(() => app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ') || 'none configured'}`)
  console.log(`Inactive payments window (EAT): ${INACTIVE_START_EAT} - ${INACTIVE_END_EAT}`)
  // Register now, then re-check every 30 minutes in case it was replaced.
  ensureTelegramWebhook(true)
  const runPrune = () => { try { pruneOrders() } catch (err) { console.error('Order clean-up failed:', err.message) } }
  runPrune()
  setInterval(runPrune, 60 * 60 * 1000).unref()
  setInterval(ensureTelegramWebhook, 30 * 60 * 1000).unref()
}))

module.exports = { pruneOrders }
