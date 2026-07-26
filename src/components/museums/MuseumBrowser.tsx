'use client'

import { useEffect, useState } from 'react'
import { Building2, MapPin, Phone, Globe, Clock, Search } from 'lucide-react'

interface MuseumCity {
  cities: string
  slug: string
}

interface Museum {
  id: number
  name: string
  description: string
  address: string
  workingTime: string
  phone: string
  website: string
  city: string
  district: string
}

export function MuseumBrowser({
  initialCities = [],
}: {
  initialCities?: MuseumCity[]
}) {
  const [cities, setCities] = useState<MuseumCity[]>(initialCities)
  const [selectedCity, setSelectedCity] = useState('')
  const [museums, setMuseums] = useState<Museum[]>([])
  const [loadingCities, setLoadingCities] = useState(initialCities.length === 0)
  const [loadingMuseums, setLoadingMuseums] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (initialCities.length > 0) return
    fetch('/api/museums/cities')
      .then((r) => r.json())
      .then((d) => setCities(d.cities ?? []))
      .catch(() => {})
      .finally(() => setLoadingCities(false))
  }, [initialCities.length])

  const handleCityChange = (slug: string) => {
    setSelectedCity(slug)
    setMuseums([])
    setSearch('')
    if (!slug) return
    setLoadingMuseums(true)
    fetch(`/api/museums?city=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setMuseums(d.museums ?? []))
      .catch(() => {})
      .finally(() => setLoadingMuseums(false))
  }

  const filtered = museums.filter(
    (m) =>
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.district && m.district.toLowerCase().includes(search.toLowerCase()))
  )

  const selectedCityName = cities.find((c) => c.slug === selectedCity)?.cities ?? ''

  return (
    <div className="mx-auto min-h-[50vh] max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Building2 className="h-6 w-6 text-[rgb(var(--color-brand))]" aria-hidden />
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Türkiye Müzeleri</h1>
      </div>

      {/* Filtreler */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <select
            className="w-full appearance-none rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 pr-8 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]"
            value={selectedCity}
            onChange={(e) => handleCityChange(e.target.value)}
            disabled={loadingCities}
            aria-label="Şehir seç"
          >
            <option value="">{loadingCities ? 'Yükleniyor...' : 'Şehir seçin...'}</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.cities}
              </option>
            ))}
          </select>
        </div>

        {selectedCity && (
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              type="text"
              placeholder="Müze veya ilçe ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2.5 pl-9 pr-4 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]"
            />
          </div>
        )}
      </div>

      {/* İçerik */}
      {!selectedCity ? (
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-12 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-[rgb(var(--color-muted))]" aria-hidden />
          <p className="text-[rgb(var(--color-muted))]">
            Müzeleri keşfetmek için yukarıdan bir şehir seçin
          </p>
        </div>
      ) : loadingMuseums ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl bg-[rgb(var(--color-border))]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">
          {search
            ? `"${search}" için sonuç bulunamadı.`
            : `${selectedCityName} için müze bilgisi bulunamadı.`}
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-[rgb(var(--color-muted))]">
            <span className="font-medium text-[rgb(var(--color-text))]">{selectedCityName}</span>{' '}
            — {filtered.length} müze
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((museum) => (
              <article
                key={museum.id}
                className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4"
              >
                <h2 className="font-semibold leading-snug text-[rgb(var(--color-text))]">
                  {museum.name}
                </h2>

                {museum.district && (
                  <p className="text-xs font-medium text-[rgb(var(--color-brand))]">
                    {museum.district}
                  </p>
                )}

                {museum.description && (
                  <p className="line-clamp-3 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                    {museum.description.replace(/\r\n|\r|\n/g, ' ').trim()}
                  </p>
                )}

                <div className="mt-auto flex flex-col gap-1.5 text-xs text-[rgb(var(--color-muted))]">
                  {museum.address && (
                    <div className="flex gap-1.5">
                      <MapPin className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="line-clamp-2">{museum.address}</span>
                    </div>
                  )}
                  {museum.workingTime && (
                    <div className="flex gap-1.5">
                      <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="line-clamp-1">{museum.workingTime}</span>
                    </div>
                  )}
                  {museum.phone && (
                    <div className="flex gap-1.5">
                      <Phone className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      <a
                        href={`tel:${museum.phone}`}
                        className="hover:text-[rgb(var(--color-brand))]"
                      >
                        {museum.phone}
                      </a>
                    </div>
                  )}
                  {museum.website && (
                    <div className="flex gap-1.5">
                      <Globe className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      <a
                        href={museum.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate hover:text-[rgb(var(--color-brand))]"
                      >
                        {museum.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
