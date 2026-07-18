import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TrackBody {
  event?: 'pageview' | 'engagement'
  eventId?: string
  visitorId?: string
  sessionId?: string
  path?: string
  referrer?: string
  postId?: string
  analyticsConsent?: boolean
  language?: string
  timezone?: string
  screen?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  durationMs?: number
  scrollDepth?: number
}

function text(value: unknown, max = 150): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeId(value: unknown): string {
  return text(value, 100).replace(/[^a-zA-Z0-9_-]/g, '')
}

function detectDevice(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet/i.test(ua)) return 'tablet'
  return /mobile|android|iphone/i.test(ua) ? 'mobile' : 'desktop'
}

function detectOS(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows/i.test(ua)) return 'windows'
  if (/mac os x/i.test(ua)) return 'mac'
  if (/linux/i.test(ua)) return 'linux'
  return 'other'
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'edge'
  if (/opr\/|opera/i.test(ua)) return 'opera'
  if (/firefox\//i.test(ua)) return 'firefox'
  if (/crios\//i.test(ua)) return 'chrome-ios'
  if (/chrome\//i.test(ua)) return 'chrome'
  if (/safari\//i.test(ua)) return 'safari'
  return 'other'
}

function extractDomain(referrer: string): string {
  try {
    return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 100)
  } catch {
    return ''
  }
}

function dimensionKey(value: string, fallback = 'unknown'): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/\./g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80) || fallback
}

function sanitizePath(path: string): { key: string; path: string } {
  const cleanPath = (`/${text(path, 500)}`.replace(/^\/+/, '/').split('?')[0] || '/')
    .replace(/\/+/g, '/')
  return {
    path: cleanPath,
    key: cleanPath
      .replace(/^\/+/, '')
      .replace(/\/+/g, '__')
      .replace(/\./g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 120) || 'home',
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    ''
  )
}

