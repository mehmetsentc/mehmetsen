'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { DesktopNewsletterSignup } from '@/components/home/desktop/DesktopNewsletterSignup'
import { DesktopInsideIndex } from '@/components/home/desktop/DesktopInsideIndex'
import { WeatherMini } from '@/components/widgets/WeatherMini'
import type { NewsItem } from '@/types/newsItem'

interface DesktopRightRailProps {
  mostRead: NewsItem[]
  className?: string
}

export function DesktopRightRail({ mostRead, className }: DesktopRightRailProps) {
  const top = mostRead.slice(0, 6)

  return (
    <aside className={className} aria-label="Yan sütun">
      <div className="desktop-newspaper-rail-sticky space-y-5">
        {top.length > 0 ? (
          <div className="nl-highlights">
            <h3 className="nl-highlights__title">Öne Çıkanlar</h3>
            <ol className="m-0 list-none space-y-3 p-0">
              {top.map((item, i) => (
                <li key={item.id} className="flex gap-3 border-b border-[rgb(var(--color-border))] pb-3 last:border-0 last:pb-0">
                  <span className="w-5 shrink-0 text-lg font-black tabular-nums text-[rgb(var(--color-brand))]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Link
                    href={newsItemDetailHref(item)}
                    className="line-clamp-3 font-serif text-sm font-semibold leading-snug text-[rgb(var(--color-text))] hover:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ol>
            <Link
              href={ROUTES.CATEGORY('gundem')}
              className="mt-3 block text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-brand))] hover:underline"
            >
              Tümünü gör →
            </Link>
          </div>
        ) : null}

        <DesktopInsideIndex />

        <DesktopNewsletterSignup />

        <div className="min-h-[100px]">
          <WeatherMini />
        </div>
      </div>
    </aside>
  )
}
