import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const legalLinks = [
  { href: '/hukuk/kvkk',               label: 'KVKK / Kişisel Verilerin Korunması' },
  { href: '/hukuk/cerez-politikasi',   label: 'Çerez Politikası' },
  { href: '/hukuk/gizlilik',           label: 'Gizlilik Politikası' },
  { href: '/hukuk/kullanim-kosullari', label: 'Kullanım Koşulları' },
  { href: '/kunye',                     label: 'Künye' },
]

export default function HukukLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-sm text-[rgb(var(--color-muted))]">
        <Link href="/" className="hover:text-[rgb(var(--color-text))]">Ana Sayfa</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[rgb(var(--color-text))] font-medium">Hukuki Bilgiler</span>
      </nav>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar navigation */}
        <aside className="lg:w-60 lg:shrink-0">
          <nav aria-label="Hukuki Sayfalar">
            <ul className="flex flex-row flex-wrap gap-2 lg:flex-col lg:gap-1">
              {legalLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))] aria-[current=page]:bg-[rgb(var(--color-brand))]/10 aria-[current=page]:text-[rgb(var(--color-brand))]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Page content */}
        <div className="min-w-0 flex-1 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-6 py-8 sm:px-8">
          {children}
        </div>
      </div>
    </div>
  )
}
