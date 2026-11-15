import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: Messages } = await server.ssrLoadModule('/src/components/TurnitinMessages.jsx')
  const messages = [
    { kind: 'system', text: 'PAYMENT_ACCEPTED_TEST', at: 1 },
    ...Array.from({ length: 8 }, (_, i) => ({ kind: i % 2 ? 'client' : 'support', text: `CHAT_${i}_TEST`, at: i + 2 })),
  ]
  const html = renderToStaticMarkup(React.createElement(Messages, { messages, orderId: 'ORDER_A' }))
  const [conversation, updates] = html.split('<details')
  assert.ok(!conversation.includes('PAYMENT_ACCEPTED_TEST'), 'system events stay out of support conversation')
  assert.ok(updates.includes('PAYMENT_ACCEPTED_TEST'), 'automatic events remain accessible')
  assert.ok(!updates.startsWith(' open'), 'automatic updates start collapsed')
  assert.ok(!conversation.includes('CHAT_0_TEST'), 'older messages are collapsed by default')
  assert.ok(conversation.includes('Show 2 earlier messages'))
  assert.ok(conversation.indexOf('CHAT_2_TEST') < conversation.indexOf('CHAT_7_TEST'), 'chat stays chronological')
  assert.ok(html.includes('Order ORDER_A'))
  assert.deepEqual(messages.map(m => m.at), [1,2,3,4,5,6,7,8,9], 'render does not mutate the API response')
  const empty = renderToStaticMarkup(React.createElement(Messages, { orderId: 'ORDER_B' }))
  assert.ok(empty.includes('No support messages for this order yet.'))
  assert.ok(!empty.includes('CHAT_7_TEST'), 'another order gets its own empty conversation')
  console.log('PASS: Turnitin chat separates updates, limits the initial history, preserves chronology and isolates orders')
} finally { await server.close() }
