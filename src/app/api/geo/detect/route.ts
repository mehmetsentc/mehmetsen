/**
 * IP tabanlı şehir tespiti.
 * Öncelik: Vercel/CDN geo header → ip2location (gerçek client IP).
 * Not: ip2location çoğu TR konut IP’sini İstanbul’a map’ler; CDN header daha doğru.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  fuzzyMatchProvinceSlug,
  getCityCategoryName,
  nearestProvinceSlug,
  TURKISH_PROVINCES,
} from '@/constants/cities'

export const runtime = 'edge'

interface Ip2LocationResponse {
  ip: string
  country_code: string
  country_name: string
  region_name: string
  city_name: string
  latitude: number
  longitude: number
}

export interface GeoDetectResult {
  ip: string
  city: string
  region: string
  country: string
  lat: number
  lng: number
  citySlug?: string
  cityName?: string
  source: 'vercel' | 'cloudflare' | 'ip2location'
}

function parseCoord(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function isPrivateIp(ip: string): boolean {
  return (
    !ip ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  )
}

/** Client IP — Vercel’de x-real-ip / x-vercel-forwarded-for güvenilir. */
function resolveClientIp(req: NextRequest): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real && !isPrivateIp(real)) return real

  const vercelFwd = req.headers.get('x-vercel-forwarded-for')?.trim()
  if (vercelFwd) {
    const first = vercelFwd.split(',')[0]?.trim()
    if (first && !isPrivateIp(first)) return first
  }

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    for (const part of forwarded.split(',')) {
      const candidate = part.trim()
      if (candidate && !isPrivateIp(candidate)) return candidate
    }
  }

  return ''
}

export async function GET(req: NextRequest) {
  const vercelLat = parseCoord(req.headers.get('x-vercel-ip-latitude'))
  const vercelLng = parseCoord(req.headers.get('x-vercel-ip-longitude'))
  const vercelCity = req.headers.get('x-vercel-ip-city')?.trim() || ''
  const vercelRegion = req.headers.get('x-vercel-ip-country-region')?.trim() || ''
  const vercelCountry =
    req.headers.get('x-vercel-ip-country')?.trim().toUpperCase() ||
    req.headers.get('cf-ipcountry')?.trim().toUpperCase() ||
    ''

  // 1) Vercel edge geo (gerçek ziyaretçi IP’sinden)
  if (vercelLat != null && vercelLng != null) {
    const citySlug = nearestProvinceSlug(vercelLat, vercelLng)
    const result: GeoDetectResult = {
      ip: resolveClientIp(req) || 'vercel',
      city: vercelCity ? decodeURIComponent(vercelCity) : getCityCategoryName(citySlug),
      region: vercelRegion,
      country: vercelCountry || 'TR',
      lat: vercelLat,
      lng: vercelLng,
      citySlug,
      cityName: getCityCategoryName(citySlug),
      source: 'vercel',
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  if (vercelCity) {
    const citySlug = fuzzyMatchProvinceSlug(decodeURIComponent(vercelCity))
    if (citySlug) {
      const p = TURKISH_PROVINCES.find((x) => x.slug === citySlug)
      if (p) {
        const result: GeoDetectResult = {
          ip: resolveClientIp(req) || 'vercel',
          city: p.name,
          region: vercelRegion,
          country: vercelCountry || 'TR',
          lat: p.lat,
          lng: p.lng,
          citySlug: p.slug,
          cityName: p.name,
          source: 'vercel',
        }
        return NextResponse.json(result, {
          headers: { 'Cache-Control': 'private, no-store' },
        })
      }
    }
  }

  const ip = resolveClientIp(req)
  if (isPrivateIp(ip)) {
    return NextResponse.json({ error: 'local_ip' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://api.ip2location.io/?ip=${encodeURIComponent(ip)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`ip2location ${res.status}`)
    const data: Ip2LocationResponse = await res.json()
    const lat = data.latitude ?? 0
    const lng = data.longitude ?? 0
    if (!lat && !lng) {
      return NextResponse.json({ error: 'no_coords' }, { status: 404 })
    }
    const citySlug = nearestProvinceSlug(lat, lng)
    const result: GeoDetectResult = {
      ip,
      city: data.city_name ?? '',
      region: data.region_name ?? '',
      country: data.country_code ?? '',
      lat,
      lng,
      citySlug,
      cityName: getCityCategoryName(citySlug),
      source: 'ip2location',
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('[geo/detect]', err)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
