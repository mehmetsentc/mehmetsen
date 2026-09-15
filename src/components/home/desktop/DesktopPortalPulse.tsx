'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { FinanceRates } from '@/app/api/finance/rates/route'
import { ROUTES } from '@/constants/routes'

type WeatherRow = {
  city: string
  temp: number
  text: string
}

const WEATHER_CITIES = ['Istanbul', 'Ankara', 'Izmir'] as const

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function RateRow({
  label,
  value,
  change,
}: {
  label: string
  value: string
  change: number
}) {
  const up = change >= 0
  return (
    <li className="desktop-portal-pulse__row">
      <span>{label}</span>
      <span className="desktop-portal-pulse__val">{value}</span>
      <span className={up ? 'is-up' : 'is-down'}>
        {up ? '▲' : '▼'} %{Math.abs(change).toFixed(2)}
      </span>
    </li>
  )
}

export function DesktopPortalPulse() {
  const [rates, setRates] = useState<FinanceRates | null>(null)
  const [weather, setWeather] = useState<WeatherRow[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/finance/rates')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FinanceRates | null) => {
        if (!cancelled && data) setRates(data)
      })
      .catch(() => {
        /* no invented rates */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      WEATHER_CITIES.map((city) =>
        fetch(`/api/weather?city=${encodeURIComponent(city)}&days=1`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const temp = Number(data?.current?.temp_c)
            if (!Number.isFinite(temp)) return null
            return {
              city: String(data?.location?.name || city),
              temp: Math.round(temp),
              text: String(data?.current?.condition?.text || ''),
            } satisfies WeatherRow
          })
          .catch(() => null)
      )
    ).then((rows) => {
      if (cancelled) return
      setWeather(rows.filter((row): row is WeatherRow => Boolean(row)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!rates && weather.length === 0) return null

  return (
    <section className="desktop-portal-band" aria-label="Döviz ve hava durumu">
      <div className="desktop-portal-split">
        {rates ? (
          <article className="desktop-portal-cat" style={{ borderTopColor: '#7C3AED' }}>
            <Link href={ROUTES.CATEGORY('ekonomi')} className="desktop-portal-cat__kicker">
              Döviz
            </Link>
            <ul className="desktop-portal-pulse__list">
              <RateRow
                label="USD/TL"
                value={`₺${fmt(rates.usdTry.value, 4)}`}
                change={rates.usdTry.change}
              />
              <RateRow
                label="EUR/TL"
                value={`₺${fmt(rates.eurTry.value, 4)}`}
                change={rates.eurTry.change}
              />
              <RateRow
                label="Gram altın"
                value={`₺${fmt(rates.goldTryGram.value, 0)}`}
                change={rates.goldTryGram.change}
              />
              <RateRow
                label="BIST 100"
                value={fmt(rates.bist100.value, 2)}
                change={rates.bist100.change}
              />
            </ul>
          </article>
        ) : (
          <div />
        )}
        {weather.length > 0 ? (
          <article className="desktop-portal-cat" style={{ borderTopColor: '#0284C7' }}>
            <Link href={ROUTES.WEATHER} className="desktop-portal-cat__kicker">
              Hava durumu
            </Link>
            <ul className="desktop-portal-pulse__list">
              {weather.map((row) => (
                <li key={row.city} className="desktop-portal-pulse__row">
                  <span>{row.city}</span>
                  <span className="desktop-portal-pulse__val">{row.temp}°</span>
                  <span className="desktop-portal-pulse__wx">{row.text}</span>
                </li>
              ))}
            </ul>
          </article>
        ) : (
          <div />
        )}
      </div>
    </section>
  )
}
