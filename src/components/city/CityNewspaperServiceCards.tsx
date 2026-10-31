'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { FinanceRates } from '@/app/api/finance/rates/route'
import { ROUTES } from '@/constants/routes'
import { buildWeatherQuery } from '@/lib/weatherQuery'
import { conditionEmoji, getEffectiveIsDay } from '@/lib/weatherApi'
import type { WeatherData } from '@/types/weather'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function RateItem({
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
    <li>
      <span className="ed-service-strip__muted">{label}</span> <strong>{value}</strong>{' '}
      <span className={up ? 'is-up' : 'is-down'}>
        {up ? '▲' : '▼'}%{Math.abs(change).toFixed(2)}
      </span>
    </li>
  )
}

export function CityNewspaperServiceCards({
  citySlug,
  cityName,
}: {
  citySlug: string
  cityName: string
}) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [rates, setRates] = useState<FinanceRates | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const query = buildWeatherQuery(citySlug)
    const load = () => {
      void fetch(`/api/weather?city=${encodeURIComponent(query)}&days=1`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: WeatherData | null) => {
          if (data) {
            setWeather(data)
            setNowMs(Date.now())
          }
        })
        .catch(() => {})
    }
    load()
    const id = window.setInterval(load, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [citySlug])

  useEffect(() => {
    const load = () => {
      void fetch('/api/finance/rates')
        .then((res) => (res.ok ? res.json() : null))
        .then((data: FinanceRates | null) => {
          if (data) setRates(data)
        })
        .catch(() => {})
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (!weather && !rates) return null

  const isDay = weather ? getEffectiveIsDay(weather, nowMs) : 1
  const emoji = weather
    ? conditionEmoji(weather.current.condition.code, isDay, weather.current.condition.icon)
    : '•'

  // Editorial desktop: one thin service strip (weather · markets · city
  // guide links) instead of five large cards competing with the news.
  return (
    <section className="ed-service-strip" aria-label="Hava ve piyasalar">
      {weather ? (
        <Link prefetch={false} href={ROUTES.WEATHER} className="ed-service-strip__weather">
          <span aria-hidden>{emoji}</span>
          <strong data-city-weather={citySlug}>{cityName}</strong>
          <span>{Math.round(weather.current.temp_c)}°</span>
          <span className="ed-service-strip__muted">{weather.current.condition.text}</span>
        </Link>
      ) : null}

      {rates ? (
        <ul className="ed-service-strip__rates" aria-label="Döviz kurları">
          <RateItem label="USD/TL" value={`₺${fmt(rates.usdTry.value, 2)}`} change={rates.usdTry.change} />
          <RateItem label="EUR/TL" value={`₺${fmt(rates.eurTry.value, 2)}`} change={rates.eurTry.change} />
          <RateItem label="Altın" value={`₺${fmt(rates.goldTryGram.value, 0)}`} change={rates.goldTryGram.change} />
          <RateItem label="BIST 100" value={fmt(rates.bist100.value, 0)} change={rates.bist100.change} />
        </ul>
      ) : null}

      <nav className="ed-service-strip__links" aria-label="Şehir rehberi">
        <Link prefetch={false} href="/nobetci-eczaneler">Nöbetçi eczaneler</Link>
        <Link prefetch={false} href="/etkinlik">Etkinlikler</Link>
        <Link prefetch={false} href="/ilceler">İlçeler</Link>
      </nav>
    </section>
  )
}
