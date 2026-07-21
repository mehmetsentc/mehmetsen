import { describe, expect, it } from 'vitest'
import {
  conditionEmoji,
  getEffectiveIsDay,
  parseWeatherAstroTime,
  parseWeatherLocaltime,
  resolveIsDay,
} from '@/lib/weatherApi'
import type { WeatherData } from '@/types/weather'

describe('resolveIsDay', () => {
  it('returns day between sunrise and sunset', () => {
    expect(
      resolveIsDay({
        localtime: '2026-07-20 17:00',
        sunrise: '05:53 AM',
        sunset: '08:13 PM',
        apiIsDay: 0,
      })
    ).toBe(1)
  })

  it('returns night before sunrise even if api says day', () => {
    expect(
      resolveIsDay({
        localtime: '2026-07-20 04:10',
        sunrise: '05:53 AM',
        sunset: '08:13 PM',
        apiIsDay: 1,
      })
    ).toBe(0)
  })

  it('advances stale night payload into daytime', () => {
    // Cached at 05:00 (night). After ~2 hours of wall time → daytime.
    expect(
      resolveIsDay({
        localtime: '2026-07-20 05:00',
        sunrise: '05:53 AM',
        sunset: '08:13 PM',
        apiIsDay: 0,
        advanceMs: 2 * 60 * 60 * 1000,
      })
    ).toBe(1)
  })

  it('falls back to condition icon path', () => {
    expect(
      resolveIsDay({
        apiIsDay: 0,
        conditionIcon: '//cdn.weatherapi.com/weather/64x64/day/113.png',
      })
    ).toBe(1)
  })

  it('uses day icon URL for clear sky emoji when is_day is stale', () => {
    expect(
      conditionEmoji(1000, 0, '//cdn.weatherapi.com/weather/64x64/day/113.png')
    ).toBe('☀️')
  })
})

describe('parse helpers', () => {
  it('parses localtime and AM/PM astro clocks', () => {
    expect(parseWeatherLocaltime('2026-07-20 17:05')?.getHours()).toBe(17)
    expect(parseWeatherAstroTime('05:53 AM', '2026-07-20')?.getHours()).toBe(5)
    expect(parseWeatherAstroTime('08:13 PM', '2026-07-20')?.getHours()).toBe(20)
  })
})

describe('getEffectiveIsDay', () => {
  it('corrects stale is_day using astro + fetchedAt', () => {
    const fetchedAt = Date.UTC(2026, 6, 20, 2, 0, 0) // 05:00 TR roughly not needed — we use advance
    const data = {
      location: {
        name: 'Antalya',
        region: '',
        country: 'Turkey',
        lat: 36.9,
        lon: 30.7,
        localtime: '2026-07-20 05:00',
        tz_id: 'Europe/Istanbul',
      },
      current: {
        temp_c: 30,
        temp_f: 86,
        feelslike_c: 30,
        feelslike_f: 86,
        humidity: 40,
        wind_kph: 10,
        wind_dir: 'N',
        pressure_mb: 1010,
        vis_km: 10,
        uv: 1,
        is_day: 0,
        condition: { text: 'Açık', icon: '//cdn.weatherapi.com/weather/64x64/night/113.png', code: 1000 },
        last_updated: '2026-07-20 05:00',
      },
      forecast: [
        {
          date: '2026-07-20',
          day: {} as WeatherData['forecast'][0]['day'],
          astro: {
            sunrise: '05:53 AM',
            sunset: '08:13 PM',
            moonrise: '',
            moonset: '',
            moon_phase: '',
          },
          hour: [],
        },
      ],
      alerts: [],
      fetchedAt,
    } satisfies WeatherData

    expect(getEffectiveIsDay(data, fetchedAt + 3 * 60 * 60 * 1000)).toBe(1)
  })
})
