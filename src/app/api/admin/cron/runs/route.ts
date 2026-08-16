/**
 * GET /api/admin/cron/runs — CMS cron monitor (Admin SDK; bypasses client rules).
 * ?cleanupStuck=1 → running > 10 dk kayıtlarını failed yap.
 * ?pendingDetails=1 → kuyruk bekleyen listesi (opsiyonel; hata olsa bile runs döner).
 */
import { NextResponse } from 'next/server'
import { FieldPath } from 'firebase-admin/firestore'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STUCK_MS = 10 * 60 * 1000

function toEpochMs(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Date.parse(v)
    return Number.isFinite(n) ? n : null
  }
  if (
    typeof v === 'object' &&
    v !== null &&
    'toMillis' in v &&
    typeof (v as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      const n = (v as { toMillis: () => number }).toMillis()
      return Number.isFinite(n) ? n : null
    } catch {
      return null
    }
  }
  return null
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getAdminFirestore()
    const url = new URL(request.url)
    const cleanup = url.searchParams.get('cleanupStuck') === '1'
    const job = url.searchParams.get('job')?.trim()

    if (cleanup) {
      const snap = await db
        .collection('cronRuns')
        .where('status', '==', 'running')
        .limit(100)
        .get()
      const now = Date.now()
      let cleaned = 0
      const batch = db.batch()
      for (const doc of snap.docs) {
        const startedAt = Number(doc.data().startedAt) || 0
        if (startedAt && now - startedAt < STUCK_MS) continue
        batch.update(doc.ref, {
          status: 'failed',
          finishedAt: now,
          durationMs: startedAt ? now - startedAt : null,
          error: 'Stuck running — timed out / process killed',
        })
        cleaned += 1
      }
      if (cleaned > 0) await batch.commit()
      return NextResponse.json({ cleaned })
    }

    const wantPendingDetails = url.searchParams.get('pendingDetails') === '1'
    const pendingOffset = Math.max(0, parseInt(url.searchParams.get('pendingOffset') ?? '0', 10) || 0)
    const pendingLimit = Math.min(
      parseInt(url.searchParams.get('pendingLimit') ?? '100', 10) || 100,
      100
    )
    const pendingSource = url.searchParams.get('pendingSource')?.trim() || ''
    const pendingDupOnly = url.searchParams.get('pendingDupOnly') === '1'

    const runsQuery = job
      ? db
          .collection('cronRuns')
          .where('jobName', '==', job)
          .orderBy('startedAt', 'desc')
          .limit(50)
      : db.collection('cronRuns').orderBy('startedAt', 'desc').limit(100)

    const countQuery = db.collection('newsQueue').where('status', '==', 'pending').count()

    const [snap, countSnap] = await Promise.all([runsQuery.get(), countQuery.get()])

    const runs = snap.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        jobName: data.jobName as string,
        status: data.status as string,
        startedAt: toEpochMs(data.startedAt) ?? data.startedAt ?? null,
        finishedAt: toEpochMs(data.finishedAt),
        durationMs:
          typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)
            ? data.durationMs
            : null,
        itemsProcessed:
          typeof data.itemsProcessed === 'number' ? data.itemsProcessed : null,
        error: typeof data.error === 'string' ? data.error.slice(0, 500) : null,
        triggeredBy: data.triggeredBy ?? 'schedule',
        result: typeof data.result === 'string' ? data.result.slice(0, 400) : null,
      }
    })

    const queuePending = countSnap.data().count

    let pendingItems:
      | Array<{
          id: string
          title: string
          source: string
          workerId: string
          category: string | null
          createdAt: number
          attempts: number
          queueDuplicateSuspect?: boolean
          queueDuplicateRole?: string | null
          queueDuplicateOf?: string | null
          queueDuplicateSimilarity?: number | null
          qualityScore?: number | null
          peerQualityScore?: number | null
        }>
      | undefined
    let pendingError: string | undefined
    let sourceCounts: Array<{ label: string; count: number }> | undefined
    let pendingFilteredCount: number | undefined
    let dupCount: number | undefined

    if (wantPendingDetails) {
      try {
        const pendingCol = db.collection('newsQueue').where('status', '==', 'pending')
        let indexSnap
        try {
          indexSnap = await pendingCol
            .select(
              new FieldPath('input', 'sourceLabel'),
              'sourceId',
              'createdAt',
              'queueDuplicateSuspect',
            )
            .get()
        } catch {
          indexSnap = await pendingCol
            .select('sourceId', 'createdAt', 'queueDuplicateSuspect')
            .get()
        }

        const index = indexSnap.docs.map((d) => {
          const data = d.data() as {
            input?: { sourceLabel?: unknown }
            sourceId?: unknown
            createdAt?: unknown
            queueDuplicateSuspect?: unknown
          }
          const label =
            String(data.input?.sourceLabel ?? '').trim() ||
            String(data.sourceId ?? '').trim() ||
            'Kaynaksız'
          return {
            id: d.id,
            source: label,
            dup: data.queueDuplicateSuspect === true,
            createdAt: toEpochMs(data.createdAt) ?? 0,
          }
        })

        dupCount = index.filter((row) => row.dup).length
        const countBase = pendingDupOnly ? index.filter((row) => row.dup) : index
        const counts = new Map<string, number>()
        for (const row of countBase) {
          counts.set(row.source, (counts.get(row.source) ?? 0) + 1)
        }
        sourceCounts = Array.from(counts.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'))

        let filtered = pendingDupOnly ? index.filter((row) => row.dup) : index
        if (pendingSource) {
          filtered = filtered.filter((row) => row.source === pendingSource)
        }
        filtered.sort((a, b) => b.createdAt - a.createdAt)
        pendingFilteredCount = filtered.length
        const pageIds = filtered.slice(pendingOffset, pendingOffset + pendingLimit).map((row) => row.id)

        if (pageIds.length > 0) {
          const docs = []
          for (let i = 0; i < pageIds.length; i += 80) {
            const chunk = pageIds.slice(i, i + 80)
            const refs = chunk.map((id) => db.collection('newsQueue').doc(id))
            docs.push(...(await db.getAll(...refs)))
          }
          const byId = new Map(docs.filter((doc) => doc.exists).map((doc) => [doc.id, doc]))
          pendingItems = pageIds.flatMap((id) => {
            const d = byId.get(id)
            if (!d) return []
            const data = d.data() ?? {}
            const input = (data.input ?? {}) as Record<string, unknown>
            return [{
              id: d.id,
              title: String((input.originalTitle as string) ?? '(başlıksız)').slice(0, 300),
              source: (
                String((input.sourceLabel as string) ?? '').trim() ||
                String((data.sourceId as string) ?? '').trim()
              ).slice(0, 120),
              workerId: String((data.workerId as string) ?? ''),
              category: (input.forcedCategoryId as string) ?? null,
              createdAt: toEpochMs(data.createdAt) ?? 0,
              attempts: (data.attempts as number) ?? 0,
              queueDuplicateSuspect: data.queueDuplicateSuspect === true,
              queueDuplicateRole: (data.queueDuplicateRole as string) ?? null,
              queueDuplicateOf: (data.queueDuplicateOf as string) ?? null,
              queueDuplicateSimilarity:
                typeof data.queueDuplicateSimilarity === 'number'
                  ? data.queueDuplicateSimilarity
                  : null,
              qualityScore: typeof data.qualityScore === 'number' ? data.qualityScore : null,
              peerQualityScore:
                typeof data.peerQualityScore === 'number' ? data.peerQualityScore : null,
            }]
          })
        } else {
          pendingItems = []
        }
      } catch (pendingErr) {
        pendingError =
          pendingErr instanceof Error ? pendingErr.message : String(pendingErr)
      }
    }

    return NextResponse.json({
      runs,
      queuePending,
      ...(pendingItems ? { pendingItems } : {}),
      ...(pendingError ? { pendingError } : {}),
      ...(sourceCounts ? { sourceCounts } : {}),
      ...(pendingFilteredCount != null ? { pendingFilteredCount } : {}),
      ...(dupCount != null ? { dupCount } : {}),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
