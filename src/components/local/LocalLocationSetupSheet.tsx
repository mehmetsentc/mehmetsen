'use client'

import { useMemo, useState } from 'react'
import { Loader2, MapPin, Navigation, Search, X } from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'

export type LocalCityOption = {
  slug: string
  name: string
  lat: number
  lng: number
}

interface LocalLocationSetupSheetProps {
  open: boolean
  requestingGps: boolean
  gpsDenied?: boolean
  onAutoLocation: () => void
  onSelectCity: (city: LocalCityOption) => void
}

/**
 * Yerel Haber'de konum izni reddedildiğinde veya otomatik tespit başarısız olduğunda:
 * GPS tekrar dene veya manuel şehir seç.
 */
export function LocalLocationSetupSheet({
  open,
  requestingGps,
  gpsDenied = false,
  onAutoLocation,
  onSelectCity,
}: LocalLocationSetupSheetProps) {
  const [mode, setMode] = useState<'choose' | 'manual'>('choose')
  const [query, setQuery] = useState('')

  const cities = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    const list = TURKISH_PROVINCES.map((p) => ({
      slug: p.slug,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
    }))
    if (!q) return list
    return list.filter(
      (c) =>
        c.name.toLocaleLowerCase('tr-TR').includes(q) || c.slug.includes(q)
    )
  }, [query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-location-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-[rgb(var(--color-card))] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            <h2 id="local-location-title" className="text-base font-black text-[rgb(var(--color-text))]">
              Konumunu belirt
            </h2>
          </div>
          {mode === 'manual' ? (
            <button
              type="button"
              onClick={() => {
                setMode('choose')
                setQuery('')
              }}
              className="rounded-full p-1.5 text-[rgb(var(--color-muted))]"
              aria-label="Geri"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {mode === 'choose' ? (
          <div className="space-y-3 px-5 py-5">
            <p className="text-sm leading-relaxed text-[rgb(var(--color-muted))]">
              Yerel haberleri görebilmek için konumunu paylaş veya şehrini elle seç.
            </p>

            <button
              type="button"
              disabled={requestingGps}
              onClick={onAutoLocation}
              className="flex w-full items-center gap-3 rounded-2xl bg-[rgb(var(--color-brand))] px-4 py-3.5 text-left text-white disabled:opacity-70"
            >
              {requestingGps ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              ) : (
                <Navigation className="h-5 w-5 shrink-0" />
              )}
              <span>
                <span className="block text-sm font-bold">
                  {requestingGps ? 'Konum alınıyor…' : 'Otomatik konum'}
                </span>
                <span className="block text-xs text-white/80">
                  GPS ile şehrini tespit et
                </span>
              </span>
            </button>

            {gpsDenied ? (
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                Konum izni alınamadı. Tarayıcı izinlerini açıp tekrar dene veya şehrini manuel seç.
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => setMode('manual')}
              className="flex w-full items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3.5 text-left"
            >
              <Search className="h-5 w-5 shrink-0 text-[rgb(var(--color-brand))]" />
              <span>
                <span className="block text-sm font-bold text-[rgb(var(--color-text))]">
                  Manuel şehir seç
                </span>
                <span className="block text-xs text-[rgb(var(--color-muted))]">
                  Listeden ilini seç
                </span>
              </span>
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 pt-3">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
              <input
                type="search"
                autoFocus
                placeholder="Şehir ara…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none"
              />
            </div>
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto overscroll-contain pb-[var(--safe-bottom)]">
              {cities.map((c) => (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => onSelectCity(c)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[rgb(var(--color-text))]',
                      'hover:bg-[rgb(var(--color-surface))]'
                    )}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
                    {c.name}
                  </button>
                </li>
              ))}
              {cities.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-[rgb(var(--color-muted))]">
                  Şehir bulunamadı
                </li>
              ) : null}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
