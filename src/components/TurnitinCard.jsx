import React, { useEffect, useRef, useState } from 'react'

const IMAGE = 'https://guides.turnitin.com/hc/article_attachments/47879733204749'

// Featured Turnitin card. Buttons and prices come live from the JK Turnitin
// Bot, so a service switched off for Telegram disappears here too.
export default function TurnitinCard({ config, onChoose, supportNotice, hasOrders, onOpenOrder }) {
  const services = config?.services || []
  const similarity = services.find(s => s.type === 'SIMILARITY')
  const full =
    services.find(s => s.type === 'CHECK') ||
    // During the public discount window the bot offers the discount instead of CHECK.
    services.find(s => s.type === 'RESALE')
  const discount = config?.discount
  const unavailable = config && (!config.enabled || !config.open)

  // JK_UPLOAD_BOX_V1: only the services switched on right now (e.g. Similarity only
  // appears only when it is enabled on the server).
  const options = [
    full && {
      type: full.type,
      title: 'AI + Similarity',
      price: full.price,
      detail: 'AI score + similarity report',
      badge: full.type === 'RESALE' ? (discount?.label || 'Discount') : null,
    },
    similarity && { type: similarity.type, title: 'Similarity only', price: similarity.price, detail: 'similarity report' },
  ].filter(Boolean)
  const [chosen, setChosen] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  // Default to the first option; follow the live list if a service is switched off.
  useEffect(() => {
    if (!options.some(o => o.type === chosen)) setChosen(options[0]?.type || null)
  }, [options.map(o => o.type).join(','), chosen]) // eslint-disable-line react-hooks/exhaustive-deps

  // The chosen files open the checkout with this report already selected.
  function start(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    onChoose(chosen, null, false, files)
  }

  return (
    <div className="col-span-2 xl:col-span-3 relative flex flex-col sm:flex-row gap-4 rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-white to-emerald-50 dark:from-slate-900 dark:to-emerald-950/40 ring-2 ring-emerald-500 shadow-xl">
      <span className="absolute -top-3 left-4 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow">
        ⚡ Automated · Instant M-Pesa checkout
      </span>
      <img
        src={IMAGE}
        alt="Turnitin AI and similarity report"
        className="w-full sm:w-2/5 sm:self-start aspect-video sm:aspect-auto sm:h-[22rem] rounded-xl object-cover object-left-top bg-white"
      />
      <div className="flex flex-1 flex-col">
        <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">Turnitin Reports</h3>
        {supportNotice && (
          <button
            className="mt-2 self-start animate-pulse rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow"
            onClick={() => onOpenOrder(supportNotice)}
          >
            💬 New message from JK Support — open
          </button>
        )}
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Upload your document, pay with M-Pesa and download your Turnitin reports right here.
        </p>

        {unavailable ? (
          <p className="mt-4 rounded-xl bg-amber-100 dark:bg-amber-900/40 p-3 text-sm">
            {config.closedMessage || 'Website orders are temporarily unavailable.'}
          </p>
        ) : (
          <>
            {/* JK_UPLOAD_BOX_V1: a clear start — pick the report, then drop or choose the document. */}
            <ol className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200" aria-label="How it works">
              {['① Choose report', '② Upload document', '③ Pay with M-Pesa', '④ Download reports'].map(step => (
                <li key={step} className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-1">{step}</li>
              ))}
            </ol>

            {options.length > 0 && (
              <fieldset className="mt-3">
                <legend className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-200">
                  {options.length > 1 ? 'Which report?' : 'Report'}
                </legend>
                <div className="grid gap-2">
                  {options.map(o => {
                    const on = o.type === chosen
                    return (
                      <label
                        key={o.type}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-colors ${
                          on
                            ? 'border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/50'
                            : 'border-gray-300 bg-white hover:border-indigo-300 dark:border-gray-600 dark:bg-slate-900'
                        }`}
                      >
                        <input
                          type="radio"
                          name="turnitin-report"
                          className="mt-1 h-4 w-4 accent-indigo-600"
                          checked={on}
                          onChange={() => setChosen(o.type)}
                        />
                        <span>
                          <span className="block font-bold text-gray-900 dark:text-white">
                            {o.title}
                            {o.badge && (
                              <span className="ml-1.5 rounded bg-amber-500 px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase text-white">
                                {o.badge}
                              </span>
                            )}
                          </span>
                          <span className="block text-sm text-gray-600 dark:text-gray-300">
                            Ksh. {o.price} · {o.detail}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a document to check"
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); start(e.dataTransfer?.files) }}
              className={`mt-3 cursor-pointer rounded-2xl border-[2.5px] border-dashed px-4 py-3.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                dragging
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50'
                  : 'border-indigo-500 bg-white hover:bg-indigo-50/60 dark:border-indigo-400 dark:bg-slate-900 dark:hover:bg-slate-800'
              }`}
            >
              <p className="text-base font-extrabold text-indigo-950 dark:text-white"><span aria-hidden="true">📄 </span>Drop your document here, or tap to choose</p>
              <span className="mt-2 inline-block rounded-xl bg-indigo-600 px-5 py-2 text-base font-bold text-white shadow hover:bg-indigo-700">
                📤 Choose document
              </span>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                PDF, DOC or DOCX · up to {config?.maxFiles || 10} files · 20 MB each
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={(config?.acceptedExtensions || ['.pdf', '.doc', '.docx']).join(',')}
                className="hidden"
                onChange={e => { start(e.target.files); e.target.value = '' }}
              />
            </div>
          </>
        )}

        {hasOrders && (
          <button
            type="button"
            className="mt-3 w-full rounded-xl border-2 border-emerald-700 bg-white px-4 py-3 text-center text-sm font-extrabold text-emerald-900 shadow transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:border-emerald-400 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-slate-800"
            onClick={() => onOpenOrder(null)}
            aria-label="View my Turnitin orders and download reports"
          >
            📁 View My Turnitin Orders & Reports
          </button>
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
