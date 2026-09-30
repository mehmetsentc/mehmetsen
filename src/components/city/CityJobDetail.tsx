import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ExternalLink,
  MapPin,
  Wallet,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import type { JobDetailContent } from '@/lib/jobListingPresentation'
import { cn } from '@/lib/utils'

interface CityJobDetailProps {
  detail: JobDetailContent
}

export function CityJobDetail({ detail }: CityJobDetailProps) {
  return (
    <div className="w-full pb-8 pt-3 max-md:pt-2">
      <Link prefetch={false}
        href={ROUTES.CITY_JOBS}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-brand))]"
      >
        <ArrowLeft className="h-4 w-4" />
        İş ilanlarına dön
      </Link>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <article className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
          <div className="border-b border-[rgb(var(--color-border))] px-5 py-5 sm:px-6">
            <div className="mb-4 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[rgb(var(--color-brand))]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                {detail.sourceLabel}
              </span>
              <span className="rounded-full bg-[rgb(var(--color-surface-elevated))] px-2.5 py-1 text-[10px] font-semibold text-[rgb(var(--color-text-secondary))]">
                {detail.categoryLabel}
              </span>
              {detail.kindLabel && (
                <span className="rounded-full bg-[rgb(var(--color-surface-elevated))] px-2.5 py-1 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                  {detail.kindLabel}
                </span>
              )}
            </div>

            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--color-brand))] text-base font-black tracking-tight text-white">
                {detail.monogram}
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-black leading-tight tracking-tight text-[rgb(var(--color-text))] sm:text-2xl">
                  {detail.title}
                </h1>
                {detail.employer && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[rgb(var(--color-text-secondary))]">
                    <Building2 className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{detail.employer}</span>
                  </p>
                )}
                {detail.place && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-[rgb(var(--color-muted))]">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {detail.place}
                    <span className="text-[rgb(var(--color-border-strong))]">·</span>
                    {detail.cityName}
                  </p>
                )}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[rgb(var(--color-border))] px-5 py-4 sm:grid-cols-3 sm:px-6">
            {detail.facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  {fact.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[rgb(var(--color-text))]">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            {detail.salaryText && (
              <p className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-surface-elevated))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-text))]">
                <Wallet className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                {detail.salaryText}
              </p>
            )}

            <section>
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">İlan özeti</h2>
              {detail.summary ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
                  {detail.summary}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
                  Bu kaydın tam metni kaynak sitede duruyor. Pozisyon, işveren, konum ve son
                  başvuru tarihi yukarıda NaHaber panosunda özetlendi. Başvuruya geçince{' '}
                  {detail.sourceLabel} sayfası açılır.
                </p>
              )}
            </section>

            {detail.requirements && (
              <section>
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Aranan nitelikler</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
                  {detail.requirements}
                </p>
              </section>
            )}
          </div>
        </article>

        <aside className="lg:sticky lg:top-4">
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[rgb(var(--color-brand))]">
              Başvuru
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--color-text-secondary))]">
              {detail.applyHint}
            </p>
            {detail.applyUrl ? (
              <a
                href={detail.applyUrl}
                target={detail.applyUrl.startsWith('http') ? '_blank' : undefined}
                rel={detail.applyUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                className={cn(
                  'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl',
                  'bg-[rgb(var(--color-brand))] px-5 py-3 text-sm font-bold text-white',
                  'transition-opacity hover:opacity-90'
                )}
              >
                Başvur
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              <p className="mt-4 text-sm font-semibold text-[rgb(var(--color-muted))]">
                Bu ilan için başvuru bağlantısı yok.
              </p>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              İlan metnini göndermeden önce kaynak sayfadaki son tarihi kontrol edin.
            </p>
          </div>

          {detail.related.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Benzer ilanlar</h2>
              <ul className="mt-3 space-y-2">
                {detail.related.map((item) => (
                  <li key={item.id}>
                    <Link prefetch={false}
                      href={ROUTES.CITY_JOB_DETAIL(item.id)}
                      className="block rounded-xl px-2 py-2 transition-colors hover:bg-[rgb(var(--color-surface-elevated))]"
                    >
                      <span className="block text-sm font-semibold text-[rgb(var(--color-text))]">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[rgb(var(--color-muted))]">
                        {[item.employer, item.place, item.sourceLabel].filter(Boolean).join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

    </div>
  )
}
