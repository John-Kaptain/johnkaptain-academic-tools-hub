// Client for the JK Turnitin Bot's website-orders API (the same service,
// prices and report engine as the Telegram bot).
// Override at build time with VITE_JK_REPORTS_API if the bot ever moves.
export const REPORTS_API = String(
  import.meta.env.VITE_JK_REPORTS_API || 'https://jk-turnitin-telegram-bot.onrender.com',
).replace(/\/+$/, '')

const STORAGE_KEY = 'jk-report-orders'

async function call(path, { method = 'GET', token, json, body, headers = {} } = {}) {
  if (!REPORTS_API) throw new Error('The reports service is not configured yet. Please use the Telegram bot.')
  const res = await fetch(`${REPORTS_API}${path}`, {
    method,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Order-Token': token } : {}),
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
  proof: (orderId, token, text) => call(`/api/web/orders/${orderId}/proof`, { method: 'POST', token, json: { text } }),
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    /* storage unavailable: the order still works in this tab */
  }
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