/** Raw IP is never stored. This is enough for abuse diagnostics without exact identification. */
function maskIp(ip: string): string {
  if (!ip) return ''
  if (ip.includes('.')) {
    const parts = ip.split('.')
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : ''
  }
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::`
  return ''
}

function privacyHash(value: string): string {
  const salt =
    process.env.ANALYTICS_HASH_SALT ||
    process.env.CRON_SECRET ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    'nahaber-analytics'
  return createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 24)
}

function decodeHeader(value: string | null): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value).slice(0, 100)
  } catch {
    return value.slice(0, 100)
  }
}

async function verifiedUserId(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  try {
    return (await getAdminAuth().verifyIdToken(header.slice(7))).uid
  } catch {
    return null
  }
}

async function parseBody(request: Request): Promise<TrackBody> {
  const raw = await request.text()
  try {
    return JSON.parse(raw) as TrackBody
  } catch {
    return {}
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseBody(request)
    if (body.analyticsConsent !== true) {
      return NextResponse.json({ ok: true, skipped: 'no-consent' })
    }

    const eventId = safeId(body.eventId)
    const sessionId = safeId(body.sessionId)
    if (!eventId || !sessionId) {
      return NextResponse.json({ error: 'eventId/sessionId required' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const eventRef = db.collection(Collections.ANALYTICS_EVENTS).doc(eventId)
    const sessionHash = privacyHash(sessionId)

    if (body.event === 'engagement') {
      const durationMs = Math.max(0, Math.min(Number(body.durationMs) || 0, 30 * 60 * 1000))
      const scrollDepth = Math.max(0, Math.min(Number(body.scrollDepth) || 0, 100))
      await Promise.all([
        eventRef.set({ durationMs, scrollDepth, engagedAt: FieldValue.serverTimestamp() }, { merge: true }),
        db.collection(Collections.ANALYTICS_SESSIONS).doc(sessionHash).set({
          totalEngagementMs: FieldValue.increment(durationMs),
          maxScrollDepth: scrollDepth,
          lastSeenAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
      ])
      return NextResponse.json({ ok: true })
    }

    const ua = request.headers.get('user-agent') ?? ''
    if (/bot|crawler|spider|crawl|slurp|googlebot|bingbot|headless/i.test(ua)) {
      return NextResponse.json({ ok: true, skipped: 'bot' })
    }

    const visitorId = safeId(body.visitorId)
    if (!visitorId) return NextResponse.json({ error: 'visitorId required' }, { status: 400 })

    const { key: pathKey, path } = sanitizePath(body.path ?? '/')
    const referrer = extractDomain(text(body.referrer, 500))
    const device = detectDevice(ua)
    const os = detectOS(ua)
    const browser = detectBrowser(ua)
    const country = text(
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      'unknown',
      2
    ).toUpperCase()
    const city = decodeHeader(request.headers.get('x-vercel-ip-city'))
    const language = text(body.language, 20).toLowerCase() || 'unknown'
    const timezone = text(body.timezone, 80) || 'unknown'
    const utmSource = text(body.utmSource, 100)
    const utmMedium = text(body.utmMedium, 100)
    const utmCampaign = text(body.utmCampaign, 150)
    const source = utmSource || referrer || 'direct'
    const ip = clientIp(request)
    const ipHash = ip ? privacyHash(ip) : ''
    const visitorHash = privacyHash(visitorId)
    const userId = await verifiedUserId(request)
    const today = new Date().toISOString().slice(0, 10)
    const now = FieldValue.serverTimestamp()
    const expiresAt = Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000)
    const dailyRef = db.collection(Collections.ANALYTICS_DAILY).doc(today)
    const sessionRef = db.collection(Collections.ANALYTICS_SESSIONS).doc(sessionHash)
    const uniqueRef = db.collection(Collections.ANALYTICS_UNIQUES).doc(`${today}_${visitorHash}`)

    let isNewVisitor = false
    let isNewSession = false
    await Promise.all([
      uniqueRef.create({ date: today, visitorHash, createdAt: now, expiresAt }).then(() => {
        isNewVisitor = true
      }).catch(() => {}),
      sessionRef.create({
        sessionHash,
        visitorHash,
        userId,
        entryPath: path,
        latestPath: path,
        pageViews: 1,
        country,
        city,
        language,
        device,
        browser,
        source,
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt,
      }).then(() => {
        isNewSession = true
      }).catch(async () => {
        await sessionRef.set({
          latestPath: path,
          pageViews: FieldValue.increment(1),
          ...(userId ? { userId } : {}),
          lastSeenAt: now,
        }, { merge: true })
      }),
    ])

    const dailyUpdate: Record<string, unknown> = {
      total: FieldValue.increment(1),
      [`devices.${dimensionKey(device)}`]: FieldValue.increment(1),
      [`os.${dimensionKey(os)}`]: FieldValue.increment(1),
      [`browsers.${dimensionKey(browser)}`]: FieldValue.increment(1),
      [`countries.${dimensionKey(country)}`]: FieldValue.increment(1),
      [`languages.${dimensionKey(language)}`]: FieldValue.increment(1),
      [`timezones.${dimensionKey(timezone)}`]: FieldValue.increment(1),
      [`pages.${pathKey}`]: FieldValue.increment(1),
      [`sources.${dimensionKey(source)}`]: FieldValue.increment(1),
      [`referrers.${dimensionKey(referrer || 'direct')}`]: FieldValue.increment(1),
      updatedAt: now,
    }
    if (isNewVisitor) dailyUpdate.uniqueVisitors = FieldValue.increment(1)
    if (isNewSession) dailyUpdate.sessions = FieldValue.increment(1)

    // Ensure the daily doc exists, then use update() so dotted keys become nested maps.
    await dailyRef.set({ updatedAt: now }, { merge: true })
    await Promise.all([
      dailyRef.update(dailyUpdate),
      eventRef.create({
        event: 'pageview',
        path,
        postId: safeId(body.postId) || null,
        visitorHash,
        sessionHash,
        userId,
        ipHash,
        maskedIp: maskIp(ip),
        country,
        city,
        language,
        timezone,
        screen: text(body.screen, 30),
        device,
        os,
        browser,
        referrer: referrer || 'direct',
        source,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        createdAt: now,
        expiresAt,
      }).catch(() => {}),
    ])

    // Article lifetime viewsCount is incremented by the article page itself to
    // avoid double-counting when both analytics and the page hook fire.

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[analytics/track]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
