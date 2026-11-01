// Website order chat (non-Turnitin products) with the JohnKaptain Academic
// Tools Bot. Orders and their secret chat keys are remembered on this device.
export const SHOP_API = String(import.meta.env.VITE_API_BASE || window.location.origin).replace(/\/+$/, '')

const ORDERS_KEY = 'jk-shop-orders'
const SEEN_KEY = 'jk-shop-seen'

async function call(path, { method = 'GET', token, json } = {}) {
  const res = await fetch(`${SHOP_API}${path}`, {
    method,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Order-Token': token } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export const shopChat = {
  thread: (orderId, token) => call(`/api/orders/${orderId}/messages`, { token }),
  send: (orderId, token, text) => call(`/api/orders/${orderId}/messages`, { method: 'POST', token, json: { text } }),
}

export function savedShopOrders() {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
export function rememberShopOrder(order) {
  try {
    const list = savedShopOrders().filter(o => o.orderId !== order.orderId)
    list.unshift({ ...order, at: Date.now() })
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 20)))
  } catch {
    /* storage unavailable: the chat still works in this tab */
  }
}
export function shopLastSeen(orderId) {
  try {
    return Number(JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')[orderId] || 0)
  } catch {
    return 0
  }
}
export function markShopSeen(orderId, at) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    seen[orderId] = Math.max(Number(seen[orderId] || 0), Number(at || Date.now()))
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* ignore */
  }
}
