// JK_GENERAL_SUPPORT_V1: "💬 Contact support" — questions not about one order.
// The conversation belongs to the signed-in account, or to this browser.
import { REPORTS_API, identityHeaders } from './reportsApi.js'

async function call(method, json) {
  const res = await fetch(`${REPORTS_API}/api/web/support`, {
    method,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...identityHeaders() },
    body: json ? JSON.stringify(json) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

const USED = 'jk-support-used'
// Only browsers that have written to support (or are signed in) check for replies.
export const supportUsed = () => {
  try { return localStorage.getItem(USED) === '1' || Boolean(JSON.parse(localStorage.getItem('jk-account') || 'null')?.session) } catch { return false }
}

export const support = {
  thread: () => call('GET'),
  send: async (text, name) => {
    const r = await call('POST', { text, name })
    try { localStorage.setItem(USED, '1') } catch { /* ignore */ }
    return r
  },
}

const SEEN = 'jk-support-seen'
export const supportSeen = () => {
  try { return Number(localStorage.getItem(SEEN) || 0) } catch { return 0 }
}
export const markSupportSeen = at => {
  try { localStorage.setItem(SEEN, String(Math.max(supportSeen(), Number(at || Date.now())))) } catch { /* ignore */ }
}
