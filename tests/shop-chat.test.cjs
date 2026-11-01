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
let intasendState = 'COMPLETE'
const realFetch = global.fetch
global.fetch = async (url, options = {}) => {
  const href = String(url)
  if (href.startsWith('https://api.telegram.org/file/bot123:test/')) {
    const bytes = Buffer.from('%PDF-1.4 coursehero unlock for ' + href.split('/').pop())
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }
  }
  if (href.startsWith('https://api.telegram.org/')) {
    const method = href.split('/').pop()
    const body = JSON.parse(options.body || '{}')
    telegramCalls.push({ method, body })
    if (method === 'getFile') return { ok: true, json: async () => ({ ok: true, result: { file_path: 'documents/' + body.file_id + '.pdf' } }) }
    if (method === 'getWebhookInfo') return { ok: true, json: async () => ({ ok: true, result: { url: 'https://shop.example.test/telegram/webhook', pending_update_count: 0 } }) }
    return { ok: true, json: async () => ({ ok: true, result: { message_id: ++messageId } }) }
  }
  if (href.startsWith('https://api.intasend.com/')) {
    // STK push accepted and immediately complete.
    const body = { invoice: { invoice_id: 'INV1', state: intasendState } }
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body }
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

  // 1b. One "payment complete" alert as soon as payment completes, before the
  //     optional details step, in the Academic Tools Bot chat. No PENDING alerts.
  await wait(100)
  const early = telegramCalls.filter(c => c.method === 'sendMessage' && /PAYMENT COMPLETE/.test(c.body.text || ''))
  assert.equal(early.length, 1, 'complete alert sent once, even if the customer closes the page')
  assert.deepEqual(early[0].body.reply_markup.inline_keyboard[0][1], { text: '📎 Send files', callback_data: 'file:' + orderId })

  // 2. WhatsApp is optional: delivery details without a number are accepted.
  const delivery = await api('/api/delivery-details', { method: 'POST', headers: site, body: JSON.stringify({ orderId, whatsappNumber: '', mpesaName: 'Jane' }) })
  assert.equal(delivery.status, 200, JSON.stringify(delivery.body))
  const paidAlert = telegramCalls.find(c => c.method === 'sendMessage' && /New paid order ready for fulfillment/.test(c.body.text))
  assert(paidAlert, 'paid order alert sent')
  assert.deepEqual(paidAlert.body.reply_markup.inline_keyboard[0][0], { text: '💬 Reply', callback_data: 'reply:' + orderId })
  assert(/WhatsApp: not provided — use the website chat/.test(paidAlert.body.text))
  assert.equal(telegramCalls.filter(c => /PAYMENT COMPLETE/.test(c.body.text || '')).length, 1, 'no second complete alert')
  assert.equal(telegramCalls.filter(c => /Customer details added/.test(c.body.text || '') && /M-Pesa name: Jane/.test(c.body.text)).length, 1)

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
  const prompt = telegramCalls.filter(c => /Reply mode for/.test(c.body.text || '')).at(-1)
  assert.equal(prompt.body.reply_markup.force_reply, true, 'Reply prompt asks Telegram for a reply (works in groups too)')
  await hook({ update_id: 2, message: { message_id: 601, chat: { id: 111 }, from: admin, text: 'Email: jane@example.com\nPassword: Pass1234' } })
  await wait(100)
  let thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  assert.deepEqual(thread.messages.map(m => [m.from, m.text]), [
    ['client', 'Hello, waiting for my Grammarly logins.'],
    ['support', 'Email: jane@example.com\nPassword: Pass1234'],
  ])
  assert(telegramCalls.some(c => /sent to the customer on the website/i.test(c.body.text || '')), 'admin gets a confirmation')

  // 6. Swipe-reply to the original paid alert also reaches the customer.
  const alertId = 500 + telegramCalls.filter(c => c.method === 'sendMessage').indexOf(paidAlert) + 1
  const storedIds = JSON.parse(fs.readFileSync(process.env.ORDER_STORE_FILE, 'utf8'))[orderId].telegramMessageIds
  assert(storedIds.length >= 2, 'alert message ids remembered for swipe-replies')
  await hook({ update_id: 3, message: { message_id: 602, chat: { id: 111 }, from: admin, text: 'Logged in fine? Reply here anytime.', reply_to_message: { message_id: storedIds[0] } } })
  await wait(100)
  thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  assert.equal(thread.messages.at(-1).text, 'Logged in fine? Reply here anytime.')
  assert.equal(thread.paid, true)

  // 6a. 📎 Send files button opens file mode with a paperclip prompt.
  await hook({ update_id: 19, callback_query: { id: 'cbf', from: admin, data: 'file:' + orderId, message: { chat: { id: 111 } } } })
  await wait(50)
  const filePrompt = telegramCalls.filter(c => /Send files for/.test(c.body.text || '')).at(-1)
  assert(filePrompt && filePrompt.body.reply_markup.force_reply, 'file prompt shown')
  await hook({ update_id: 18, message: { message_id: 619, chat: { id: 111 }, from: admin, text: '/done' } })

  // 6b. Files: in reply mode the admin sends a document and a photo in a row
  //     (reply mode stays open), then /done.
  await hook({ update_id: 20, callback_query: { id: 'cb9', from: admin, data: 'reply:' + orderId, message: { chat: { id: 111 } } } })
  await hook({ update_id: 21, message: { message_id: 620, chat: { id: 111 }, from: admin, caption: 'Your Course Hero unlock',
    document: { file_id: 'DOC1', file_name: 'Unlocked – Week 4.pdf', file_size: 52000, mime_type: 'application/pdf' } } })
  await hook({ update_id: 22, message: { message_id: 621, chat: { id: 111 }, from: admin,
    photo: [{ file_id: 'PSMALL', file_size: 900 }, { file_id: 'PBIG', file_size: 90000 }] } })
  await hook({ update_id: 23, message: { message_id: 622, chat: { id: 111 }, from: admin, text: '/done' } })
  await hook({ update_id: 24, message: { message_id: 623, chat: { id: 111 }, from: admin, text: 'after done' } })
  await hook({ update_id: 25, message: { message_id: 624, chat: { id: 111 }, from: admin, caption: 'too big', reply_to_message: { message_id: storedIds[0] },
    document: { file_id: 'HUGE', file_name: 'huge.zip', file_size: 30 * 1024 * 1024 } } })
  await wait(150)
  thread = (await api(`/api/orders/${orderId}/messages`, { headers: auth })).body
  const files = thread.messages.filter(m => m.file)
  assert.deepEqual(files.map(m => [m.text, m.file.name, m.file.size]), [
    ['Your Course Hero unlock', 'Unlocked – Week 4.pdf', 52000],
    ['', 'photo-621.jpg', 90000],
  ])
  assert(!JSON.stringify(thread).includes('DOC1'), 'Telegram file ids are not exposed to the page')
  assert(!thread.messages.some(m => m.text === 'after done' || m.text === 'too big'))
  assert(telegramCalls.some(c => /larger than 20 MB/.test(c.body.text || '')), 'admin told the file is too big')
  const dl = await realFetch(`${base}/api/orders/${orderId}/files/${files[0].file.key}?token=${chatToken}`, { headers: { Origin: site.Origin } })
  assert.equal(dl.status, 200)
  assert.match(dl.headers.get('content-disposition'), /filename\*=UTF-8''Unlocked%20%E2%80%93%20Week%204\.pdf/)
  assert.equal(await dl.text(), '%PDF-1.4 coursehero unlock for DOC1.pdf')
  const photo = await realFetch(`${base}/api/orders/${orderId}/files/${files[1].file.key}?token=${chatToken}`)
  assert.equal(await photo.text(), '%PDF-1.4 coursehero unlock for PBIG.pdf', 'largest photo size is delivered')
  assert.equal((await realFetch(`${base}/api/orders/${orderId}/files/${files[0].file.key}?token=wrong`)).status, 404)

  // 6c. Health shows Telegram's view of the webhook.
  const health = (await api('/health')).body
  assert.equal(health.telegramWebhook.ok, true)
  assert.equal(health.telegramWebhook.expectedUrl, 'https://shop.example.test/telegram/webhook')

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

  // 8. Unpaid orders cannot message (no Telegram flooding from abandoned checkouts).
  intasendState = 'PENDING'
  const unpaid = await api('/api/checkout', { method: 'POST', headers: site, body: JSON.stringify({ productId: 'grammarly-premium', paymentPhone: '0712345679' }) })
  assert.equal(unpaid.status, 200, JSON.stringify(unpaid.body))
  const before = telegramCalls.length
  const blocked = await api(`/api/orders/${unpaid.body.orderId}/messages`, { method: 'POST', headers: { ...site, 'X-Order-Token': unpaid.body.chatToken }, body: JSON.stringify({ text: 'spam' }) })
  assert.equal(blocked.status, 403)
  assert.equal(telegramCalls.slice(before).filter(c => /Website customer message/.test(c.body.text || '')).length, 0, 'nothing sent to Telegram')
  const unpaidThread = (await api(`/api/orders/${unpaid.body.orderId}/messages`, { headers: { ...site, 'X-Order-Token': unpaid.body.chatToken } })).body
  assert.equal(unpaidThread.paid, false)
  assert.deepEqual(unpaidThread.messages, [])

  // 9. Failed payment: one ❌ PAYMENT FAILED alert; never a PENDING alert.
  intasendState = 'FAILED'
  await api('/api/checkout', { method: 'POST', headers: site, body: JSON.stringify({ productId: 'grammarly-premium', paymentPhone: '0712345670' }) })
  for (let i = 0; i < 40 && !telegramCalls.some(c => /PAYMENT FAILED/.test(c.body.text || '')); i++) await wait(250)
  // (the earlier unpaid order now fails too: one alert per order, no repeats)
  await wait(3000)
  const failedIds = telegramCalls.filter(c => /PAYMENT FAILED/.test(c.body.text || '')).map(c => /Order ID: (\S+)/.exec(c.body.text)[1])
  assert(failedIds.length >= 1 && new Set(failedIds).size === failedIds.length, 'one failed alert per order: ' + failedIds)
  assert(!telegramCalls.some(c => /PENDING/.test(c.body.text || '')), 'no pending alerts')

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('PASS: checkout issues a chat key; WhatsApp optional; paid alert has 💬 Reply')
  console.log('PASS: customer message -> admin with Reply; Reply button and swipe-reply -> order page')
  console.log('PASS: wrong key, wrong webhook secret, non-admin chats and /cancel all handled')
  console.log('PASS: admin sends documents/photos in a row; client downloads them; >20 MB refused; /done closes')
  console.log('PASS: Academic Tools Bot gets one ✅ PAYMENT COMPLETE and one ❌ PAYMENT FAILED alert, never PENDING; 📎 Send files button')
  console.log('PASS: unpaid orders cannot send messages; nothing reaches Telegram')
  process.exit(0)
})().catch(err => { console.error(err); process.exit(1) })
