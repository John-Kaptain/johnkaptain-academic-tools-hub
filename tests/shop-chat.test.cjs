'use strict'
// Boots the real server.cjs with Telegram and IntaSend simulated (no network)
// and walks the website order chat end to end.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-chat-'))
const PORT = 41000 + Math.floor(Math.random() * 1000)
Object.assign(process.env, {
  PORT: String(PORT),
  ORDER_STORE_FILE: path.join(dir, 'orders.store.json'),
  TELEGRAM_BOT_TOKEN: '123:test',
  TELEGRAM_ADMIN_CHAT_ID: '111',
  TELEGRAM_WEBHOOK_SECRET: 'hook-secret',
  PUBLIC_BASE_URL: 'https://shop.example.test',
  INTASEND_TEST_ENVIRONMENT: 'true',
  INTASEND_TEST_SECRET_KEY: 'ISSecretKey_test',
  INTASEND_TEST_PUBLISHABLE_KEY: 'ISPubKey_test',
  INACTIVE_START_EAT: '00:00',
  INACTIVE_END_EAT: '00:00',
})

// Simulated outside world.
const telegramCalls = []
let messageId = 500
const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const href = String(url)
  if (href.startsWith('https://api.telegram.org/')) {
    const method = href.split('/').pop()
    const body = JSON.parse(options.body || '{}')
    telegramCalls.push({ method, body })
    return { ok: true, json: async () => ({ ok: true, result: { message_id: ++messageId } }) }
  }
  if (href.startsWith('https://api.intasend.com/')) {
    // STK push accepted and immediately complete.
    return { ok: true, status: 200, text: async () => JSON.stringify({ invoice: { invoice_id: 'INV1', state: 'COMPLETE' } }),
      json: async () => ({ invoice: { invoice_id: 'INV1', state: 'COMPLETE' } }) }
  }
  return realFetch(url, options)
}

