import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Period = 'today' | '7d' | '30d'

interface DailyDoc {
  total?: number
  devices?: Record<string, number>
  os?: Record<string, number>
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

function dateRange(period: Period): string[] {
  const days: string[] = []
  const n = period === 'today' ? 1 : period === '7d' ? 7 : 30
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    days.push(d.toISOString().slice(0, 10))
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
  const lcpPct = goodPct(doc.LCP)
  const clsPct = goodPct(doc.CLS)
  const inpPct = goodPct(doc.INP)
  const fcpPct = goodPct(doc.FCP)
  const count = [doc.LCP, doc.CLS, doc.INP, doc.FCP].filter(Boolean).length
  if (count === 0) return 0
  return Math.round(lcpPct * 0.4 + clsPct * 0.2 + inpPct * 0.2 + fcpPct * 0.2)
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

    const [usersCountSnap, postsCountSnap, topPostsSnap, ...dailySnaps] = await Promise.all([
      db.collection('users').count().get().catch(() => null),
      db.collection(Collections.NEWS).where('status', '==', 'published').count().get().catch(() => null),
      db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('viewsCount', 'desc')
        .limit(10)
        .get()
        .catch(() => null),
      ...dates.map((date) => db.collection(Collections.ANALYTICS_DAILY).doc(date).get()),
    ])

    let totalViews = 0
    let mobile = 0
    let desktop = 0
    const pageMap = new Map<string, number>()
    const refMap = new Map<string, number>()
    const osMap = new Map<string, number>()

    const days = dates.map((date, index) => {
      const snap = dailySnaps[index]
      const d = (snap?.exists ? snap.data() : undefined) as DailyDoc | undefined
      const views = d?.total ?? 0
      totalViews += views
      mobile += d?.devices?.mobile ?? 0
      desktop += d?.devices?.desktop ?? 0
      Object.entries(d?.pages ?? {}).forEach(([p, n]) => pageMap.set(p, (pageMap.get(p) ?? 0) + n))
      Object.entries(d?.referrers ?? {}).forEach(([r, n]) => refMap.set(r, (refMap.get(r) ?? 0) + n))
      Object.entries(d?.os ?? {}).forEach(([o, n]) => osMap.set(o, (osMap.get(o) ?? 0) + n))
      return { date, views }
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
      totalUsers: usersCountSnap?.data().count ?? 0,
      totalPosts: postsCountSnap?.data().count ?? 0,
      days,
      topPages,
      referrers,
      devices: { mobile, desktop },
      os: Object.fromEntries(osMap),
      topPosts,
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
