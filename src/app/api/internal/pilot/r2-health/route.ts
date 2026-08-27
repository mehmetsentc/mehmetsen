/**
 * TEMPORARY P11.2R-RUNTIME diagnostic — Production R2 verification from inside Vercel.
 *
 * POST /api/internal/pilot/r2-health
 * Auth: CRON_SECRET / newsroom secret / CMS admin (isNewsroomAuthorized)
 *
 * Returns sanitized statuses only — never env values, keys, or stack traces.
 * Prefer remove after successful verify.
 */
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import {
  buildPublisherContentMediaKey,
  getStorage,
  isR2Configured,
  R2StorageProvider,
} from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const R2_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const

const EXPECTED_BUCKET = 'nahaber-media'
const KNOWN_PUBLIC_HOST = 'pub-a4c9a3e5bd28436199e6e2ac65357c45.r2.dev'
const PILOT_PUBLISHER_ID = 'pub_96b63cdb-7198-4bea-afdf-3c675e6be36d'

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'NOT_RUN'
type Presence = 'CONFIGURED' | 'MISSING'

function presence(name: (typeof R2_KEYS)[number]): Presence {
  return process.env[name]?.trim() ? 'CONFIGURED' : 'MISSING'
}

function publicBaseHost(): string | null {
  const raw = process.env.R2_PUBLIC_URL?.trim()
  if (!raw) return null
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'error'
  return msg
    .replace(/https?:\/\/[^\s"']+/gi, '[url]')
    .replace(/[A-Za-z0-9+/]{20,}={0,2}/g, '[redacted]')
    .slice(0, 80)
}

/** Tiny valid 1x1 JPEG */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBgSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
  'base64'
)

export async function POST(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const runtimeConfig: Record<(typeof R2_KEYS)[number], Presence> = {
    R2_ACCOUNT_ID: presence('R2_ACCOUNT_ID'),
    R2_ACCESS_KEY_ID: presence('R2_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: presence('R2_SECRET_ACCESS_KEY'),
    R2_BUCKET_NAME: presence('R2_BUCKET_NAME'),
    R2_PUBLIC_URL: presence('R2_PUBLIC_URL'),
  }

  const host = publicBaseHost()
  const bucketName = process.env.R2_BUCKET_NAME?.trim() || null
  const bucketMatch = bucketName === EXPECTED_BUCKET
  const publicHostMatch = host === KNOWN_PUBLIC_HOST

  const result: Record<string, unknown> = {
    ok: false,
    phase: 'P11.2R-RUNTIME',
    runtimeConfig,
    publicBaseHost: host,
    publicHostMatch,
    bucketMatch,
    expectedBucket: EXPECTED_BUCKET,
    ops: {
      put: 'NOT_RUN' as Status,
      read: 'NOT_RUN' as Status,
      contentMatch: 'NOT_RUN' as Status,
      publicUrl: 'NOT_RUN' as Status,
      publicFetch: 'NOT_RUN' as Status,
      delete: 'NOT_RUN' as Status,
    },
    publisherMedia: 'SKIP' as Status,
    blocker: null as string | null,
  }

  const anyMissing = Object.values(runtimeConfig).some((v) => v === 'MISSING')
  if (anyMissing) {
    result.blocker = 'R2_RUNTIME_ENV_MISSING'
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  if (!isR2Configured()) {
    result.blocker = 'R2_NOT_CONFIGURED'
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const storage = getStorage()
  if (storage.name !== 'r2') {
    result.blocker = 'STORAGE_NOT_R2'
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const r2 = storage as R2StorageProvider
  const ops = result.ops as Record<string, Status>
  const probeId = randomUUID()
  const key = `internal-test/p11-2r-runtime/${probeId}.txt`
  const body = Buffer.from(`p11-2r-runtime-probe:${probeId}`, 'utf8')

  try {
    await r2.upload(key, body, { contentType: 'text/plain; charset=utf-8' })
    ops.put = 'PASS'
  } catch (err) {
    ops.put = 'FAIL'
    result.blocker = `PUT:${sanitizeError(err)}`
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  try {
    const downloaded = await r2.download(key)
    ops.read = 'PASS'
    const match =
      downloaded.length === body.length &&
      downloaded.every((b, i) => b === body[i])
    ops.contentMatch = match ? 'PASS' : 'FAIL'
    if (!match) result.blocker = 'CONTENT_MISMATCH'
  } catch (err) {
    ops.read = 'FAIL'
    ops.contentMatch = 'FAIL'
    result.blocker = `READ:${sanitizeError(err)}`
  }

  let publicUrl: string | null = null
  try {
    publicUrl = r2.getPublicUrl(key)
    let urlHost: string | null = null
    try {
      urlHost = new URL(publicUrl).hostname
    } catch {
      urlHost = null
    }
    ops.publicUrl =
      publicUrl.startsWith('https://') && urlHost === KNOWN_PUBLIC_HOST ? 'PASS' : 'FAIL'
    if (ops.publicUrl === 'FAIL' && !result.blocker) {
      result.blocker = urlHost
        ? `PUBLIC_URL_HOST_MISMATCH:${urlHost}`
        : 'PUBLIC_URL_INVALID'
    }
  } catch (err) {
    ops.publicUrl = 'FAIL'
    if (!result.blocker) result.blocker = `PUBLIC_URL:${sanitizeError(err)}`
  }

  if (publicUrl && ops.publicUrl === 'PASS') {
    try {
      const res = await fetch(publicUrl, { method: 'GET', cache: 'no-store' })
      if (res.status === 200) {
        const text = await res.text()
        ops.publicFetch = text === body.toString('utf8') ? 'PASS' : 'FAIL'
        if (ops.publicFetch === 'FAIL' && !result.blocker) {
          result.blocker = 'PUBLIC_FETCH_CONTENT_MISMATCH'
        }
      } else {
        ops.publicFetch = 'FAIL'
        if (!result.blocker) result.blocker = `PUBLIC_FETCH_HTTP_${res.status}`
      }
    } catch (err) {
      ops.publicFetch = 'FAIL'
      if (!result.blocker) result.blocker = `PUBLIC_FETCH:${sanitizeError(err)}`
    }
  } else if (ops.publicUrl === 'FAIL') {
    ops.publicFetch = 'SKIP'
  }

  try {
    await r2.delete(key)
    const stillThere = await r2.exists(key)
    ops.delete = stillThere ? 'FAIL' : 'PASS'
    if (ops.delete === 'FAIL' && !result.blocker) result.blocker = 'DELETE_OBJECT_REMAINS'
  } catch (err) {
    ops.delete = 'FAIL'
    if (!result.blocker) result.blocker = `DELETE:${sanitizeError(err)}`
  }

  const corePass =
    ops.put === 'PASS' &&
    ops.read === 'PASS' &&
    ops.contentMatch === 'PASS' &&
    ops.publicUrl === 'PASS' &&
    ops.publicFetch === 'PASS' &&
    ops.delete === 'PASS' &&
    bucketMatch === true

  if (corePass) {
    // Optional INTERNAL_TEST media path (same storage used by publisher media routes)
    const mediaKey = buildPublisherContentMediaKey(
      PILOT_PUBLISHER_ID,
      'p11-2r-runtime',
      `${probeId}.jpg`
    )
    try {
      const uploaded = await r2.upload(mediaKey, TINY_JPEG, { contentType: 'image/jpeg' })
      const mediaUrl = uploaded.url || r2.getPublicUrl(mediaKey)
      const mediaOk = Boolean(mediaUrl?.startsWith('https://'))
      try {
        await r2.delete(mediaKey)
      } catch {
        /* best-effort cleanup */
      }
      result.publisherMedia = mediaOk ? 'PASS' : 'FAIL'
      if (!mediaOk && !result.blocker) result.blocker = 'PUBLISHER_MEDIA_FAIL'
    } catch (err) {
      result.publisherMedia = 'FAIL'
      if (!result.blocker) result.blocker = `PUBLISHER_MEDIA:${sanitizeError(err)}`
    }
  } else {
    result.publisherMedia = 'SKIP'
  }

  result.ok =
    corePass &&
    (result.publisherMedia === 'PASS' || result.publisherMedia === 'SKIP') &&
    !result.blocker

  if (result.ok) result.blocker = null

  return NextResponse.json(result, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** Reject anonymous probes */
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
