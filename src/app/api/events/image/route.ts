import { NextResponse } from 'next/server'
import { isAllowedEventImageHost } from '@/lib/eventUtils'

/**
 * GET /api/events/image?url=<encoded absolute image URL>
 *
 * Same-origin image proxy for external ticket-platform cover images. It exists
 * so event images load reliably:
 *   - some hosts (e.g. Biletix) use hotlink/Referer protection;
 *   - serving them from our own origin sidesteps next/image domain config.
 *
 * SSRF guard: the target hostname MUST be in the `EVENT_IMAGE_ALLOWED_HOSTS`
 * allowlist (see src/lib/eventUtils.ts). Anything else is rejected — this is NOT
 * an open proxy. Only http(s) image responses are streamed back.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 12_000
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB safety cap
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Per-host Referer so hotlink-protected hosts serve the image. */
function refererFor(hostname: string): string {
  if (hostname.endsWith('biletix.com')) return 'https://www.biletix.com/'
  if (hostname.endsWith('bubilet.com.tr')) return 'https://www.bubilet.com.tr/'
  return `https://${hostname}/`
}

/** Best-effort content-type from extension when upstream omits a usable one. */
function inferContentType(pathname: string, upstream: string | null): string {
  if (upstream && upstream.startsWith('image/')) return upstream
  const ext = pathname.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'avif':
      return 'image/avif'
    case 'webp':
      return 'image/webp'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg'
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 })
  }

  if (!isAllowedEventImageHost(parsed.hostname)) {
    // SSRF guard: do not fetch arbitrary hosts.
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: refererFor(parsed.hostname),
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      },
    })

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      )
    }

    const declaredLength = Number(upstream.headers.get('content-length') ?? '0')
    if (declaredLength && declaredLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    const contentType = inferContentType(
      parsed.pathname,
      upstream.headers.get('content-type')
    )

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache aggressively at the edge/browser; event art rarely changes.
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
