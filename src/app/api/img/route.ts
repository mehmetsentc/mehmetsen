import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { clampImageWidth, parsePublicImageUrl } from '@/lib/newsImageProxy'

export const runtime = 'nodejs'

const FETCH_TIMEOUT_MS = 8_000
const MAX_BYTES = 6 * 1024 * 1024
const BROWSER_UA =
  'Mozilla/5.0 (compatible; NaHaberImageProxy/1.0; +https://www.nahaber.com)'

function clampQuality(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 58
  return Math.min(70, Math.max(40, Math.round(n)))
}

async function fetchImage(url: URL, redirectsLeft: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const upstream = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8',
        Referer: `${url.origin}/`,
      },
    })
    if (upstream.status >= 300 && upstream.status < 400 && redirectsLeft > 0) {
      const location = upstream.headers.get('location')
      if (!location) return upstream
      const next = parsePublicImageUrl(new URL(location, url).toString())
      if (!next) {
        return new Response(null, { status: 403 })
      }
      return fetchImage(next, redirectsLeft - 1)
    }
    return upstream
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  const parsed = parsePublicImageUrl(target)
  if (!parsed) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  const width = clampImageWidth(Number(searchParams.get('w') || 640))
  const quality = clampQuality(searchParams.get('q'))

  try {
    const upstream = await fetchImage(parsed, 2)
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 })
    }

    const declared = Number(upstream.headers.get('content-length') ?? '0')
    if (declared > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    const type = upstream.headers.get('content-type') || ''
    if (type && !type.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 415 })
    }
    if (type.includes('svg')) {
      return NextResponse.json({ error: 'SVG not allowed' }, { status: 415 })
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    const webp = await sharp(buffer, { limitInputPixels: 24_000_000, failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 3 })
      .toBuffer()

    return new NextResponse(webp, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control':
          'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
        'CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
        Vary: 'Accept',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Resize failed' }, { status: 502 })
  }
}
