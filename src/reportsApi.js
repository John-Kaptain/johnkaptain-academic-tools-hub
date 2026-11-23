// Client for the JK Turnitin Bot's website-orders API (the same service,
// prices and report engine as the Telegram bot).
// Override at build time with VITE_JK_REPORTS_API if the bot ever moves.
import { deviceId } from './device.js'

export const REPORTS_API = String(
  import.meta.env.VITE_JK_REPORTS_API || 'https://jk-turnitin-telegram-bot.onrender.com',
).replace(/\/+$/, '')

const STORAGE_KEY = 'jk-report-orders'

// JK_WEB_IDENTITY_V1: who is ordering — this browser, and the signed-in account
// if any — so resubmitted essays keep unchanged AI verdicts and RECHECK works.
function identityHeaders() {
  const h = {}
  const device = deviceId()
  if (device) h['X-Device-Id'] = device
  try {
    const a = JSON.parse(localStorage.getItem('jk-account') || 'null')
    if (a?.session) h['X-Account-Session'] = a.session
  } catch {
    /* not signed in */
  }
  return h
}

async function call(path, { method = 'GET', token, json, body, headers = {} } = {}) {
  if (!REPORTS_API) throw new Error('The reports service is not available right now. Please message us on WhatsApp 0701730921.')
  const res = await fetch(`${REPORTS_API}${path}`, {
    method,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Order-Token': token } : {}),
      ...(path.startsWith('/api/web/orders') ? identityHeaders() : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export const reportsApi = {
  config: () => call('/api/web/config'),
  createOrder: () => call('/api/web/orders', { method: 'POST' }),
  upload: (orderId, token, file) =>
    call(`/api/web/orders/${orderId}/files`, {
      method: 'PUT',
      token,
      body: file,
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    }),
  checkout: (orderId, token, payload) =>
    call(`/api/web/orders/${orderId}/checkout`, { method: 'POST', token, json: payload }),
  resend: (orderId, token, phone) =>
    call(`/api/web/orders/${orderId}/resend`, { method: 'POST', token, json: phone ? { phone } : {} }),
  cancel: (orderId, token) => call(`/api/web/orders/${orderId}/cancel`, { method: 'POST', token }),
  deleteData: (orderId, token) => call(`/api/web/orders/${orderId}/delete`, { method: 'POST', token }),
  message: (orderId, token, text) => call(`/api/web/orders/${orderId}/message`, { method: 'POST', token, json: { text } }),
  highlights: (orderId, token, fileId, phone) =>
    call(`/api/web/orders/${orderId}/highlights`, { method: 'POST', token, json: { fileId, phone } }),
  proof: (orderId, token, text) => call(`/api/web/orders/${orderId}/proof`, { method: 'POST', token, json: { text } }),
  // Binance Pay (USDT), Turnitin orders only.
  binance: (orderId, token, payload) => call(`/api/web/orders/${orderId}/binance`, { method: 'POST', token, json: payload }),
  binanceProof: (orderId, token, binanceOrderId, image) =>
    call(`/api/web/orders/${orderId}/binance-proof`, {
      method: 'PUT',
      token,
      body: image || '',
      headers: { 'Content-Type': image?.type || 'application/octet-stream', 'X-Binance-Order': String(binanceOrderId || '').trim() },
    }),
  // Manual payments from abroad: method 'INTL_MPESA' (Wise, WorldRemit, Vodacom TZ… to M-Pesa) or 'BINANCE_USDT'.
  manual: (orderId, token, payload) => call(`/api/web/orders/${orderId}/manual`, { method: 'POST', token, json: payload }),
  manualProof: (orderId, token, reference, image) =>
    call(`/api/web/orders/${orderId}/manual-proof`, {
      method: 'PUT',
      token,
      body: image || '',
      headers: { 'Content-Type': image?.type || 'application/octet-stream', 'X-Payment-Ref': String(reference || '').trim() },
    }),
  status: (orderId, token) => call(`/api/web/orders/${orderId}`, { token }),
  reportUrl: (orderId, token, reportId) =>
    `${REPORTS_API}/api/web/orders/${orderId}/reports/${reportId}?token=${encodeURIComponent(token)}`,
}

// Orders are remembered on this device only, so a customer can come back
// for their reports. The token is the only key to the order.
export function savedOrders() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
export function rememberOrder(orderId, token) {
  try {
    const list = savedOrders().filter(o => o.orderId !== orderId)
    list.unshift({ orderId, token, at: Date.now() })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30)))
  } catch {
    /* storage unavailable: the order still works in this tab */
  }
  window.dispatchEvent(new CustomEvent('jk-order-saved', { detail: { kind: 'report', id: orderId, token } }))
}
export function forgetOrder(orderId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedOrders().filter(o => o.orderId !== orderId)))
  } catch {
    /* ignore */
  }
}

// Support messages the customer has already seen, per order (this device).
const SEEN_KEY = 'jk-report-seen'
export function lastSeen(orderId) {
  try {
    return Number(JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')[orderId] || 0)
  } catch {
    return 0
  }
}
export function markSeen(orderId, at) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    seen[orderId] = Math.max(Number(seen[orderId] || 0), Number(at || Date.now()))
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* ignore */
  }
}
