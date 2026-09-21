'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

export function PersonalDashboard({
  chips,
}: {
  chips: Array<{ id: string; label: string; href: string }>
}) {
  const { user } = useAuth()
  const firstName = user?.displayName?.trim().split(/\s+/)[0]
  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <section className="ui-v2-screen px-4 pb-4 pt-2" data-testid="personal-dashboard">
      <p className="text-sm text-white/70">Günaydın{firstName ? ' 👋' : ''}</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">
        {firstName ? `${firstName}'in Gazetesi` : 'NaHaber Gazetesi'}
      </h2>
      <p className="mt-1 text-xs capitalize text-[rgb(var(--nah-text-muted))]">{today}</p>
      {chips.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {chips.map((chip, index) => (
            <Link
              key={chip.id}
              href={chip.href}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold',
                index === 0
                  ? 'bg-[rgb(var(--nah-red))] text-white'
                  : 'bg-white/8 text-white'
              )}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-white/45">Bugünün Özeti</p>
        <p className="mt-1 text-sm text-white/80">
          Mevcut akış ve kategori verinle devam et. Yapay özet üretilmez.
        </p>
        <Link href={ROUTES.FEED_V2} className="mt-3 inline-flex text-sm font-bold text-[rgb(var(--nah-red))]">
          Akışa git →
        </Link>
      </div>
    </section>
  )
}
