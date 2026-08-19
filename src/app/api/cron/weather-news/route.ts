import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { fetchWeather, TURKISH_WEATHER_CITIES, getAlertType, isExtremeTemperature, getWindAlert } from '@/lib/weatherApi'
import type { WeatherData } from '@/types/weather'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'

/**
 * POST/GET /api/cron/weather-news
 *
 * Hourly cron: fetch weather for major Turkish cities → OpenAI article → Firestore.
 * Protected by CRON_SECRET.
 *
 * vercel.json entry:
 *   { "path": "/api/cron/weather-news", "schedule": "0 * * * *" }
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()
  const secret = process.env.CRON_SECRET?.trim()
  return !!secret && token === secret
}

async function generateWeatherNews(weather: WeatherData): Promise<{
  title: string
  summary: string
  content: string
  seoTitle: string
  seoDescription: string
  socialDescription: string
  isBreaking: boolean
  alertType: string | null
} | null> {
  const { isLegacyDirectAiEnabled } = await import('@/services/crawler/legacyFlags')
  if (!isLegacyDirectAiEnabled()) return null
  const openaiKey = process.env.DEEPSEEK_API_KEY
  if (!openaiKey) {
    console.warn('[weather-news] DEEPSEEK_API_KEY not set, skipping AI generation')
    return null
  }

  const { location, current } = weather
  const cityTr = location.name
  const tempC = current.temp_c
  const condition = current.condition.text
  const humidity = current.humidity
  const windKph = current.wind_kph

  const alertType = getAlertType(current.condition.code) ?? getWindAlert(windKph) ?? (isExtremeTemperature(tempC) ? (tempC >= 38 ? 'Aşırı Sıcak' : 'Dondurucu Soğuk') : null)
  const isBreaking = !!alertType

  const prompt = `Sen Türkçe bir haber editörüsün. Aşağıdaki hava durumu verisine göre kısa bir haber yaz.

Şehir: ${cityTr}
Sıcaklık: ${tempC}°C
Durum: ${condition}
Nem: ${humidity}%
Rüzgar: ${windKph} km/s
${alertType ? `Uyarı: ${alertType}` : ''}

Şunları JSON formatında üret:
- title: Çarpıcı, kısa bir Türkçe haber başlığı (max 80 karakter)
- summary: 1-2 cümle özet
- content: 2-3 paragraf haber içeriği (Meteoroloji verileri kullan, somut bilgi ver)
- seoTitle: SEO başlığı (max 60 karakter)
- seoDescription: Meta açıklama (max 155 karakter)
- socialDescription: Sosyal medya paylaşım metni (max 200 karakter)

Sadece JSON döndür, açıklama ekleme.`

  const startedAt = Date.now()
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash',
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      recordDirectDeepSeekObservation({
        agentName: 'weather',
        operation: 'generate_weather_news',
        promptVersion: 'weather-news:v1',
        startedAt,
        success: false,
        statusCode: res.status,
      })
      console.error('[weather-news] OpenAI error', res.status, await res.text())
      return null
    }

    const json = await res.json()
    const raw = json.choices?.[0]?.message?.content
    recordDirectDeepSeekObservation({
      agentName: 'weather',
      operation: 'generate_weather_news',
      promptVersion: 'weather-news:v1',
      startedAt,
      success: Boolean(raw),
      statusCode: 200,
      body: json,
      errorMessage: raw ? undefined : 'empty_content',
    })
    const parsed = JSON.parse(raw ?? '{}')

    return {
      title: parsed.title ?? `${cityTr}'de bugün hava ${condition}`,
      summary: parsed.summary ?? '',
      content: parsed.content ?? '',
      seoTitle: parsed.seoTitle ?? parsed.title ?? '',
      seoDescription: parsed.seoDescription ?? parsed.summary ?? '',
      socialDescription: parsed.socialDescription ?? parsed.summary ?? '',
      isBreaking,
      alertType,
    }
  } catch (err) {
    recordDirectDeepSeekObservation({
      agentName: 'weather',
      operation: 'generate_weather_news',
      promptVersion: 'weather-news:v1',
      startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : 'weather_parse_error',
    })
    console.error('[weather-news] OpenAI parse error', err)
    return null
  }
}

export async function GET(req: NextRequest) {
  return handler(req)
}
export async function POST(req: NextRequest) {
  return handler(req)
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()
  const now = new Date()
  const results: { city: string; status: string; isBreaking?: boolean }[] = []

  // Process cities sequentially to avoid rate limiting
  for (const city of TURKISH_WEATHER_CITIES) {
    try {
      const weather = await fetchWeather(city, 1)
      const aiContent = await generateWeatherNews(weather)

      const { location, current } = weather
      const alertType = getAlertType(current.condition.code) ?? getWindAlert(current.wind_kph) ?? null
      const isBreaking = !!alertType || isExtremeTemperature(current.temp_c)

      const doc = {
        city: location.name,
        district: location.region,
        country: location.country,
        temperature: current.temp_c,
        humidity: current.humidity,
        windKph: current.wind_kph,
        condition: current.condition.text,
        conditionCode: current.condition.code,
        icon: `https:${current.condition.icon}`,
        title: aiContent?.title ?? `${location.name}'de hava durumu`,
        summary: aiContent?.summary ?? '',
        content: aiContent?.content ?? '',
        tags: ['hava-durumu', 'meteoroloji', location.name.toLowerCase().replace(/\s+/g, '-')],
        seoTitle: aiContent?.seoTitle ?? '',
        seoDescription: aiContent?.seoDescription ?? '',
        socialDescription: aiContent?.socialDescription ?? '',
        isBreaking: aiContent?.isBreaking ?? isBreaking,
        alertType: aiContent?.alertType ?? alertType,
        publishedAt: now,
        createdAt: now,
      }

      await db.collection('weather_news').add(doc)
      results.push({ city: location.name, status: 'ok', isBreaking: doc.isBreaking })

      // Small delay to avoid WeatherAPI rate limit
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`[weather-news] Failed for ${city}:`, err)
      results.push({ city, status: 'error' })
    }
  }

  return NextResponse.json({
    success: true,
    generated: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    breaking: results.filter(r => r.isBreaking).length,
    results,
  })
}
