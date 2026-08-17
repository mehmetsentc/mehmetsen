import { NextRequest, NextResponse } from 'next/server'
import type { Query, QueryDocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  AI_USAGE_EVENT_SELECT_FIELDS,
  aggregateAiUsageEvents,
  resolveAiUsageRange,
  type LooseAiUsageEvent,
} from '@/lib/ai/usage/aggregate'
import { isAiUsageTelemetryEnabled } from '@/lib/ai/usage/telemetry'
import { getDailyDeepSeekTokenWarning } from '@/lib/ai/usage/budget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PAGE_SIZE = 400
const MAX_DOCS = 10_000

function matchesFilter(event: LooseAiUsageEvent, key: string, value: string | null): boolean {
  if (!value) return true
  const raw = event[key]
  return typeof raw === 'string' && raw === value
}

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rangeInfo = resolveAiUsageRange(request.nextUrl.searchParams.get('range'))
  const agent = request.nextUrl.searchParams.get('agent')?.trim() || null
  const model = request.nextUrl.searchParams.get('model')?.trim() || null
  const provider = request.nextUrl.searchParams.get('provider')?.trim() || null

  try {
    const db = getAdminFirestore()
    const col = db.collection(Collections.AI_USAGE_EVENTS)
    const baseQuery = col
      .where('createdAt', '>=', rangeInfo.startMs)
      .where('createdAt', '<', rangeInfo.endMs)
      .orderBy('createdAt', 'desc')

    let totalInRange: number | null = null
    try {
      const countSnap = await baseQuery.count().get()
      totalInRange = countSnap.data().count
    } catch {
      totalInRange = null
    }

    const events: LooseAiUsageEvent[] = []
    let last: QueryDocumentSnapshot | undefined
    let usedSelect = true
    let scanned = 0

    while (scanned < MAX_DOCS) {
      const remaining = MAX_DOCS - scanned
      let pageQuery: Query = baseQuery.limit(Math.min(PAGE_SIZE, remaining))
      if (usedSelect) {
        pageQuery = pageQuery.select(...AI_USAGE_EVENT_SELECT_FIELDS)
      }
      if (last) pageQuery = pageQuery.startAfter(last)

      let snap: QuerySnapshot
      try {
        snap = await pageQuery.get()
      } catch (err) {
        if (usedSelect) {
          usedSelect = false
          continue
        }
        throw err
      }

      if (snap.empty) break
      scanned += snap.size
      for (const doc of snap.docs) {
        const data = doc.data() as LooseAiUsageEvent
        if (!matchesFilter(data, 'agentName', agent)) continue
        if (!matchesFilter(data, 'model', model)) continue
        if (!matchesFilter(data, 'provider', provider)) continue
        events.push(data)
      }
      last = snap.docs[snap.docs.length - 1]
      if (snap.size < Math.min(PAGE_SIZE, remaining)) break
    }

    const truncated = scanned >= MAX_DOCS || (totalInRange != null && totalInRange > scanned)

    const aggregate = aggregateAiUsageEvents(events, {
      range: rangeInfo.range,
      startMs: rangeInfo.startMs,
      endMs: rangeInfo.endMs,
      timezone: rangeInfo.timezone,
      scanned,
      totalInRange,
      truncated,
    })

    return NextResponse.json({
      ...aggregate,
      pricingConfigured: Boolean(
        process.env.DEEPSEEK_INPUT_COST_PER_1M?.trim() ||
          process.env.DEEPSEEK_OUTPUT_COST_PER_1M?.trim()
      ),
      telemetryEnabled: isAiUsageTelemetryEnabled(),
      deepseekTokenWarningThreshold: getDailyDeepSeekTokenWarning(),
    })
  } catch (error) {
    console.warn('[ai-usage] aggregate failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Usage aggregate failed' }, { status: 500 })
  }
}
