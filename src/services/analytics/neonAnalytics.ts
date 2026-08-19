/**
 * Cost-safe analytics aggregation (Neon). No per-pageview Firebase writes.
 * Production ingest stays off until ANALYTICS_NEON_INGEST_ENABLED=true.
 */

export type AnalyticsEventKind = 'pageview' | 'engagement'

export interface AnalyticsBufferEvent {
  eventId: string
  event: AnalyticsEventKind
  occurredAt: Date
  path: string
  postId: string | null
  visitorHash: string
  sessionHash: string
  referrer: string
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown'
  city: string
  country: string
  durationMs: number
  scrollDepth: number
}

export interface AnalyticsDailyAggregate {
  day: string
  pageviews: number
  uniqueVisitors: number
  sessions: number
  bounceApprox: number
  avgDurationMs: number
  avgScrollDepth: number
  topPages: Array<{ path: string; views: number }>
  topPosts: Array<{ postId: string; views: number }>
  categories: Array<{ key: string; views: number }>
  cities: Array<{ key: string; views: number }>
  referrers: Array<{ key: string; views: number }>
  devices: Array<{ key: string; views: number }>
}

export const ANALYTICS_RETENTION = {
  rawDays: 7,
  hourlyDays: 90,
  dailyDays: 730,
} as const

export function isAnalyticsNeonIngestEnabled(): boolean {
  return process.env.ANALYTICS_NEON_INGEST_ENABLED?.trim().toLowerCase() === 'true'
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function hourKey(d: Date): string {
  return `${dayKey(d)}T${String(d.getUTCHours()).padStart(2, '0')}`
}

function bump(map: Map<string, number>, key: string, n = 1) {
  map.set(key, (map.get(key) || 0) + n)
}

function top(map: Map<string, number>, limit = 10): Array<{ key: string; views: number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, views]) => ({ key, views }))
}

export function aggregateAnalyticsEvents(events: AnalyticsBufferEvent[]): {
  hourly: Array<{ hour: string; pageviews: number; uniqueVisitors: number; sessions: number }>
  daily: AnalyticsDailyAggregate[]
} {
  const hourlyMap = new Map<
    string,
    { pageviews: number; visitors: Set<string>; sessions: Set<string> }
  >()
  const dailyMap = new Map<
    string,
    {
      pageviews: number
      visitors: Set<string>
      sessions: Set<string>
      bouncedSessions: Set<string>
      sessionViews: Map<string, number>
      durationSum: number
      durationCount: number
      scrollSum: number
      scrollCount: number
      pages: Map<string, number>
      posts: Map<string, number>
      cities: Map<string, number>
      referrers: Map<string, number>
      devices: Map<string, number>
    }
  >()

  for (const event of events) {
    if (event.event !== 'pageview' && event.event !== 'engagement') continue
    const day = dayKey(event.occurredAt)
    const hour = hourKey(event.occurredAt)
    if (!hourlyMap.has(hour)) {
      hourlyMap.set(hour, { pageviews: 0, visitors: new Set(), sessions: new Set() })
    }
    if (!dailyMap.has(day)) {
      dailyMap.set(day, {
        pageviews: 0,
        visitors: new Set(),
        sessions: new Set(),
        bouncedSessions: new Set(),
        sessionViews: new Map(),
        durationSum: 0,
        durationCount: 0,
        scrollSum: 0,
        scrollCount: 0,
        pages: new Map(),
        posts: new Map(),
        cities: new Map(),
        referrers: new Map(),
        devices: new Map(),
      })
    }
    const h = hourlyMap.get(hour)!
    const d = dailyMap.get(day)!
    if (event.event === 'pageview') {
      h.pageviews += 1
      h.visitors.add(event.visitorHash)
      h.sessions.add(event.sessionHash)
      d.pageviews += 1
      d.visitors.add(event.visitorHash)
      d.sessions.add(event.sessionHash)
      bump(d.sessionViews, event.sessionHash)
      bump(d.pages, event.path)
      if (event.postId) bump(d.posts, event.postId)
      if (event.city) bump(d.cities, event.city)
      bump(d.referrers, event.referrer || 'direct')
      bump(d.devices, event.device || 'unknown')
    }
    if (event.event === 'engagement') {
      if (event.durationMs > 0) {
        d.durationSum += event.durationMs
        d.durationCount += 1
      }
      if (event.scrollDepth > 0) {
        d.scrollSum += event.scrollDepth
        d.scrollCount += 1
      }
    }
  }

  const hourly = [...hourlyMap.entries()].map(([hour, row]) => ({
    hour,
    pageviews: row.pageviews,
    uniqueVisitors: row.visitors.size,
    sessions: row.sessions.size,
  }))

  const daily: AnalyticsDailyAggregate[] = [...dailyMap.entries()].map(([day, row]) => {
    let bounce = 0
    for (const [session, views] of row.sessionViews) {
      if (views <= 1) {
        bounce += 1
        row.bouncedSessions.add(session)
      }
    }
    return {
      day,
      pageviews: row.pageviews,
      uniqueVisitors: row.visitors.size,
      sessions: row.sessions.size,
      bounceApprox: row.sessions.size ? Number((bounce / row.sessions.size).toFixed(4)) : 0,
      avgDurationMs: row.durationCount ? Math.round(row.durationSum / row.durationCount) : 0,
      avgScrollDepth: row.scrollCount ? Math.round(row.scrollSum / row.scrollCount) : 0,
      topPages: top(row.pages).map((x) => ({ path: x.key, views: x.views })),
      topPosts: top(row.posts).map((x) => ({ postId: x.key, views: x.views })),
      categories: [],
      cities: top(row.cities),
      referrers: top(row.referrers),
      devices: top(row.devices),
    }
  })

  return { hourly, daily }
}

