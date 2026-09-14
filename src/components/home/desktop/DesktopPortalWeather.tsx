'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'

type WeatherChip = {
  city: string
  temp: number
}

export function DesktopPortalWeather() {
  const [chip, setChip] = useState<WeatherChip | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/weather?city=Istanbul&days=1', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.current || !data?.location) return
        const temp = Number(data.current.temp_c)
        if (!Number.isFinite(temp)) return
        setChip({
          city: String(data.location.name || 'İstanbul'),
          temp: Math.round(temp),
        })
      })
      .catch(() => {
        /* keep utility bar without invented weather */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!chip) return null

  return (
    <Link
      href={ROUTES.WEATHER}
      className="desktop-portal-utility__meta hover:text-[rgb(var(--color-text))]"
    >
      {chip.temp}°C {chip.city}
    </Link>
  )
}
