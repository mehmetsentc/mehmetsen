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

function RateCard({
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
    <article className="desktop-portal-fx-card">
      <p className="desktop-portal-fx-card__label">{label}</p>
      <p className="desktop-portal-fx-card__value">{value}</p>
      <p className={`desktop-portal-fx-card__change ${up ? 'is-up' : 'is-down'}`}>
        {up ? '▲' : '▼'} %{Math.abs(change).toFixed(2)}
      </p>
    </article>
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
      void fetch(`/api/weather?city=${encodeURIComponent(query)}&days=1`, { cache: 'no-store' })
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

  const isDay = weather ? getEffectiveIsDay(weather, nowMs) : true
  const emoji = weather
    ? conditionEmoji(weather.current.condition.code, isDay, weather.current.condition.icon)
    : '•'

  return (
    <section className="desktop-portal-service" aria-label="Hava ve piyasalar">
      {weather ? (
        <Link href={ROUTES.WEATHER} className="desktop-portal-weather-card">
          <p className="desktop-portal-weather-card__kicker">Hava durumu</p>
          <p className="desktop-portal-weather-card__city" data-city-weather={citySlug}>
            {cityName}
          </p>
          <div className="desktop-portal-weather-card__row">
            <span className="desktop-portal-weather-card__emoji" aria-hidden>
              {emoji}
            </span>
            <p className="desktop-portal-weather-card__temp">
              {Math.round(weather.current.temp_c)}°
            </p>
          </div>
          <p className="desktop-portal-weather-card__cond">{weather.current.condition.text}</p>
        </Link>
      ) : null}

      {rates ? (
        <div className="desktop-portal-service__fx" aria-label="Döviz kurları">
          <RateCard
            label="USD/TL"
            value={`₺${fmt(rates.usdTry.value, 4)}`}
            change={rates.usdTry.change}
          />
          <RateCard
            label="EUR/TL"
            value={`₺${fmt(rates.eurTry.value, 4)}`}
            change={rates.eurTry.change}
          />
          <RateCard
            label="Altın"
            value={`₺${fmt(rates.goldTryGram.value, 0)}`}
            change={rates.goldTryGram.change}
          />
          <RateCard
            label="BIST 100"
            value={fmt(rates.bist100.value, 2)}
            change={rates.bist100.change}
          />
        </div>
      ) : null}
    </section>
  )
}
