import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /api/health — Uptime & deploy-state probe
 *
 * Yanıt: HTTP 200 + JSON { status, time, version, region }
 *
 * Vercel / UptimeRobot / Better Stack / Pingdom monitor'leri için sabit endpoint.
 * Edge runtime: <50ms p50, hiç dış servise dokunmaz, idempotent.
 *
 * GIT_SHA env / Vercel'in VERCEL_GIT_COMMIT_SHA üzerinden hangi commit'in canlı
 * olduğu görülebilir.
 */
export function GET() {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.GIT_SHA?.slice(0, 7) ||
    'dev'

  const env =
    process.env.VERCEL_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')

  const region = process.env.VERCEL_REGION || 'local'

  return NextResponse.json(
    {
      status: 'ok',
      service: 'nahaber',
      time: new Date().toISOString(),
      version: sha,
      env,
      region,
    },
    {
      status: 200,
      headers: {
        // No CDN caching — monitoring needs fresh hit
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