require('../server.cjs')
const base = `http://127.0.0.1:${PORT}`
const site = { Origin: 'https://jkacademictoolshub.com', 'Content-Type': 'application/json' }
const api = (p, opts = {}) => realFetch(base + p, opts).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const hook = (update, secret = 'hook-secret') => realFetch(base + '/telegram/webhook', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(update),
})
const wait = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  await wait(300)
  assert(telegramCalls.some(c => c.method === 'setWebhook' && c.body.url === 'https://shop.example.test/telegram/webhook' && c.body.secret_token === 'hook-secret'),
    'webhook registered on start')

  // 1. Checkout returns a chat token; the new domain is allowed by default.
  const checkout = await api('/api/checkout', { method: 'POST', headers: site, body: JSON.stringify({ productId: 'grammarly-premium', paymentPhone: '0712345678' }) })
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body))
  const { orderId, chatToken } = checkout.body
  assert.match(chatToken, /^[a-f0-9]{48}$/)

  // 2. WhatsApp is optional: delivery details without a number are accepted.
  const delivery = await api('/api/delivery-details', { method: 'POST', headers: site, body: JSON.stringify({ orderId, whatsappNumber: '', mpesaName: 'Jane' }) })
  assert.equal(delivery.status, 200, JSON.stringify(delivery.body))
  const paidAlert = telegramCalls.find(c => c.method === 'sendMessage' && /New paid order ready for fulfillment/.test(c.body.text))
  assert(paidAlert, 'paid order alert sent')
  assert.deepEqual(paidAlert.body.reply_markup.inline_keyboard[0][0], { text: '💬 Reply', callback_data: 'reply:' + orderId })
  assert(/WhatsApp: not provided — use the website chat/.test(paidAlert.body.text))

  // 3. Token protection.
  assert.equal((await api(`/api/orders/${orderId}/messages`, { headers: { ...site, 'X-Order-Token': 'wrong' } })).status, 404)
  const auth = { ...site, 'X-Order-Token': chatToken }

  // 4. Customer message reaches the admin with a Reply button.
  const sent = await api(`/api/orders/${orderId}/messages`, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'Hello, waiting for my Grammarly logins.' }) })
  assert.equal(sent.status, 200)
  const customerAlert = telegramCalls.filter(c => /Website customer message/.test(c.body.text || '')).at(-1)
  assert(customerAlert.body.text.includes(orderId) && customerAlert.body.text.includes('waiting for my Grammarly logins'))
  assert.equal(customerAlert.body.reply_markup.inline_keyboard[0][0].callback_data, 'reply:' + orderId)

  // 5. Admin taps 💬 Reply, then types the logins.
  const admin = { id: 111, is_bot: false, first_name: 'Admin' }
  await hook({ update_id: 1, callback_query: { id: 'cb1', from: admin, data: 'reply:' + orderId, message: { message_id: 600, chat: { id: 111 } } } })
  await wait(100)
  await hook({ update_id: 2, message: { message_id: 601, chat: { id: 111 }, from: admin, text: 'Email: jane@example.com\nPassword: Pass1234' } })
  await wait(100)
  let thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  assert.deepEqual(thread.messages.map(m => [m.from, m.text]), [
    ['client', 'Hello, waiting for my Grammarly logins.'],
    ['support', 'Email: jane@example.com\nPassword: Pass1234'],
  ])
  assert(telegramCalls.some(c => /Sent to the customer on the website/.test(c.body.text || '')), 'admin gets a confirmation')

  // 6. Swipe-reply to the original paid alert also reaches the customer.
  const alertId = 500 + telegramCalls.filter(c => c.method === 'sendMessage').indexOf(paidAlert) + 1
  const storedIds = JSON.parse(fs.readFileSync(process.env.ORDER_STORE_FILE, 'utf8'))[orderId].telegramMessageIds
  assert(storedIds.length >= 2, 'alert message ids remembered for swipe-replies')
  await hook({ update_id: 3, message: { message_id: 602, chat: { id: 111 }, from: admin, text: 'Logged in fine? Reply here anytime.', reply_to_message: { message_id: storedIds[0] } } })
  await wait(100)
  thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  assert.equal(thread.messages.at(-1).text, 'Logged in fine? Reply here anytime.')
  assert.equal(thread.paid, true)

  // 7. Security: wrong webhook secret and non-admin chats are ignored.
  assert.equal((await hook({ update_id: 4, message: { chat: { id: 111 }, text: 'x' } }, 'wrong')).status, 401)
  await hook({ update_id: 5, callback_query: { id: 'cb2', from: { id: 222 }, data: 'reply:' + orderId, message: { chat: { id: 222 } } } })
  await hook({ update_id: 6, message: { message_id: 700, chat: { id: 222 }, from: { id: 222 }, text: 'I am not the admin', reply_to_message: { message_id: storedIds[0] } } })
  await wait(100)
  thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  assert(!thread.messages.some(m => m.text === 'I am not the admin'))
  // /cancel closes reply mode: a later plain message is not delivered.
  await hook({ update_id: 7, callback_query: { id: 'cb3', from: admin, data: 'reply:' + orderId, message: { chat: { id: 111 } } } })
  await hook({ update_id: 8, message: { message_id: 703, chat: { id: 111 }, from: admin, text: '/cancel' } })
  await hook({ update_id: 9, message: { message_id: 704, chat: { id: 111 }, from: admin, text: 'note to self' } })
  await wait(100)
  thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  assert(!thread.messages.some(m => m.text === 'note to self'))

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('PASS: checkout issues a chat key; WhatsApp optional; paid alert has 💬 Reply')
  console.log('PASS: customer message -> admin with Reply; Reply button and swipe-reply -> order page')
  console.log('PASS: wrong key, wrong webhook secret, non-admin chats and /cancel all handled')
  process.exit(0)
})().catch(err => { console.error(err); process.exit(1) })
