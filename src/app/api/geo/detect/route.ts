/**
 * IP tabanlı şehir tespiti — ip2location.io
 * API key gerektirmez, günlük 500 ücretsiz istek
 * GPS izni reddedildiğinde LocationPermission fallback olarak kullanır
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 3600

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
}

export async function GET(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0] : req.ip ?? '').trim()

  // Localhost'ta çalışmaz
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.')) {
    return NextResponse.json({ error: 'local_ip' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://api.ip2location.io/?ip=${encodeURIComponent(ip)}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`ip2location ${res.status}`)
    const data: Ip2LocationResponse = await res.json()

    const result: GeoDetectResult = {
      ip,
      city:    data.city_name    ?? '',
      region:  data.region_name  ?? '',
      country: data.country_code ?? '',
      lat:     data.latitude      ?? 0,
      lng:     data.longitude     ?? 0,
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, s-maxage=3600' },
    })
  } catch (err) {
    console.error('[geo/detect]', err)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
