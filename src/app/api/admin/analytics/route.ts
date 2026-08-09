import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { addTurkeyDays, turkeyDayBounds, turkeyYmdNow } from '@/lib/turkeyCalendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Period = 'today' | '7d' | '30d'

interface DailyDoc {
  total?: number
  uniqueVisitors?: number
  sessions?: number
  devices?: Record<string, number>
  os?: Record<string, number>
  browsers?: Record<string, number>
  countries?: Record<string, number>
  languages?: Record<string, number>
  timezones?: Record<string, number>
  sources?: Record<string, number>
  pages?: Record<string, number>
  referrers?: Record<string, number>
}

interface MetricBuckets {
  good?: number
  ni?: number
  poor?: number
  sum?: number
  count?: number
}

interface VitalsDoc {
  path?: string
  FCP?: MetricBuckets
  LCP?: MetricBuckets
  INP?: MetricBuckets
  CLS?: MetricBuckets
  TTFB?: MetricBuckets
}

/** Calendar days in Europe/Istanbul — matches Turkish "Bugün" and daily doc keys. */
function dateRange(period: Period): string[] {
  const days: string[] = []
  const n = period === 'today' ? 1 : period === '7d' ? 7 : 30
  const today = turkeyYmdNow()
  for (let i = n - 1; i >= 0; i--) {
    days.push(addTurkeyDays(today, -i))
  }
  return days
}

function avg(m?: MetricBuckets): number {
  if (!m?.count || !m?.sum) return 0
  return Math.round(m.sum / m.count)
}

function goodPct(m?: MetricBuckets): number {
  const total = (m?.good ?? 0) + (m?.ni ?? 0) + (m?.poor ?? 0)
  return total > 0 ? Math.round(((m?.good ?? 0) / total) * 100) : 0
}

function computeScore(doc: VitalsDoc): number {
  // Eksik metrikleri 0 saymak skoru yapay olarak düşürüyordu
  // (örn. LCP/INP gelmeden çıkan ziyaretlerde FCP iyi olsa bile skor ~20).
  const parts: Array<{ pct: number; weight: number }> = []
  if (doc.LCP) parts.push({ pct: goodPct(doc.LCP), weight: 0.4 })
  if (doc.CLS) parts.push({ pct: goodPct(doc.CLS), weight: 0.25 })
  if (doc.INP) parts.push({ pct: goodPct(doc.INP), weight: 0.2 })
  if (doc.FCP) parts.push({ pct: goodPct(doc.FCP), weight: 0.15 })
  if (parts.length === 0) return 0
  const weightSum = parts.reduce((s, p) => s + p.weight, 0)
  const weighted = parts.reduce((s, p) => s + p.pct * p.weight, 0)
  return Math.round(weighted / weightSum)
}

function restorePath(key: string): string {
  if (key === 'home') return '/'
  const withSlashes = key.includes('__') ? key.replace(/__/g, '/') : key
  return `/${withSlashes}`.replace(/\/+/g, '/')
}

function restoreDomain(key: string): string {
  return key.replace(/_/g, '.')
}

