import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { auditCanonicalDraftSourceOverlap } from '@/services/editorial/canonicalDraftSourceOverlapAudit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * P18.4E.2 — Read-only source-overlap audit for a canonical news row.
 * Never mutates rights / blockers / status. Never publishes. No AI.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const audit = await auditCanonicalDraftSourceOverlap({ newsId: id.trim() })

  return NextResponse.json({
    audit,
    rightsMutated: false,
    published: false,
    executePublish: false,
    note: 'Evidence only. LOW_OVERLAP ≠ CLEARED. Human rights decision required.',
  })
}