export function mergeDailyAggregates(rows: AnalyticsDailyAggregate[]): Omit<AnalyticsDailyAggregate, 'day'> & { days: number } {
  const empty: AnalyticsDailyAggregate = {
    day: '',
    pageviews: 0,
    uniqueVisitors: 0,
    sessions: 0,
    bounceApprox: 0,
    avgDurationMs: 0,
    avgScrollDepth: 0,
    topPages: [],
    topPosts: [],
    categories: [],
    cities: [],
    referrers: [],
    devices: [],
  }
  const pages = new Map<string, number>()
  const posts = new Map<string, number>()
  const cities = new Map<string, number>()
  const referrers = new Map<string, number>()
  const devices = new Map<string, number>()
  let durationWeighted = 0
  let scrollWeighted = 0
  let bounceWeighted = 0
  for (const row of rows) {
    empty.pageviews += row.pageviews
    empty.uniqueVisitors += row.uniqueVisitors
    empty.sessions += row.sessions
    durationWeighted += row.avgDurationMs * Math.max(row.pageviews, 1)
    scrollWeighted += row.avgScrollDepth * Math.max(row.pageviews, 1)
    bounceWeighted += row.bounceApprox * Math.max(row.sessions, 1)
    for (const p of row.topPages) bump(pages, p.path, p.views)
    for (const p of row.topPosts) bump(posts, p.postId, p.views)
    for (const p of row.cities) bump(cities, p.key, p.views)
    for (const p of row.referrers) bump(referrers, p.key, p.views)
    for (const p of row.devices) bump(devices, p.key, p.views)
  }
  const pv = Math.max(empty.pageviews, 1)
  const sess = Math.max(empty.sessions, 1)
  return {
    days: rows.length,
    pageviews: empty.pageviews,
    uniqueVisitors: empty.uniqueVisitors,
    sessions: empty.sessions,
    bounceApprox: Number((bounceWeighted / sess).toFixed(4)),
    avgDurationMs: Math.round(durationWeighted / pv),
    avgScrollDepth: Math.round(scrollWeighted / pv),
    topPages: top(pages).map((x) => ({ path: x.key, views: x.views })),
    topPosts: top(posts).map((x) => ({ postId: x.key, views: x.views })),
    categories: [],
    cities: top(cities),
    referrers: top(referrers),
    devices: top(devices),
  }
}
