'use client'

import { useMemo, useState } from 'react'
import {
  Briefcase,
  Building2,
  CalendarClock,
  ExternalLink,
  MapPin,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobListing } from '@/types/jobListing'

interface CityJobsClientProps {
  citySlug: string
  cityName: string
  initialJobs: JobListing[]
  syncConfigured: boolean
  missingEnv: string[]
}

function formatDeadline(iso: string | null): string {
  if (!iso) return 'Son başvuru tarihi belirtilmedi'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function kindLabel(kind: JobListing['listingKind']): string | null {
  if (kind === 'iup') return 'IUP'
  if (kind === 'typ') return 'TYP'
  if (kind === 'normal') return null
  return null
}

function sourceLabel(source: JobListing['source']): string {
  if (source === 'kariyer') return 'Kariyer.net'
  if (source === 'iskur') return 'İŞKUR'
  return 'NaHaber'
}

export function CityJobsClient({
  cityName,
  initialJobs,
  syncConfigured,
  missingEnv,
}: CityJobsClientProps) {
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState<string | null>(null)

  const districts = useMemo(() => {
    const set = new Set<string>()
    for (const job of initialJobs) {
      if (job.district?.trim()) set.add(job.district.trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [initialJobs])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return initialJobs.filter((job) => {
      if (district && job.district !== district) return false
      if (!q) return true
      const hay = [job.title, job.employer, job.locationLabel, job.district, job.workType]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR')
      return hay.includes(q)
    })
  }, [initialJobs, query, district])

  return (
    <div className="w-full pb-8 pt-3 max-md:pt-2">
      <header className="mb-5 border-b border-[rgb(var(--color-border))] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--color-brand))]/10">
                <Briefcase className="h-5 w-5 text-[rgb(var(--color-brand))]" />
              </span>
              <div>
                <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))] md:text-2xl">
                  {cityName} İş İlanları
                </h1>
                <p className="mt-0.5 text-sm text-[rgb(var(--color-text-secondary))]">
                  Kariyer.net ve İŞKUR ilanları — başvuru kaynak sitede yapılır
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Kaynak:{' '}
            <a
              href="https://www.kariyer.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
            >
              Kariyer.net
            </a>
            {' · '}
            <a
              href="https://www.iskur.gov.tr/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
            >
              İŞKUR
            </a>
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pozisyon, işveren veya ilçe ara…"
              className={cn(
                'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
                'py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--color-text))]',
                'placeholder:text-[rgb(var(--color-muted))]',
                'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
              )}
            />
          </label>
          {districts.length > 0 && (
            <select
              value={district ?? ''}
              onChange={(e) => setDistrict(e.target.value || null)}
              className={cn(
                'rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
                'px-3 py-2.5 text-sm text-[rgb(var(--color-text))]',
                'focus:border-[rgb(var(--color-brand))] focus:outline-none'
              )}
              aria-label="İlçe filtresi"
            >
              <option value="">Tüm ilçeler</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {!syncConfigured && initialJobs.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-[rgb(var(--color-text))]">
          <p className="font-semibold">İş ilanı senkronizasyonu henüz yapılandırılmadı</p>
          <p className="mt-1 text-[rgb(var(--color-text-secondary))]">
            Operatör: Vercel / .env.local içinde <code className="text-xs">APIFY_TOKEN</code>{' '}
            tanımlayın. Kariyer.net şehir URL’sinden çekilir.
          </p>
          <ul className="mt-2 list-inside list-disc font-mono text-xs text-[rgb(var(--color-muted))]">
            {missingEnv.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/60 px-6 py-14 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-[rgb(var(--color-muted))]" />
          <h2 className="mt-3 text-base font-bold text-[rgb(var(--color-text))]">
            Şu an listelenecek ilan yok
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[rgb(var(--color-text-secondary))]">
            {initialJobs.length === 0
              ? `${cityName} için ilanlar günlük senkronize edilir. Kaynak hazır olduğunda burada görünür.`
              : 'Arama veya ilçe filtresine uyan ilan bulunamadı.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((job) => {
            const kind = kindLabel(job.listingKind)
            const src = sourceLabel(job.source)
            return (
              <li key={job.id}>
                <article
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border border-[rgb(var(--color-border))]',
                    'bg-[rgb(var(--color-card))] p-4 shadow-sm sm:flex-row sm:items-stretch sm:justify-between'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                        {src}
                      </span>
                      {kind && (
                        <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                          {kind}
                        </span>
                      )}
                      {job.employerType && (
                        <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                          {job.employerType}
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold leading-snug text-[rgb(var(--color-text))]">
                      {job.title}
                    </h2>
                    {job.employer && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-[rgb(var(--color-text-secondary))]">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.employer}</span>
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--color-muted))]">
                      {(job.locationLabel || job.district) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {job.locationLabel || job.district}
                        </span>
                      )}
                      {job.deadlineAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          {formatDeadline(job.deadlineAt)}
                        </span>
                      )}
                      {job.workType && <span>{job.workType}</span>}
                      {job.openPositions != null && job.openPositions > 0 && (
                        <span>{job.openPositions} açık pozisyon</span>
                      )}
                    </div>
                  </div>

                  {job.applyUrl ? (
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg',
                        'bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-bold text-white',
                        'transition-opacity hover:opacity-90 sm:self-center'
                      )}
                    >
                      İlana git
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="self-start text-xs text-[rgb(var(--color-muted))] sm:self-center">
                      Başvuru linki yok
                    </span>
                  )}
                </article>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
        İlanlar Kariyer.net ve İŞKUR sistemlerinden derlenir; doğruluk için her zaman kaynak
        sayfayı kontrol edin. NaHaber başvuru almaz.
      </p>
    </div>
  )
}
