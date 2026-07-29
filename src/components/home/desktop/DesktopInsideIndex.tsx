'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'

const INDEX_SLUGS = [
  'gundem',
  'son-dakika',
  'siyaset',
  'ekonomi',
  'spor',
  'teknoloji',
  'dunya',
  'yerel-haber',
  'saglik',
  'kultur',
  'turizm',
  'magazin',
] as const

interface DesktopInsideIndexProps {
  title?: string
  className?: string
}

/**
 * Newsletter-style “Inside Index” — dark box with category links.
 * Desktop newspaper only; uses real NaHaber category routes.
 */
export function DesktopInsideIndex({
  title = 'İçindekiler',
  className,
}: DesktopInsideIndexProps) {
  const items = INDEX_SLUGS.map((slug, i) => {
    const cat = DEFAULT_CATEGORIES.find((c) => c.slug === slug || c.id === slug)
    return {
      href: ROUTES.CATEGORY(slug),
      label: cat?.name ?? slug,
      page: String(i + 1).padStart(2, '0'),
    }
  })

  return (
    <nav className={className ? `nl-index-box ${className}` : 'nl-index-box'} aria-label={title}>
      <p className="nl-index-box__title">{title}</p>
      <ol className="nl-index-box__list">
        {items.map((item) => (
          <li key={item.href} className="nl-index-box__item">
            <Link href={item.href}>{item.label}</Link>
            <span className="nl-index-box__page" aria-hidden>
              {item.page}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
