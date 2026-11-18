'use strict'
// JK admin web panel → shop: replies and files sent from the bot's /admin
// appear on the customer's order page. Fake Telegram and bot store. Offline.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const express = require('express')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-admin-'))
const KEY = 'k'.repeat(32)
const token = 'b'.repeat(48)
const ID = 'ORD_1700000000000_7'
let remote = {
  [ID]: { id: ID, productName: 'Grammarly', paymentState: 'COMPLETE', status: 'PAID_READY_FOR_FULFILLMENT',
    createdAt: Date.now() - 600_000, updatedAt: Date.now() - 600_000,
    chatTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    messages: [{ at: Date.now() - 500_000, from: 'client', text: 'Please send my login' }] },
}
let lastPut = null
const bot = express()
bot.use(express.json({ limit: '15mb' }))
bot.use((req, res, next) => (req.headers.authorization === 'Bearer ' + KEY ? next() : res.status(404).end()))
bot.get('/api/shop-store', (req, res) => res.json({ ok: true, orders: remote }))
bot.put('/api/shop-store', (req, res) => { remote = req.body.orders; lastPut = req.body; res.json({ ok: true }) })

const botServer = bot.listen(0, () => {
  const PORT = 45000 + Math.floor(Math.random() * 1000)
  Object.assign(process.env, {
    PORT: String(PORT), ORDER_STORE_FILE: path.join(dir, 'orders.json'),
    SHOP_STORE_KEY: KEY, SHOP_STORE_URL: `http://127.0.0.1:${botServer.address().port}/api/shop-store`,
    TELEGRAM_BOT_TOKEN: 'T0K', TELEGRAM_ADMIN_CHAT_ID: '42', PUBLIC_BASE_URL: 'https://shop.example.com',
    INACTIVE_START_EAT: '00:00', INACTIVE_END_EAT: '00:00',
    INTASEND_TEST_ENVIRONMENT: 'true', INTASEND_TEST_SECRET_KEY: 'ISSecretKey_t', INTASEND_TEST_PUBLISHABLE_KEY: 'ISPubKey_t',
  })
  const realFetch = global.fetch
  const tg = []
  global.fetch = async (url, o = {}) => {
    const u = String(url)
    if (u.startsWith('https://api.telegram.org/botT0K/')) {
      const method = u.split('/').pop()
      tg.push([method, o.body instanceof FormData ? Object.fromEntries([...o.body.keys()].map(k => [k, true])) : JSON.parse(o.body || '{}')])
      const result = method === 'sendDocument'
        ? { message_id: 99, document: { file_id: 'FILE1', file_name: 'Login.pdf', file_size: 5, mime_type: 'application/pdf' } }
        : method === 'getWebhookInfo' ? { url: 'https://shop.example.com/telegram/webhook' } : { message_id: 1 }
      return { ok: true, status: 200, json: async () => ({ ok: true, result }), text: async () => '{}' }
    }
    return realFetch(url, o)
  }
  require('../server.cjs')
  const base = `http://127.0.0.1:${PORT}`
  const A = { Authorization: 'Bearer ' + KEY }
  ;(async () => {
    for (let i = 0; i < 40; i++) { try { await realFetch(base + '/health'); break } catch { await new Promise(r => setTimeout(r, 100)) } }

    // 1. Without the key the admin routes do not exist.
    assert.equal((await realFetch(`${base}/api/admin/orders/${ID}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"x"}' })).status, 404)
    assert.equal((await realFetch(`${base}/api/admin/orders/${ID}/reply`, { method: 'POST', headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' }, body: '{"text":"x"}' })).status, 404)

    // 2. Reply appears on the order page as JK Support.
    const r = await realFetch(`${base}/api/admin/orders/${ID}/reply`, { method: 'POST', headers: { ...A, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Email: x@y.z Password: 123' }) })
    assert.equal(r.status, 200)
    assert.equal((await realFetch(`${base}/api/admin/orders/ORD_none/reply`, { method: 'POST', headers: { ...A, 'Content-Type': 'application/json' }, body: '{"text":"x"}' })).status, 404)
    assert.equal((await realFetch(`${base}/api/admin/orders/${ID}/reply`, { method: 'POST', headers: { ...A, 'Content-Type': 'application/json' }, body: '{"text":"  "}' })).status, 400)

    // 3. A file is parked on Telegram (upload, then the upload message is deleted).
    const f = await realFetch(`${base}/api/admin/orders/${ID}/file`, { method: 'PUT',
      headers: { ...A, 'X-File-Name': encodeURIComponent('Login.pdf'), 'X-Caption': encodeURIComponent('Your guide') }, body: 'PDF!!' })
    assert.equal(f.status, 200, await f.text())
    assert(tg.some(([m]) => m === 'sendDocument'))
    for (let i = 0; i < 20 && !tg.some(([m]) => m === 'deleteMessage'); i++) await new Promise(r => setTimeout(r, 50))
    assert.deepEqual(tg.find(([m]) => m === 'deleteMessage')[1], { chat_id: '42', message_id: 99 })

    const thread = await realFetch(`${base}/api/orders/${ID}/messages`, { headers: { 'X-Order-Token': token } }).then(r => r.json())
    const last = thread.messages.slice(-2)
    assert.equal(last[0].from, 'support'); assert.equal(last[0].text, 'Email: x@y.z Password: 123')
    assert.equal(last[1].text, 'Your guide'); assert.equal(last[1].file.name, 'Login.pdf'); assert(last[1].file.key)

    // 4. The store push tells the bot where this service is (no extra setting).
    for (let i = 0; i < 40 && !lastPut; i++) await new Promise(r => setTimeout(r, 100))
    assert.equal(lastPut.serviceUrl, 'https://shop.example.com')
    console.log('PASS: admin panel replies and files reach the order page; key required; service URL shared with the bot')
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(0)
  })().catch(e => { console.error(e); process.exit(1) })
})
