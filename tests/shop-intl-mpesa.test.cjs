'use strict'
// JK_SHOP_INTL_MPESA_V1: other services paid from outside Kenya (M-Pesa from
// abroad): order without an M-Pesa prompt, transfer reference + screenshot,
// admin confirms on Telegram (✅) or from the panel. Fake Telegram. Offline.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-intl-'))
const KEY = 'k'.repeat(32)
const PORT = 46000 + Math.floor(Math.random() * 1000)
Object.assign(process.env, {
  PORT: String(PORT), ORDER_STORE_FILE: path.join(dir, 'orders.json'), SHOP_STORE_KEY: KEY, SHOP_STORE_URL: 'http://127.0.0.1:1/none',
  TELEGRAM_BOT_TOKEN: 'T0K', TELEGRAM_ADMIN_CHAT_ID: '42', PUBLIC_BASE_URL: 'https://shop.example.com',
  INACTIVE_START_EAT: '00:00', INACTIVE_END_EAT: '00:00',
  INTASEND_TEST_ENVIRONMENT: 'true', INTASEND_TEST_SECRET_KEY: 'ISSecretKey_t', INTASEND_TEST_PUBLISHABLE_KEY: 'ISPubKey_t',
})
const realFetch = global.fetch
const tg = []
let intasend = 0
global.fetch = async (url, o = {}) => {
  const u = String(url)
  if (u.startsWith('https://api.telegram.org/botT0K/')) {
    const method = u.split('/').pop()
    const body = o.body instanceof FormData ? Object.fromEntries([...o.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : 'FILE'])) : JSON.parse(o.body || '{}')
    tg.push([method, body])
    const result = method === 'sendPhoto' ? { message_id: 77, photo: [{ file_id: 'S' }, { file_id: 'BIG' }] }
      : method === 'getFile' ? { file_path: 'p/x.jpg' } : method === 'getWebhookInfo' ? { url: 'https://shop.example.com/telegram/webhook' } : { message_id: 5 }
    return { ok: true, status: 200, json: async () => ({ ok: true, result }), text: async () => '{}' }
  }
  if (u.startsWith('https://api.telegram.org/file/botT0K/')) return new Response(Buffer.from('JPEGDATA'))
  if (u.includes('intasend')) { intasend++; throw new Error('no M-Pesa prompt expected') }
  if (u.startsWith('http://127.0.0.1:1/')) throw new Error('no bot store')
  return realFetch(url, o)
}
require('../server.cjs')
const base = `http://127.0.0.1:${PORT}`
const J = { 'Content-Type': 'application/json', Origin: 'https://jkacademictoolshub.com' }
const A = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }
const webhook = async update => {
  const secret = require('crypto').createHash('sha256').update('jk-shop-webhook:T0K').digest('hex')
  await realFetch(base + '/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(update) })
  await new Promise(r => setTimeout(r, 150))
}

;(async () => {
  for (let i = 0; i < 60; i++) { try { await realFetch(base + '/health'); break } catch { await new Promise(r => setTimeout(r, 100)) } }
  try {
    assert.deepEqual((await (await realFetch(base + '/api/payment-options')).json()).intlMpesa, { enabled: true })
    const pre = await realFetch(base + '/api/orders/x/payment-proof', { method: 'OPTIONS', headers: { Origin: 'https://jkacademictoolshub.com', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'x-payment-ref,x-order-token' } })
    assert.match(String(pre.headers.get('access-control-allow-headers')), /x-payment-ref/i)

    // 1. Order without an M-Pesa prompt; Ksh amount and note reference back.
    let r = await realFetch(base + '/api/checkout-intl', { method: 'POST', headers: J, body: JSON.stringify({ productId: 'ryne-ai' }) })
    const a = await r.json()
    assert.equal(r.status, 200, JSON.stringify(a))
    assert.deepEqual({ ...a.manualPay, note: a.manualPay.note.slice(0, 3) }, { method: 'INTL_MPESA', amount: 1000, currency: 'KES', note: 'JKS', refSent: null, rejected: false })
    assert.equal(intasend, 0)
    let st = await (await realFetch(base + '/api/payment-status/' + a.orderId)).json()
    assert.equal(st.paymentMethod, 'INTL_MPESA'); assert.equal(st.paymentState, 'PENDING')

    // 2. Proof: order key and reference required; images only; screenshot goes to the admin with ✅/❌.
    const proof = (ref, body = '', token = a.chatToken, type = 'image/jpeg') => realFetch(`${base}/api/orders/${a.orderId}/payment-proof`, { method: 'PUT',
      headers: { 'Content-Type': type, 'X-Order-Token': token, ...(ref ? { 'X-Payment-Ref': ref } : {}) }, body })
    assert.equal((await proof('WISE123456', '', 'bad')).status, 404)
    assert.equal((await proof(null)).status, 400)
    assert.equal((await proof('WISE123456', 'not an image', a.chatToken, 'text/plain')).status, 400)
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50)])
    r = await proof(' wise-1234 5678 ', jpg)
    let body = await r.json()
    assert.equal(r.status, 200, JSON.stringify(body))
    assert.equal(body.manualPay.refSent, 'WISE12345678')
    const alert = tg.find(([m]) => m === 'sendPhoto')[1]
    assert.match(alert.caption, /M-Pesa from abroad[\s\S]*Ksh\. 1000[\s\S]*WISE12345678/)
    assert.deepEqual(JSON.parse(alert.reply_markup).inline_keyboard[0].map(b => b.callback_data), ['mpaid:' + a.orderId, 'mreject:' + a.orderId])
    assert.equal((await proof('WISE99999999')).status, 409, 'one proof at a time')

    // The same reference cannot pay a second order.
    const b = await (await realFetch(base + '/api/checkout-intl', { method: 'POST', headers: J, body: JSON.stringify({ productId: 'ryne-ai' }) })).json()
    r = await realFetch(`${base}/api/orders/${b.orderId}/payment-proof`, { method: 'PUT', headers: { 'X-Order-Token': b.chatToken, 'X-Payment-Ref': 'WISE12345678' }, body: '' })
    assert.equal(r.status, 409)

    // 3. ❌ on Telegram: customer asked to resend; ✅ then pays the order.
    await webhook({ update_id: 1, callback_query: { id: 'c1', data: 'mreject:' + a.orderId, from: { id: 42 }, message: { message_id: 77, chat: { id: 42 }, caption: 'proof' } } })
    st = await (await realFetch(base + '/api/payment-status/' + a.orderId)).json()
    assert.equal(st.manualPay.refSent, null); assert.equal(st.manualPay.rejected, true)
    assert(tg.some(([m, x]) => m === 'editMessageCaption' && /Rejected/.test(x.caption)))
    const thread = await (await realFetch(`${base}/api/orders/${a.orderId}/messages`, { headers: { 'X-Order-Token': a.chatToken } })).json()
    assert.match(thread.messages.at(-1).text, /could not find your transfer/)
    assert.equal((await proof('WISE12345678')).status, 200, 'resend allowed (same reference)')
    await webhook({ update_id: 2, callback_query: { id: 'c2', data: 'mpaid:' + a.orderId, from: { id: 99 }, message: { message_id: 5, chat: { id: 99 }, text: 'x' } } })
    st = await (await realFetch(base + '/api/payment-status/' + a.orderId)).json()
    assert.equal(st.paymentState, 'PENDING', 'buttons only from the admin chat')
    await webhook({ update_id: 3, callback_query: { id: 'c3', data: 'mpaid:' + a.orderId, from: { id: 42 }, message: { message_id: 5, chat: { id: 42 }, text: 'proof' } } })
    st = await (await realFetch(base + '/api/payment-status/' + a.orderId)).json()
    assert.equal(st.paymentState, 'COMPLETE'); assert.equal(st.status, 'PAID_AWAITING_WHATSAPP')
    const paidAlert = tg.filter(([m, x]) => m === 'sendMessage' && /PAYMENT COMPLETE/.test(x.text || '')).at(-1)[1].text
    assert.match(paidAlert, /Paid from abroad \(M-Pesa\) — transfer reference: WISE12345678/)

    // 4. From the panel (SHOP_STORE_KEY): confirm, screenshot, key required.
    r = await realFetch(`${base}/api/orders/${b.orderId}/payment-proof`, { method: 'PUT', headers: { 'X-Order-Token': b.chatToken, 'X-Payment-Ref': 'WR7788990011' }, body: '' })
    assert.equal(r.status, 200)
    assert.equal((await realFetch(`${base}/api/admin/orders/${b.orderId}/manual-payment`, { method: 'POST', headers: { ...A, Authorization: 'Bearer no' }, body: '{"approve":true}' })).status, 404)
    r = await realFetch(`${base}/api/admin/orders/${b.orderId}/manual-payment`, { method: 'POST', headers: A, body: '{"approve":true}' })
    assert.deepEqual(await r.json(), { ok: true, already: false, paymentState: 'COMPLETE', status: 'PAID_AWAITING_WHATSAPP' })
    r = await realFetch(`${base}/api/admin/orders/${b.orderId}/manual-payment`, { method: 'POST', headers: A, body: '{"approve":true}' })
    assert.equal((await r.json()).already, true)
    r = await realFetch(`${base}/api/admin/orders/${a.orderId}/proof-image`, { headers: A })
    assert.equal(await r.text(), 'JPEGDATA')

    console.log('PASS: other services from abroad: no prompt, note reference, transfer reference + screenshot to the admin, reused references blocked.')
    console.log('PASS: ✅/❌ on Telegram (admin chat only) and from the panel; rejected customers can resend; paid alert names the transfer.')
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(0)
  } catch (e) { console.error(e); process.exit(1) }
})()
