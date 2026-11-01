import React, { useState } from 'react'
import OrderChat from './OrderChat.jsx'
import { savedShopOrders } from '../shopChat.js'

// "💬 My orders": every tool/service order placed on this device, each with
// its chat to JK Support (logins and updates arrive here).
export default function ShopOrders({ open, onClose, unread = [] }) {
  const orders = savedShopOrders()
  const [active, setActive] = useState(null)
  if (!open) return null
  const current = orders.find(o => o.orderId === active) || (orders.length === 1 ? orders[0] : null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl font-bold">💬 My orders</h3>
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
        {!orders.length && <p className="mt-3 text-sm text-gray-500">No orders on this device yet.</p>}
        {current ? (
          <div className="mt-4 space-y-3">
            {orders.length > 1 && (
              <button type="button" className="text-sm underline" onClick={() => setActive(null)}>← All orders</button>
            )}
            <div className="text-sm font-semibold">{current.product}</div>
            <OrderChat orderId={current.orderId} token={current.token} />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {orders.map(o => (
              <li key={o.orderId}>
                <button
                  type="button"
                  onClick={() => setActive(o.orderId)}
                  className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{o.product}</span>
                    {unread.includes(o.orderId) && (
                      <span className="rounded-full bg-red-600 text-white text-xs px-2 py-0.5">New reply</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{o.orderId} · {new Date(o.at).toLocaleString()}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
