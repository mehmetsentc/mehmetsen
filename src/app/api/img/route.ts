import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { clampImageWidth, parsePublicImageUrl } from '@/lib/newsImageProxy'

export const runtime = 'nodejs'

const FETCH_TIMEOUT_MS = 8_000
/** Publisher originals above 6 MB were 413'd and the card went blank. sharp's pixel
 *  limit (24 MP) still bounds memory; the resized WebP is then CDN-cached for a week. */
const MAX_BYTES = 15 * 1024 * 1024
/** Failures are cached at the CDN too, so a dead or oversized image does not
 *  re-invoke the function (and re-download the original) on every view. */
const ERROR_CACHE = {
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
  'CDN-Cache-Control': 'public, s-maxage=3600',
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: ERROR_CACHE })
}

/** Too large to resize here: let the browser load the original instead of a blank card. */
function redirectToOriginal(url: URL) {
  return NextResponse.redirect(url.toString(), { status: 307, headers: ERROR_CACHE })
}
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
      return fail(`Upstream ${upstream.status}`, 502)
    }

    const declared = Number(upstream.headers.get('content-length') ?? '0')
    if (declared > MAX_BYTES) {
      return redirectToOriginal(parsed)
    }

    const type = upstream.headers.get('content-type') || ''
    if (type && !type.startsWith('image/')) {
      return fail('Not an image', 415)
    }
    if (type.includes('svg')) {
      return fail('SVG not allowed', 415)
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      return redirectToOriginal(parsed)
    }

    const webp = await sharp(buffer, { limitInputPixels: 24_000_000, failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 3 })
      .toBuffer()

    return new NextResponse(new Uint8Array(webp), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control':
          'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
        'CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
        // No `Vary: Accept`: the output is always WebP, and varying on Accept split the
        // CDN copy per browser.
      },
    })
  } catch {
    return fail('Resize failed', 502)
  }
}
