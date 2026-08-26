import { NextResponse } from 'next/server'
import {
  assertSyntheticAllowed,
  syntheticSimulatorService,
  type SyntheticPersona,
  type SyntheticSimulateInput,
} from '@/services/synthetic/SyntheticSimulatorService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PERSONAS = new Set<SyntheticPersona>([
  'LOCAL_NEWS_READER',
  'SPORTS_READER',
  'TECH_READER',
  'CASUAL_READER',
  'NEW_USER',
])

/** Internal synthetic feed simulator — NEVER available in production. */
export async function POST(request: Request) {
  try {
    assertSyntheticAllowed()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rejected'
    return NextResponse.json({ error: message }, { status: 403 })
  }

  let body: {
    persona?: string
    userId?: string
    actions?: string[]
    articleId?: string
    publisherId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const persona = body.persona as SyntheticPersona
  const userId = body.userId?.trim()
  if (!persona || !PERSONAS.has(persona)) {
    return NextResponse.json({ error: 'Invalid persona' }, { status: 400 })
  }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const result = await syntheticSimulatorService.simulate({
    persona,
    userId,
    actions: body.actions as SyntheticSimulateInput['actions'],
    articleId: body.articleId ?? null,
    publisherId: body.publisherId ?? null,
  })

  return NextResponse.json(result)
}
