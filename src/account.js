// JK_CUSTOMER_ACCOUNTS_V1: optional sign-in (emailed 6-digit code) so a
// customer's Turnitin and shop orders follow them to any device. The session
// is remembered on this device until they sign out (renewed on each visit).
import { REPORTS_API, savedOrders, rememberOrder } from './reportsApi.js'
import { savedShopOrders, rememberShopOrder } from './shopChat.js'

const KEY = 'jk-account'

export function currentAccount() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || 'null')
    return a?.session && a?.email ? a : null
  } catch {
    return null
  }
}
function setAccount(a) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('jk-account-changed'))
}

async function call(path, { method = 'GET', json } = {}) {
  const a = currentAccount()
  const res = await fetch(`${REPORTS_API}/api/web/account${path}`, {
    method,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(a ? { 'X-Account-Session': a.session } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && a) setAccount(null) // signed out elsewhere or expired
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

const localOrders = () => [
  ...savedOrders().map(o => ({ kind: 'report', id: o.orderId, token: o.token })),
  ...savedShopOrders().map(o => ({ kind: 'shop', id: o.orderId, token: o.token })),
]

export const account = {
  sendCode: email => call('/code', { method: 'POST', json: { email } }),
  async verify(email, code) {
    const r = await call('/verify', { method: 'POST', json: { email, code } })
    setAccount({ session: r.session, email: r.email })
    // Orders already on this device join the account.
    await call('/claim', { method: 'POST', json: { orders: localOrders() } }).catch(() => {})
    return r
  },
  list: () => call(''),
  // Opening an order from the account on this device: save a key for it here.
  async open(kind, id) {
    const local = kind === 'shop' ? savedShopOrders().find(o => o.orderId === id) : savedOrders().find(o => o.orderId === id)
    if (local) return local
    const { token } = await call(`/orders/${kind}/${encodeURIComponent(id)}/key`, { method: 'POST' })
    if (kind === 'shop') rememberShopOrder({ orderId: id, token })
    else rememberOrder(id, token)
    return { orderId: id, token }
  },
  async signOut() {
    await call('/signout', { method: 'POST' }).catch(() => {})
    setAccount(null)
  },
}

// New orders on this device join the account automatically.
if (typeof window !== 'undefined') {
  window.addEventListener('jk-order-saved', e => {
    if (!currentAccount() || !e.detail?.id) return
    call('/claim', { method: 'POST', json: { orders: [e.detail] } }).catch(() => {})
  })
}
