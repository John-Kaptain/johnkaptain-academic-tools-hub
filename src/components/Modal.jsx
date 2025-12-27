import React from 'react'

const PAY_TILL = 'Lipa Na Mpesa Till: 6164915'
const WHATSAPP_E164 = '254701730921' // 0701730921

function waLink(item) {
  const text = `Hello, I'm interested in purchasing ${item.name} at Ksh. ${item.price}. I am paying via ${PAY_TILL}.`
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(text)}`
}

function getLinkLabel(url) {
  if (url.includes('t.me/')) return 'Telegram bot link'
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function linkifyText(text) {
  if (!text) return null

  const urlRegex = /https?:\/\/[^\s]+/g
  const parts = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = urlRegex.exec(text)) !== null) {
    const urlRaw = match[0]
    const start = match.index

    // normal text before link
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start))
    }

    // remove trailing punctuation from URL (so the link works)
    let url = urlRaw
    let trailing = ''
    while (/[).,!?:;]$/.test(url)) {
      trailing = url.slice(-1) + trailing
      url = url.slice(0, -1)
    }

    parts.push(
      <a
        key={`link-${key++}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline text-blue-600 dark:text-blue-400"
      >
        {getLinkLabel(url)}
      </a>
    )

    if (trailing) parts.push(trailing)

    lastIndex = start + urlRaw.length
  }

  // remaining text after last link
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export default function Modal({ open, item, onClose }) {
  if (!open || !item) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card max-w-lg w-full">
        <h3 className="text-xl font-bold">{item.name}</h3>

        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {linkifyText(item.description)}
        </p>

        <p className="mt-1 font-semibold">{`Ksh. ${item.price}`}</p>

        <div className="mt-5 flex gap-3 justify-end">
          <a
            className="btn btn-primary"
            href={waLink(item)}
            target="_blank"
            rel="noreferrer"
          >
            Proceed
          </a>
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
