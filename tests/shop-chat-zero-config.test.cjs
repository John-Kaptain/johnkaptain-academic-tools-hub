'use strict'
// The Reply button must work with no extra Render settings: the webhook URL
// comes from RENDER_EXTERNAL_URL and the secret is derived (or a secret with
// characters Telegram rejects is made valid).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-chat-zc-'))
const PORT = 43000 + Math.floor(Math.random() * 1000)
Object.assign(process.env, {
  PORT: String(PORT), ORDER_STORE_FILE: path.join(dir, 'orders.json'),
  TELEGRAM_BOT_TOKEN: '123:test', TELEGRAM_ADMIN_CHAT_ID: '111',
  TELEGRAM_WEBHOOK_SECRET: 'my secret!#with spaces', RENDER_EXTERNAL_URL: 'https://shop.onrender.test',
})
delete process.env.PUBLIC_BASE_URL
const calls = []
const realFetch = global.fetch
global.fetch = async (url, o = {}) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    calls.push({ method: String(url).split('/').pop(), body: JSON.parse(o.body || '{}') })
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) }
  }
  return realFetch(url, o)
}
require('../server.cjs')
;(async () => {
  await new Promise(r => setTimeout(r, 300))
  const set = calls.find(c => c.method === 'setWebhook')
  assert(set, 'webhook registered without PUBLIC_BASE_URL')
  assert.equal(set.body.url, 'https://shop.onrender.test/telegram/webhook')
  assert.match(set.body.secret_token, /^[a-f0-9]{64}$/, 'invalid secret turned into one Telegram accepts')
  const post = secret => realFetch(`http://127.0.0.1:${PORT}/telegram/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: '{}' })
  assert.equal((await post(set.body.secret_token)).status, 200)
  assert.equal((await post('my secret!#with spaces')).status, 401)
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('PASS: Reply webhook works with no extra settings on Render; bad secret characters fixed')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
