'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { DesktopNewsletterSignup } from '@/components/home/desktop/DesktopNewsletterSignup'
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
      <div className="sticky top-20 space-y-5">
        {top.length > 0 ? (
          <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
            <h3 className="mb-3 border-t-4 border-[rgb(var(--color-text))] pt-3 text-lg font-bold text-[rgb(var(--color-text))]">
              Çok Okunanlar
            </h3>
            <ol className="space-y-3">
              {top.map((item, i) => (
                <li key={item.id} className="flex gap-3">
                  <span className="w-5 shrink-0 text-lg font-black tabular-nums text-[rgb(var(--color-brand))]">
                    {i + 1}
                  </span>
                  <Link
                    href={newsItemDetailHref(item)}
                    className="line-clamp-3 text-sm font-semibold leading-snug text-[rgb(var(--color-text))] hover:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ol>
            <Link
              href={ROUTES.CATEGORY('gundem')}
              className="mt-3 block text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              Tümünü gör →
            </Link>
          </div>
        ) : null}

        <DesktopNewsletterSignup />

        <div className="min-h-[100px]">
          <WeatherMini />
        </div>
      </div>
    </aside>
  )
}
