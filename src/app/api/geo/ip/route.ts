import { NextRequest, NextResponse } from 'next/server'
import {
  fuzzyMatchProvinceSlug,
  getCityCategoryName,
  nearestProvinceSlug,
} from '@/constants/cities'

export const runtime = 'edge'

function parseCoord(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

/**
 * GET /api/geo/ip
 * Resolve visitor province from CDN/edge IP headers (Vercel, Cloudflare).
 */
export async function GET(request: NextRequest) {
  const country =
    request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() ||
    request.headers.get('cf-ipcountry')?.trim().toUpperCase() ||
    ''

  if (country && country !== 'TR') {
    return NextResponse.json({ error: 'outside_tr' }, { status: 404 })
  }

  const lat = parseCoord(request.headers.get('x-vercel-ip-latitude'))
  const lng = parseCoord(request.headers.get('x-vercel-ip-longitude'))
  const cityHeader = request.headers.get('x-vercel-ip-city')?.trim()

  if (lat != null && lng != null) {
    const citySlug = nearestProvinceSlug(lat, lng)
    return NextResponse.json({
      citySlug,
      cityName: getCityCategoryName(citySlug),
      lat,
      lng,
      source: 'ip',
    })
  }

  if (cityHeader) {
    const citySlug = fuzzyMatchProvinceSlug(cityHeader)
    if (citySlug) {
      return NextResponse.json({
        citySlug,
        cityName: getCityCategoryName(citySlug),
        lat: null,
        lng: null,
        source: 'ip',
      })
    }
  }

  return NextResponse.json({ error: 'unavailable' }, { status: 404 })
}
