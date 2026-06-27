/**
 * GET /api/ai/status
 *
 * Tüm AI agent'larının sağlık durumunu döndürür.
 * Auth: Bearer CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { checkGeminiHealth, isGeminiConfigured } from '@/lib/ai/gemini'
import { checkDeepSeekHealth, isDeepSeekConfigured } from '@/lib/ai/deepseek'
import { checkGptHealth, isGptConfigured } from '@/lib/ai/gpt'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Run health checks in parallel
  const [gemini, deepseek, gpt, queueStats] = await Promise.allSettled([
    checkGeminiHealth(),
    checkDeepSeekHealth(),
    checkGptHealth(),
    getQueueStats(),
  ])

  const resolve = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback

  return NextResponse.json({
    timestamp: Date.now(),
    agents: {
      gemini: {
        id: 'gemini',
        name: 'Gemini 2.5 Flash',
        role: 'Chief News Editor',
        configured: isGeminiConfigured(),
        ...resolve(gemini, { ok: false, latencyMs: 0 }),
      },
      deepseek: {
        id: 'deepseek',
        name: 'DeepSeek V3',
        role: 'News Generator',
        configured: isDeepSeekConfigured(),
        ...resolve(deepseek, { ok: false, latencyMs: 0 }),
      },
      gpt: {
        id: 'gpt',
        name: 'GPT-4o',
        role: 'Senior Editor',
        configured: isGptConfigured(),
        ...resolve(gpt, { ok: false, latencyMs: 0 }),
      },
      // Claude entegrasyonu kodda yok — yanıltıcı "configured" gösterimini
      // kaldırdık. İleride ANTHROPIC_API_KEY ile gerçek bir adapter eklenirse
      // (lib/ai/claude.ts gibi) bu blok geri gelir.
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
