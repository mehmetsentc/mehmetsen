/**
 * GET /api/ai/status
 *
 * AI agent sağlık durumu — sistem artık sadece DeepSeek kullanıyor.
 * Auth: Bearer CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { checkDeepSeekHealth, isDeepSeekConfigured } from '@/lib/ai/deepseek'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [deepseek, queueStats] = await Promise.allSettled([
    checkDeepSeekHealth(),
    getQueueStats(),
  ])

  const resolve = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback

  const health = resolve(deepseek, { ok: false, latencyMs: 0, model: 'deepseek-chat', roles: [] })

  return NextResponse.json({
    timestamp: Date.now(),
    mode: 'deepseek-only',
    agents: {
      deepseek: {
        id: 'deepseek',
        name: `DeepSeek (${health.model})`,
        role: 'Birincil editör (topla + yaz + QA)',
        roleDescriptions: {
          collector: 'Duplicate tespiti + içerik zenginleştirme',
          editor: 'Profesyonel haber yazımı + SEO + sosyal medya',
          qa: 'Kategori doğrulama + kalite denetimi + yayın kararı',
        },
        configured: isDeepSeekConfigured(),
        ...health,
        roles: ['collector', 'editor', 'qa'],
      },
    },
    queue: resolve(queueStats, { pending: 0, processing: 0, done: 0, failed: 0, rejected: 0 }),
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

async function getQueueStats() {
  const db = getAdminFirestore()
  const statuses = ['pending', 'processing', 'done', 'failed', 'rejected'] as const
  const counts = await Promise.all(
    statuses.map(async (s) => {
      const snap = await db.collection(Collections.AI_QUEUE)
        .where('status', '==', s)
        .count()
        .get()
      return [s, snap.data().count] as const
    })
  )
  return Object.fromEntries(counts) as Record<typeof statuses[number], number>
}
