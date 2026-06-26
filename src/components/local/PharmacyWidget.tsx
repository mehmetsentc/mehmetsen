'use client'

import { useEffect, useState } from 'react'
import { Phone, MapPin, Clock, AlertCircle, Loader2, Cross } from 'lucide-react'

interface Pharmacy {
  name: string
  address: string
  phone: string
  phone_formatted: string
  district: string
  is_open: boolean
  workingHours: string
  coordinates?: { lat: string; lon: string }
}

interface ApiResponse {
  data?: Pharmacy[]
  error?: string
}

interface Props {
  citySlug: string
  cityName: string
}

export function PharmacyWidget({ citySlug, cityName }: Props) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setPharmacies([])
    setUnavailable(false)

    fetch(`/api/eczane?il=${encodeURIComponent(citySlug)}`)
      .then(async res => {
        const json: ApiResponse = await res.json()
        if (res.status === 503) {
          setUnavailable(true)
          return
        }
        if (!res.ok || json.error) {
          setError(json.error ?? 'Veri alınamadı')
          return
        }
        setPharmacies(json.data ?? [])
      })
      .catch(() => setError('Bağlantı hatası'))
      .finally(() => setLoading(false))
  }, [citySlug])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[rgb(var(--color-muted))]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Nöbetçi eczaneler yükleniyor…</span>
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="mx-3 mt-4 rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-10 px-6 text-center">
        <Cross className="mx-auto mb-3 h-7 w-7 text-[rgb(var(--color-muted))]" />
        <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Eczane servisi aktif değil</p>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Yakında eklenecek
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-3 mt-4 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 py-6 px-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-400" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    )
  }

  if (pharmacies.length === 0) {
    return (
      <div className="mx-3 mt-4 rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-10 px-6 text-center">
        <Cross className="mx-auto mb-3 h-7 w-7 text-[rgb(var(--color-muted))]" />
        <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
          {cityName} için nöbetçi eczane bulunamadı
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2 px-3 pb-4">
      <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">
        {cityName} · {pharmacies.length} nöbetçi eczane
      </p>

      <div className="space-y-2">
        {pharmacies.map((p, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4"
          >
            {/* İsim + açık/kapalı badge */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-[rgb(var(--color-text))] leading-snug">
                {p.name}
              </h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                p.is_open
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))]'
              }`}>
                {p.is_open ? 'Açık' : 'Kapalı'}
              </span>
            </div>

            {/* İlçe */}
            <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">{p.district}</p>

            {/* Adres */}
            <div className="mt-2 flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-muted))]" />
              <p className="text-xs text-[rgb(var(--color-muted))] leading-relaxed">{p.address}</p>
            </div>

            {/* Saat */}
            {p.workingHours && p.workingHours !== 'closed' && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-muted))]" />
                <p className="text-xs text-[rgb(var(--color-muted))]">{p.workingHours}</p>
              </div>
            )}

            {/* Telefon */}
            {p.phone && (
              <a
                href={`tel:${p.phone}`}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-brand))]"
              >
                <Phone className="h-3.5 w-3.5" />
                {p.phone_formatted || p.phone}
              </a>
            )}

            {/* Harita linki */}
            {p.coordinates?.lat && (
              <a
                href={`https://maps.google.com/?q=${p.coordinates.lat},${p.coordinates.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[10px] text-[rgb(var(--color-muted))] underline underline-offset-2"
              >
                Haritada göster
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
