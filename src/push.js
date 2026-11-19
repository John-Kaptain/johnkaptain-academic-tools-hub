// "🔔 Notify me": alerts on this phone for the orders placed on it (paid
// orders only): files delivered and messages from JK Support. Sent by the JK
// Turnitin Bot service, which checks each order with its own secret key.
import { REPORTS_API, savedOrders } from './reportsApi.js'
import { savedShopOrders } from './shopChat.js'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function post(path, json) {
  const res = await fetch(`${REPORTS_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

const ordersOnThisDevice = () => [
  ...savedOrders().map(o => ({ kind: 'report', id: o.orderId, token: o.token })),
  ...savedShopOrders().map(o => ({ kind: 'shop', id: o.orderId, token: o.token })),
]

async function registration() {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return reg
}

// 'on' | 'off' | 'blocked' | 'install-first' (iPhone, not installed) | 'unsupported'
export async function pushState() {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'install-first' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = reg && (await reg.pushManager.getSubscription())
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your browser settings.')
  const reg = await registration()
  const { publicKey } = await fetch(`${REPORTS_API}/api/web/push/key`).then(r => r.json())
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }))
  return post('/api/web/push/subscribe', { subscription: sub.toJSON(), orders: ordersOnThisDevice() })
}

// Already on: link newly paid orders on this device too (unpaid ones are ignored).
export async function syncPush() {
  try {
    if ((await pushState()) !== 'on') return
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg.pushManager.getSubscription()
    await post('/api/web/push/subscribe', { subscription: sub.toJSON(), orders: ordersOnThisDevice() })
  } catch {
    /* nothing paid yet, or offline: try again next time */
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = reg && (await reg.pushManager.getSubscription())
  if (!sub) return
  await post('/api/web/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
