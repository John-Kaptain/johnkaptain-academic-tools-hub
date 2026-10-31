import React from 'react'

const IMAGE = 'https://guides.turnitin.com/hc/article_attachments/47879733204749'

// Featured Turnitin card. Buttons and prices come live from the JK Turnitin
// Bot, so a service switched off for Telegram disappears here too.
export default function TurnitinCard({ config, onChoose }) {
  const services = config?.services || []
  const similarity = services.find(s => s.type === 'SIMILARITY')
  const full =
    services.find(s => s.type === 'CHECK') ||
    // During the public discount window the bot offers the discount instead of CHECK.
    services.find(s => s.type === 'RESALE')
  const discount = config?.discount
  const unavailable = config && (!config.enabled || !config.open)

  return (
    <div className="col-span-2 relative flex flex-col sm:flex-row gap-4 rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-white to-emerald-50 dark:from-slate-900 dark:to-emerald-950/40 ring-2 ring-emerald-500 shadow-xl">
      <span className="absolute -top-3 left-4 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow">
        ⚡ Automated · Instant M-Pesa checkout
      </span>
      <img
        src={IMAGE}
        alt="Turnitin AI and similarity report"
        className="w-full sm:w-2/5 aspect-video sm:aspect-auto rounded-xl object-cover bg-white"
      />
      <div className="flex flex-1 flex-col">
        <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">Turnitin Reports</h3>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Upload your document, pay with M-Pesa and download your Turnitin reports right here.
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
          <li>✔ Up to {config?.maxFiles || 10} documents per order (PDF, DOC or DOCX)</li>
        </ul>

        {unavailable ? (
          <p className="mt-4 rounded-xl bg-amber-100 dark:bg-amber-900/40 p-3 text-sm">
            {config.closedMessage || 'Website orders are temporarily unavailable.'}
          </p>
        ) : (
          <div className="mt-auto pt-4 grid gap-2 sm:grid-cols-2">
            {similarity && (
              <button className="btn btn-outline bg-white dark:bg-slate-900 text-left" onClick={() => onChoose(similarity.type)}>
                <span className="block font-semibold">Similarity Only</span>
                <span className="block text-sm text-gray-600 dark:text-gray-300">Ksh. {similarity.price}</span>
              </button>
            )}
            {full && (
              <button className="btn btn-primary text-left" onClick={() => onChoose(full.type)}>
                <span className="block font-semibold">AI + Similarity</span>
                <span className="block text-sm text-blue-100">
                  Ksh. {full.price}
                  {full.type === 'RESALE' ? ` · ${discount?.label || 'Discount'}` : ''}
                </span>
              </button>
            )}
            {!config && (
              <button className="btn btn-primary sm:col-span-2" onClick={() => onChoose(null)}>
                Upload to check
              </button>
            )}
          </div>
        )}

        {discount?.enabled && discount.requiresCode && !unavailable && (
          <button className="mt-2 self-start text-xs underline text-emerald-700 dark:text-emerald-400" onClick={() => onChoose('RESALE')}>
            Have a {discount.label.toLowerCase()} code?
          </button>
        )}
      </div>
    </div>
  )
}