/** GET /api/admin/analytics?period=today|7d|30d */
export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'analytics:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rawPeriod = searchParams.get('period') ?? '7d'
  const period: Period = rawPeriod === 'today' || rawPeriod === '30d' ? rawPeriod : '7d'
  const dates = dateRange(period)

  try {
    const db = getAdminFirestore()

    const periodStart = new Date(turkeyDayBounds(dates[0]).startMs)
    const [usersCountSnap, postsCountSnap, topPostsSnap, recentEventsSnap, recentSessionsSnap, ...dailySnaps] = await Promise.all([
      db.collection('users').count().get().catch(() => null),
      db.collection(Collections.NEWS).where('status', '==', 'published').count().get().catch(() => null),
      db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('viewsCount', 'desc')
        .limit(10)
        .get()
        .catch(() => null),
      db.collection(Collections.ANALYTICS_EVENTS)
        .where('createdAt', '>=', periodStart)
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get()
        .catch(() => null),
      db.collection(Collections.ANALYTICS_SESSIONS)
        .orderBy('lastSeenAt', 'desc')
        .limit(1000)
        .get()
        .catch(() => null),
      ...dates.map((date) => db.collection(Collections.ANALYTICS_DAILY).doc(date).get()),
    ])

    let totalViews = 0
    let uniqueVisitors = 0
    let sessions = 0
    let mobile = 0
    let desktop = 0
    let tablet = 0
    const pageMap = new Map<string, number>()
    const refMap = new Map<string, number>()
    const osMap = new Map<string, number>()
    const browserMap = new Map<string, number>()
    const countryMap = new Map<string, number>()
    const languageMap = new Map<string, number>()
    const timezoneMap = new Map<string, number>()
    const sourceMap = new Map<string, number>()

    const days = dates.map((date, index) => {
      const snap = dailySnaps[index]
      const d = (snap?.exists ? snap.data() : undefined) as DailyDoc | undefined
      const views = d?.total ?? 0
      totalViews += views
      uniqueVisitors += d?.uniqueVisitors ?? 0
      sessions += d?.sessions ?? 0
      mobile += d?.devices?.mobile ?? 0
      desktop += d?.devices?.desktop ?? 0
      tablet += d?.devices?.tablet ?? 0
      Object.entries(d?.pages ?? {}).forEach(([p, n]) => pageMap.set(p, (pageMap.get(p) ?? 0) + n))
      Object.entries(d?.referrers ?? {}).forEach(([r, n]) => refMap.set(r, (refMap.get(r) ?? 0) + n))
      Object.entries(d?.os ?? {}).forEach(([o, n]) => osMap.set(o, (osMap.get(o) ?? 0) + n))
      Object.entries(d?.browsers ?? {}).forEach(([k, n]) => browserMap.set(k, (browserMap.get(k) ?? 0) + n))
      Object.entries(d?.countries ?? {}).forEach(([k, n]) => countryMap.set(k, (countryMap.get(k) ?? 0) + n))
      Object.entries(d?.languages ?? {}).forEach(([k, n]) => languageMap.set(k, (languageMap.get(k) ?? 0) + n))
      Object.entries(d?.timezones ?? {}).forEach(([k, n]) => timezoneMap.set(k, (timezoneMap.get(k) ?? 0) + n))
      Object.entries(d?.sources ?? {}).forEach(([k, n]) => sourceMap.set(k, (sourceMap.get(k) ?? 0) + n))
      return { date, views, visitors: d?.uniqueVisitors ?? 0, sessions: d?.sessions ?? 0 }
    })

    const topPages = [...pageMap.entries()]
      .filter(([p]) => !p.startsWith('admin') && !p.startsWith('/admin') && !p.startsWith('api') && !p.startsWith('/api'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path: restorePath(path), views }))

    const referrers = [...refMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, views]) => ({ domain: restoreDomain(domain) || '(direkt)', views }))

    const topDimensions = (map: Map<string, number>, limit = 10) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
        .map(([label, views]) => ({ label, views }))

    const topPosts = (topPostsSnap?.docs ?? []).map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        title: (data.title as string) ?? '',
        views: (data.viewsCount as number) ?? 0,
        category: data.categoryId as string | undefined,
        slug: data.slug as string | undefined,
      }
    })

    const sessionDocs = (recentSessionsSnap?.docs ?? []).filter((doc) => {
      const lastSeen = doc.data().lastSeenAt?.toDate?.() as Date | undefined
      return lastSeen ? lastSeen >= periodStart : false
    })
    const bouncedSessions = sessionDocs.filter((doc) => Number(doc.data().pageViews ?? 0) <= 1).length
    const bounceRate = sessionDocs.length > 0 ? Math.round((bouncedSessions / sessionDocs.length) * 100) : 0

    const eventDocs = recentEventsSnap?.docs ?? []
    const identifiedUserIds = [...new Set(eventDocs.map((doc) => doc.data().userId as string | null).filter(Boolean))]
      .slice(0, 25) as string[]
    const userSnaps = identifiedUserIds.length
      ? await db.getAll(...identifiedUserIds.map((uid) => db.collection(Collections.USERS).doc(uid)))
      : []
    const userMap = new Map(userSnaps.filter((snap) => snap.exists).map((snap) => {
      const user = snap.data() ?? {}
      return [snap.id, {
        uid: snap.id,
        displayName: String(user.displayName ?? user.name ?? ''),
        username: String(user.username ?? ''),
        email: String(user.email ?? ''),
      }]
    }))
    const recentVisits = eventDocs.slice(0, 100).map((doc) => {
      const event = doc.data()
      const createdAt = event.createdAt?.toDate?.() as Date | undefined
      return {
        id: doc.id,
        path: String(event.path ?? '/'),
        createdAt: createdAt?.toISOString() ?? null,
        country: String(event.country ?? 'unknown'),
        city: String(event.city ?? ''),
        language: String(event.language ?? 'unknown'),
        device: String(event.device ?? 'unknown'),
        os: String(event.os ?? 'unknown'),
        browser: String(event.browser ?? 'unknown'),
        source: String(event.source ?? 'direct'),
        referrer: String(event.referrer ?? 'direct'),
        maskedIp: String(event.maskedIp ?? ''),
        durationMs: Number(event.durationMs ?? 0),
        scrollDepth: Number(event.scrollDepth ?? 0),
        user: event.userId ? userMap.get(String(event.userId)) ?? { uid: String(event.userId) } : null,
      }
    })
    const engagedEvents = recentVisits.filter((visit) => visit.durationMs > 0)
    const averageDurationMs = engagedEvents.length
      ? Math.round(engagedEvents.reduce((sum, visit) => sum + visit.durationMs, 0) / engagedEvents.length)
      : 0
    const averageScrollDepth = engagedEvents.length
      ? Math.round(engagedEvents.reduce((sum, visit) => sum + visit.scrollDepth, 0) / engagedEvents.length)
      : 0

    let vitals: Array<{
      path: string
      score: number
      lcp: number
      fcp: number
      inp: number
      cls: number
      ttfb: number
      samples: number
    }> = []

    try {
      const vitalsSnap = await db.collection(Collections.ANALYTICS_VITALS).limit(50).get()
      vitals = vitalsSnap.docs
        .map((doc) => {
          const v = doc.data() as VitalsDoc
          return {
            path: v.path ?? doc.id,
            score: computeScore(v),
            lcp: avg(v.LCP),
            fcp: avg(v.FCP),
            inp: avg(v.INP),
            cls: avg(v.CLS),
            ttfb: avg(v.TTFB),
            samples: v.LCP?.count ?? v.FCP?.count ?? 0,
          }
        })
        .filter((r) => r.samples > 0)
        .sort((a, b) => b.samples - a.samples)
    } catch {
      /* vitals optional */
    }

    return NextResponse.json({
      period,
      dates,
      totalViews,
      uniqueVisitors,
      sessions,
      bounceRate,
      averageDurationMs,
      averageScrollDepth,
      totalUsers: usersCountSnap?.data().count ?? 0,
      totalPosts: postsCountSnap?.data().count ?? 0,
      days,
      topPages,
      referrers,
      sources: topDimensions(sourceMap),
      countries: topDimensions(countryMap).map((item) => ({ ...item, label: item.label.toUpperCase() })),
      languages: topDimensions(languageMap),
      browsers: topDimensions(browserMap),
      timezones: topDimensions(timezoneMap),
      devices: { mobile, tablet, desktop },
      os: Object.fromEntries(osMap),
      topPosts,
      recentVisits,
      vitals,
      meta: {
        hasDailyDocs: dailySnaps.some((s) => s?.exists),
        deviceRecords: mobile + desktop,
      },
    })
  } catch (err) {
    console.error('[admin/analytics]', err)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
