import React from 'react'

const PAY_TILL = 'Lipa Na Mpesa Till: 6164915'
const WHATSAPP_E164 = '254701730921' // 0701730921

function waLink(item) {
  const text = `Hello, I'm interested in purchasing ${item.name} at Ksh. ${item.price}. I am paying via ${PAY_TILL}.`
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(text)}`
}

export default function Modal({ open, item, onClose }) {
  if (!open || !item) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card max-w-lg w-full">
        <h3 className="text-xl font-bold">{item.name}</h3>
        <p className="mt-2 text-gray-600 dark:text-gray-300">{item.description}</p>
        <p className="mt-1 font-semibold">{`Ksh. ${item.price}`}</p>

        <div className="mt-5 flex gap-3 justify-end">
          <a className="btn btn-primary" href={waLink(item)} target="_blank" rel="noreferrer">
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
