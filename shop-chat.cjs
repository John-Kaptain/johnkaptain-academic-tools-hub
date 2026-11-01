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
const REPLY_MODE_MS = 15 * 60 * 1000 // Reply mode stays open for several messages/files
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024 // Telegram Bot API download limit

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex')
function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function createShopChat({ getOrder, upsertOrder, listOrders, telegramApi, adminChatId, now = () => Date.now() }) {
  const pendingReply = new Map() // admin chat id -> { orderId, until } (Reply button pressed)
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
      // File ids stay on the server; the page gets a download key only.
      messages: (order.messages || []).slice(-50).map(m =>
        m.file ? { ...m, file: { key: m.file.key, name: m.file.name, size: m.file.size } } : m),
    }
  }

  function addMessage(orderId, from, text, file = null) {
    const order = getOrder(orderId)
    const entry = { at: now(), from, text }
    if (file) entry.file = file
    const messages = [...(order.messages || []), entry]
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
    return { inline_keyboard: [[
      { text: '💬 Reply', callback_data: 'reply:' + orderId },
      { text: '📎 Send files', callback_data: 'file:' + orderId },
    ]] }
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
      'Tap 💬 Reply to answer, or 📎 Send files for documents — they appear on the customer\'s order page.',
    ].join('\n')).catch(err => console.error('Shop chat: admin notification failed:', err.message))
    return view(getOrder(order.id))
  }

  // Attachment on an admin message (document, photo, video, audio, voice).
  function attachmentOf(message) {
    const pick = (f, fallbackName) => f && {
      telegramFileId: f.file_id, name: f.file_name || fallbackName, size: Number(f.file_size || 0), mime: f.mime_type || '',
    }
    if (message.document) return pick(message.document, 'document')
    if (Array.isArray(message.photo) && message.photo.length) return pick(message.photo[message.photo.length - 1], `photo-${message.message_id || 1}.jpg`)
    if (message.video) return pick(message.video, 'video.mp4')
    if (message.audio) return pick(message.audio, 'audio.mp3')
    if (message.voice) return pick(message.voice, 'voice-note.ogg')
    return null
  }

  function findFile(order, key) {
    return (order.messages || []).map(m => m.file).find(f => f && f.key === String(key)) || null
  }

  // Telegram webhook update from the admin.
  async function handleUpdate(update) {
    const callback = update?.callback_query
    if (callback) {
      const chatId = String(callback.message?.chat?.id || callback.from?.id || '')
      if (chatId !== String(adminChatId)) return
      const m = /^(reply|file):(.+)$/.exec(String(callback.data || ''))
      const order = m ? getOrder(m[2]) : null
      const forFiles = m?.[1] === 'file'
      await telegramApi('answerCallbackQuery', { callback_query_id: callback.id, text: order ? (forFiles ? 'Send the files now' : 'Reply mode opened') : 'Order not found' }).catch(() => {})
      if (!order) return
      pendingReply.set(chatId, { orderId: order.id, until: now() + REPLY_MODE_MS })
      // force_reply makes the next message a reply to this prompt, so it is
      // matched to the order even in a group chat with privacy mode on.
      const prompt = await telegramApi('sendMessage', {
        chat_id: chatId,
        text: forFiles
          ? `📎 Send files for ${order.id} (${order.productName}).\n` +
            'Tap the 📎 paperclip and send the document(s) or photo(s) now — several are fine, max 20 MB each. ' +
            'Add a caption if you like. Each file appears on the customer\'s order page as a download.\n' +
            'Send /done when finished.'
          : `✍️ Reply mode for ${order.id} (${order.productName}).\n` +
            'Send messages, documents or photos now (several are fine) — each appears on the customer\'s order page.\n' +
            'Send /done when finished.',
        reply_markup: { force_reply: true, input_field_placeholder: forFiles ? `Attach files for ${order.id}` : `Message or file for ${order.id}` },
      })
      rememberTelegramMessage(order.id, prompt?.result?.message_id)
      return
    }

    const message = update?.message
    if (!message) return
    const chatId = String(message.chat?.id || '')
    if (chatId !== String(adminChatId)) return
    const text = String(message.text || message.caption || '').trim()
    if (text === '/cancel' || text === '/done') {
      pendingReply.delete(chatId)
      await telegramApi('sendMessage', { chat_id: chatId, text: 'Reply mode closed.' })
      return
    }
    // Swipe-reply to an order message takes priority over the Reply button.
    const replied = message.reply_to_message ? orderForTelegramMessage(message.reply_to_message.message_id) : null
    const pending = pendingReply.get(chatId)
    const active = pending && pending.until > now() ? pending : null
    if (pending && !active) pendingReply.delete(chatId)
    const orderId = replied?.id || active?.orderId
    const attachment = attachmentOf(message)
    if (!orderId || (!text && !attachment) || (!attachment && text.startsWith('/'))) return

    if (attachment && attachment.size > MAX_DOWNLOAD_BYTES) {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ ${attachment.name} is larger than 20 MB, which Telegram does not allow bots to pass on. Share a link instead (e.g. Google Drive).`,
      })
      return
    }
    const file = attachment ? { ...attachment, key: crypto.randomBytes(8).toString('hex') } : null
    addMessage(orderId, 'support', text, file)
    if (active && active.orderId === orderId) active.until = now() + REPLY_MODE_MS
    const confirmation = await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `✅ ${file ? 'File' : 'Message'} sent to the customer on the website (${orderId}).` +
        (active && active.orderId === orderId ? '\nKeep sending, or /done to finish.' : ''),
      reply_markup: replyMarkup(orderId),
    })
    rememberTelegramMessage(orderId, confirmation?.result?.message_id)
  }

  return { issueToken, authorize, view, clientMessage, handleUpdate, notifyAdmin, rememberTelegramMessage, replyMarkup, findFile }
}

module.exports = { createShopChat, sha256 }
