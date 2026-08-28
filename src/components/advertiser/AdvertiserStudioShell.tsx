'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const NAV = [
  { href: '', label: 'Genel Bakış' },
  { href: '/marketplace', label: 'Pazar Yeri' },
  { href: '/campaigns', label: 'Kampanyalar' },
  { href: '/requests', label: 'Talepler' },
  { href: '/creatives', label: 'Kreatifler' },
]

export function AdvertiserStudioShell({
  children,
  title,
}: {
  children: ReactNode
  title?: string
}) {
  const params = useParams()
  const pathname = usePathname()
  const advertiserId = String(params.advertiserId || '')
  const base = `/advertiser/${advertiserId}`

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 via-stone-50 to-amber-50/40">
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
        <aside className="hidden w-52 shrink-0 md:block">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Reklamveren Stüdyo
          </p>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const href = `${base}${item.href}`
              const active =
                item.href === ''
                  ? pathname === base || pathname === `${base}/`
                  : pathname.startsWith(href)
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`rounded-md px-3 py-2 text-sm ${
                    active
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-700 hover:bg-stone-200/70'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-400">
              <p>Faturalandırma (yakında)</p>
              <p>Ödemeler — Ödeme Bekliyor (flag kapalı)</p>
              <p>Gelişmiş Analitik (yakında)</p>
            </div>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          {title ? <h1 className="mb-6 text-2xl font-semibold text-stone-900">{title}</h1> : null}
          {children}
        </main>
      </div>
    </div>
  )
}
