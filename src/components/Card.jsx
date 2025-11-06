import React from 'react'

export default function Card({ item, onOpen }) {
  return (
    <div className="card flex flex-col">
      <img
        src={item.image || '/placeholder.svg'}
        alt={item.name}
        className="aspect-video w-full rounded-xl object-cover"
      />
      <div className="mt-3 font-semibold">{item.name}</div>
      <div className="text-gray-600 dark:text-gray-300">{`Ksh. ${item.price}`}</div>
      <button className="btn btn-primary mt-4" onClick={() => onOpen(item)}>
        Order via WhatsApp
      </button>
    </div>
  )
}
