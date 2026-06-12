/**
 * GET /api/og-image?url=https://...
 * Returns the og:image URL from an article page via Jina Reader.
 * Used by NewsSlider to lazily load missing article images.
 */
import { NextRequest, NextResponse } from 'next/server'

const CACHE: Record<string, { url: string | null; ts: number }> = {}
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ imageUrl: null }, { status: 400 })
  }

  // In-process cache
  const cached = CACHE[url]
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ imageUrl: cached.url }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  }

  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Timeout': '10',
      },
      signal: AbortSignal.timeout(12_000),
    })

    if (!res.ok) {
      CACHE[url] = { url: null, ts: Date.now() }
      return NextResponse.json({ imageUrl: null })
    }

    const markdown = await res.text()

    // Extract first real image from markdown: ![alt](https://...)
    const match = markdown.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)
    const imageUrl = match?.[1] ?? null
    const filtered =
      imageUrl && !/icon|logo|sprite|placeholder|1x1|pixel|favicon/i.test(imageUrl)
        ? imageUrl
        : null

    CACHE[url] = { url: filtered, ts: Date.now() }

    return NextResponse.json({ imageUrl: filtered }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch {
    CACHE[url] = { url: null, ts: Date.now() }
    return NextResponse.json({ imageUrl: null })
  }
}
