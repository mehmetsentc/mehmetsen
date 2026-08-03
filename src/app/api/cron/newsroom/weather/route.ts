/**
 * Weather Newsroom Cron — 15 dakikada bir hava durumu haberlerini günceller.
 * Wraps the existing /api/cron/weather-news handler with newsroom auth pattern.
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  fetchWeather,
  TURKISH_WEATHER_CITIES,
  getAlertType,
  isExtremeTemperature,
  getWindAlert,
} from '@/lib/weatherApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Only update extreme/alert cities every 15 min; normal cities every hour
// (Checked via last_updated timestamp stored in weather_news collection)
const NORMAL_UPDATE_INTERVAL_MS = 60 * 60 * 1000     // 1 hour
const ALERT_UPDATE_INTERVAL_MS = 15 * 60 * 1000       // 15 min (urgent)

async function generateWeatherArticle(
  city: string,
  temp: number,
  condition: string,
  humidity: number,
  windKph: number,
  alertType: string | null
): Promise<{ title: string; summary: string; content: string } | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const prompt = `Sen NaHaber Türkçe haber editörüsün.
${city} için hava durumu haberi yaz.
Sıcaklık: ${temp}°C | Durum: ${condition} | Nem: %${humidity} | Rüzgar: ${windKph} km/s${alertType ? ` | UYARI: ${alertType}` : ''}
JSON: {"title":"...max 70 karakter...","summary":"...1 cümle...","content":"...2-3 paragraf..."}`

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    return JSON.parse(raw) as { title: string; summary: string; content: string }
  } catch {
    return null
  }
}

async function handleRun(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()
  const now = Date.now()
  const results: { city: string; status: string; isBreaking?: boolean }[] = []

  for (const city of TURKISH_WEATHER_CITIES) {
    try {
      const weather = await fetchWeather(city, 1)
      const { location, current } = weather
      const alertType =
        getAlertType(current.condition.code) ??
        getWindAlert(current.wind_kph) ??
        (isExtremeTemperature(current.temp_c)
          ? current.temp_c >= 38 ? 'Aşırı Sıcak' : 'Dondurucu Soğuk'
          : null)
      const isBreaking = !!alertType

      // Rate-limit: skip normal cities if recently updated
      const existingSnap = await db
        .collection('weather_news')
        .where('city', '==', location.name)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get()

      if (!existingSnap.empty) {
        const lastUpdated = existingSnap.docs[0]!.data().createdAt?.toMillis?.() ?? 0
        const interval = isBreaking ? ALERT_UPDATE_INTERVAL_MS : NORMAL_UPDATE_INTERVAL_MS
        if (now - lastUpdated < interval) {
          results.push({ city: location.name, status: 'skipped' })
          continue
        }
      }

      const ai = await generateWeatherArticle(
        location.name,
        current.temp_c,
        current.condition.text,
        current.humidity,
        current.wind_kph,
        alertType
      )

      await db.collection('weather_news').add({
        city: location.name,
        district: location.region,
        country: location.country,
        temperature: current.temp_c,
        humidity: current.humidity,
        windKph: current.wind_kph,
        condition: current.condition.text,
        conditionCode: current.condition.code,
        icon: `https:${current.condition.icon}`,
        title: ai?.title ?? `${location.name}'de bugün ${current.condition.text}`,
        summary: ai?.summary ?? '',
        content: ai?.content ?? '',
        tags: ['hava-durumu', 'meteoroloji', location.name.toLowerCase().replace(/\s+/g, '-')],
        isBreaking,
        alertType,
        createdAt: new Date(now),
      })

      results.push({ city: location.name, status: 'ok', isBreaking })
      await new Promise(r => setTimeout(r, 300))
    } catch (err) {
      results.push({ city, status: 'error' })
      console.error(`[weather-newsroom] ${city}:`, err)
    }
  }

  return NextResponse.json({
    generated: results.filter(r => r.status === 'ok').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'error').length,
    breaking: results.filter(r => r.isBreaking).length,
    results,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = handleRun
export const POST = handleRun
