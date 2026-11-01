'use strict'
// The shop keeps its order list on the JK Turnitin Bot's disk (SHOP_STORE_KEY).
// A fake bot store stands in for the real one. Offline.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const express = require('express')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-remote-'))
const KEY = 'x'.repeat(32)
const token = 'a'.repeat(48)
let remote = {
  ORD_1700000000000_1: {
    id: 'ORD_1700000000000_1', productName: 'Chegg', paymentState: 'COMPLETE', status: 'PAID_READY_FOR_FULFILLMENT',
    createdAt: Date.now() - 3600_000, updatedAt: Date.now() - 3600_000,
    chatTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    messages: [{ at: Date.now() - 3000_000, from: 'support', text: 'Email: a@b.c Password: saved-before-restart' }],
  },
}
const puts = []
const bot = express()
bot.use(express.json({ limit: '15mb' }))
bot.use((req, res, next) => (req.headers.authorization === 'Bearer ' + KEY ? next() : res.status(404).end()))
bot.get('/api/shop-store', (req, res) => res.json({ ok: true, orders: remote }))
bot.put('/api/shop-store', (req, res) => { remote = req.body.orders; puts.push(Date.now()); res.json({ ok: true }) })

const botServer = bot.listen(0, () => {
  const PORT = 44000 + Math.floor(Math.random() * 1000)
  Object.assign(process.env, {
    PORT: String(PORT), ORDER_STORE_FILE: path.join(dir, 'orders.json'),
    SHOP_STORE_KEY: KEY, SHOP_STORE_URL: `http://127.0.0.1:${botServer.address().port}/api/shop-store`,
    TELEGRAM_BOT_TOKEN: '', INACTIVE_START_EAT: '00:00', INACTIVE_END_EAT: '00:00',
    INTASEND_TEST_ENVIRONMENT: 'true', INTASEND_TEST_SECRET_KEY: 'ISSecretKey_t', INTASEND_TEST_PUBLISHABLE_KEY: 'ISPubKey_t',
  })
  const realFetch = global.fetch
  global.fetch = async (url, o = {}) => {
    if (String(url).startsWith('https://api.intasend.com/')) {
      const b = { invoice: { invoice_id: 'I1', state: 'PENDING' } }
      return { ok: true, status: 200, text: async () => JSON.stringify(b), json: async () => b }
    }
    return realFetch(url, o)
  }
  require('../server.cjs')
  const base = `http://127.0.0.1:${PORT}`
  ;(async () => {
    for (let i = 0; i < 40; i++) { try { await realFetch(base + '/health'); break } catch { await new Promise(r => setTimeout(r, 100)) } }
    // 1. After a restart the saved chat (logins) is still there.
    const thread = await realFetch(`${base}/api/orders/ORD_1700000000000_1/messages`, { headers: { 'X-Order-Token': token } }).then(r => r.json())
    assert.equal(thread.messages[0].text, 'Email: a@b.c Password: saved-before-restart')
    // 2. New orders are saved to the bot.
    const c = await realFetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://jkacademictoolshub.com' },
      body: JSON.stringify({ productId: 'grammarly-premium', paymentPhone: '0712345678' }) }).then(r => r.json())
    for (let i = 0; i < 40 && !remote[c.orderId]; i++) await new Promise(r => setTimeout(r, 100))
    assert(remote[c.orderId], 'new order saved on the bot')
    assert(remote.ORD_1700000000000_1, 'existing orders kept')
    const health = await realFetch(base + '/health').then(r => r.json())
    assert.equal(health.orderStore.loaded, true)
    assert.equal(health.orderStore.where, 'JK Turnitin Bot disk')
    console.log('PASS: order list and chats survive restarts (stored on the JK Turnitin Bot disk)')
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(0)
  })().catch(e => { console.error(e); process.exit(1) })
})
