'use strict'
// Website order chat for the JohnKaptain Academic Tools Bot.
//
// - Every product order gets a secret token (kept only in the buyer's
//   browser). With it the buyer can read messages for that order, and send
//   them once the order is paid (unpaid checkouts cannot reach Telegram).
// - A buyer message is sent to the admin's Telegram chat with a "💬 Reply"
//   button. The admin answers by tapping Reply (then typing) or by simply
//   swipe-replying to any message about that order. The answer is stored on
//   the order and shown on the website (e.g. login details).
// - Telegram updates arrive on POST /telegram/webhook, protected by Telegram's
//   secret-token header. Only messages from the admin chat are accepted.

const crypto = require('crypto')

const MAX_MESSAGE_CHARS = 2000
const CLIENT_LIMIT_PER_HOUR = 15

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex')
function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function createShopChat({ getOrder, upsertOrder, listOrders, telegramApi, adminChatId, now = () => Date.now() }) {
  const pendingReply = new Map() // admin chat id -> orderId (Reply button pressed)
  const rate = new Map()

  function issueToken(orderId) {
    const token = crypto.randomBytes(24).toString('hex')
    upsertOrder(orderId, { chatTokenHash: sha256(token) })
    return token
  }

  function authorize(orderId, token) {
    const order = getOrder(orderId)
    if (!order || !order.chatTokenHash || !safeEqual(order.chatTokenHash, sha256(token))) {
      const e = new Error('Order not found'); e.status = 404; throw e
    }
    return order
  }

  function view(order) {
    return {
      orderId: order.id,
      productName: order.productName,
      amount: order.amount,
      status: order.status,
      paid: order.paymentState === 'COMPLETE',
      messages: (order.messages || []).slice(-50),
    }
  }

  function addMessage(orderId, from, text) {
    const order = getOrder(orderId)
    const messages = [...(order.messages || []), { at: now(), from, text }]
    return upsertOrder(orderId, { messages: messages.slice(-200) })
  }

  // Remember which Telegram messages belong to which order, so a swipe-reply works.
  function rememberTelegramMessage(orderId, messageId) {
    if (!messageId) return
    const order = getOrder(orderId)
    const ids = [...(order?.telegramMessageIds || []), Number(messageId)].slice(-50)
    upsertOrder(orderId, { telegramMessageIds: ids })
  }
  function orderForTelegramMessage(messageId) {
    return listOrders().find(o => (o.telegramMessageIds || []).includes(Number(messageId))) || null
  }

  function replyMarkup(orderId) {
    return { inline_keyboard: [[{ text: '💬 Reply', callback_data: 'reply:' + orderId }]] }
  }

  async function notifyAdmin(orderId, text) {
    const data = await telegramApi('sendMessage', {
      chat_id: adminChatId, text, reply_markup: replyMarkup(orderId),
    })
    rememberTelegramMessage(orderId, data?.result?.message_id)
    return data
  }

  async function clientMessage(order, rawText) {
    const text = String(rawText || '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_MESSAGE_CHARS)
    // Only paid orders can message, so unpaid checkouts cannot flood Telegram.
    if (order.paymentState !== 'COMPLETE') { const e = new Error('Chat opens once your payment is confirmed.'); e.status = 403; throw e }
    if (text.length < 1) { const e = new Error('Write a message first.'); e.status = 400; throw e }
    const t = now()
    const hits = (rate.get(order.id) || []).filter(x => t - x < 3600_000)
    if (hits.length >= CLIENT_LIMIT_PER_HOUR) { const e = new Error('Too many messages. Please wait a little.'); e.status = 429; throw e }
    rate.set(order.id, [...hits, t])
    addMessage(order.id, 'client', text)
    await notifyAdmin(order.id, [
      '💬 Website customer message',
      `Order ID: ${order.id}`,
      `Product: ${order.productName}`,
      `Status: ${order.paymentState === 'COMPLETE' ? 'PAID' : order.status}`,
      '',
      text,
      '',
      'Tap 💬 Reply (or swipe-reply to this message) to answer on the website.',
    ].join('\n')).catch(err => console.error('Shop chat: admin notification failed:', err.message))
    return view(getOrder(order.id))
  }

  // Telegram webhook update from the admin.
  async function handleUpdate(update) {
    const callback = update?.callback_query
    if (callback) {
      const chatId = String(callback.message?.chat?.id || callback.from?.id || '')
      if (chatId !== String(adminChatId)) return
      const m = /^reply:(.+)$/.exec(String(callback.data || ''))
      const order = m ? getOrder(m[1]) : null
      await telegramApi('answerCallbackQuery', { callback_query_id: callback.id, text: order ? 'Reply mode opened' : 'Order not found' }).catch(() => {})
      if (!order) return
      pendingReply.set(chatId, order.id)
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: `✍️ Reply mode for ${order.id} (${order.productName}).\nSend your message now — it will appear on the customer's order page.\nSend /cancel to stop.`,
      })
      return
    }

    const message = update?.message
    if (!message) return
    const chatId = String(message.chat?.id || '')
    if (chatId !== String(adminChatId)) return
    const text = String(message.text || message.caption || '').trim()
    if (text === '/cancel') {
      pendingReply.delete(chatId)
      await telegramApi('sendMessage', { chat_id: chatId, text: 'Reply mode closed.' })
      return
    }
    // Swipe-reply to an order message takes priority over the Reply button.
    const replied = message.reply_to_message ? orderForTelegramMessage(message.reply_to_message.message_id) : null
    const orderId = replied?.id || pendingReply.get(chatId)
    if (!orderId || !text || text.startsWith('/')) return
    addMessage(orderId, 'support', text)
    if (!replied) pendingReply.delete(chatId)
    const confirmation = await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `✅ Sent to the customer on the website (${orderId}).`,
      reply_markup: replyMarkup(orderId),
    })
    rememberTelegramMessage(orderId, confirmation?.result?.message_id)
  }

  return { issueToken, authorize, view, clientMessage, handleUpdate, notifyAdmin, rememberTelegramMessage, replyMarkup }
}

module.exports = { createShopChat, sha256 }
