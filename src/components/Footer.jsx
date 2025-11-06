import React from 'react'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-slate-100 mt-12">
      <div className="container-narrow py-10 text-center space-y-3">
        <a
          className="font-medium text-white hover:underline"
          href="https://chat.whatsapp.com/II1haBXUzowJQnn3Dm5Q33"
          target="_blank"
          rel="noreferrer"
        >
          Join Our Overall WhatsApp Group (No Adverts)
        </a>

        <div>
          <a
            className="font-medium text-white hover:underline"
            href="https://chat.whatsapp.com/KQeiCiTeFyc7pRHxDzqQzl?mode=wwt"
            target="_blank"
            rel="noreferrer"
          >
            Join Our ChatGPT WhatsApp Group (Only Subscribers)
          </a>
        </div>

        {/* Phone number now dials directly */}
        <div className="text-white">
          Contact:{' '}
          <a
            className="underline hover:no-underline"
            href="tel:+254701730921"
            aria-label="Call 0701730921"
          >
            0701730921
          </a>
        </div>

        <div className="text-sm text-slate-200/90">
          © 2025 Academic Tools Hub. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
