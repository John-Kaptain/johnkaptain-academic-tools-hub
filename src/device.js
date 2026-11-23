// JK_WEB_IDENTITY_V1: a random id for this browser, so the bot can recognise a
// returning customer's resubmitted essay (AI verdicts stay consistent) even
// without signing in. It identifies the browser only, never the person.
const KEY = 'jk-device'

export function deviceId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!/^[a-f0-9]{32}$/.test(id || '')) {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      id = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}
