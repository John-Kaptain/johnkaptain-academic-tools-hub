'use strict'
// Website download links for files sent from Telegram expire after 48 h.
const assert = require('node:assert/strict')
const { createShopChat } = require('../shop-chat.cjs')
let clock = 1_000_000_000_000
const orders = { O1: { id: 'O1', productName: 'Course Hero', paymentState: 'COMPLETE', messages: [] } }
const chat = createShopChat({
  getOrder: id => orders[id], listOrders: () => Object.values(orders),
  upsertOrder: (id, patch) => (orders[id] = { ...orders[id], ...patch }),
  telegramApi: async () => ({ ok: true, result: { message_id: 1 } }), adminChatId: '111', now: () => clock,
})
;(async () => {
  await chat.handleUpdate({ callback_query: { id: 'c', from: { id: 111 }, data: 'file:O1', message: { chat: { id: 111 } } } })
  await chat.handleUpdate({ message: { message_id: 5, chat: { id: 111 }, document: { file_id: 'F', file_name: 'a.pdf', file_size: 10 } } })
  const key = chat.view(orders.O1).messages[0].file.key
  assert(key && chat.findFile(orders.O1, key).telegramFileId === 'F')
  clock += 47 * 3600_000
  assert(chat.findFile(orders.O1, key), 'available at 47 h')
  clock += 2 * 3600_000
  assert.deepEqual(chat.view(orders.O1).messages[0].file, { name: 'a.pdf', size: 10, expired: true })
  assert.throws(() => chat.findFile(orders.O1, key), e => e.status === 410)
  console.log('PASS: website download links for Telegram files expire after 48 h')
})().catch(e => { console.error(e); process.exit(1) })
