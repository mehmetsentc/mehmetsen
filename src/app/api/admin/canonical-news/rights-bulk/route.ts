import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  isNewsRightsBasis,
  isNewsRightsStatus,
  recordNewsRightsDecision,
} from '@/services/editorial/newsRightsDecision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Bounded bulk rights decisions. Never publishes.
 * Partial failures are reported per id.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    ids?: string[]
    status?: string
    basis?: string
    editorialBlocker?: string | null
  } | null

  const ids = Array.isArray(body?.ids)
    ? [...new Set(body!.ids!.map((id) => String(id).trim()).filter(Boolean))].slice(0, 50)
    : []
  if (!ids.length) {
    return NextResponse.json({ error: 'ids required (max 50)' }, { status: 400 })
  }

  if (!body || !isNewsRightsStatus(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const status = body.status
  const basis =
    status === 'PENDING'
      ? 'UNKNOWN'
      : isNewsRightsBasis(body.basis) && body.basis !== 'UNKNOWN'
        ? body.basis
        : 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION'

  const results: Array<{ id: string; ok: boolean; skipped?: boolean; error?: string }> = []

  for (const id of ids) {
    try {
      await recordNewsRightsDecision({
        newsId: id,
        actorUid: auth.uid,
        status,
        basis,
        refuseClearWhenBlocked: true,
        editorialBlocker:
          status === 'REWRITE_REQUIRED' && body.editorialBlocker !== undefined
            ? body.editorialBlocker
            : undefined,
      })
      results.push({ id, ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed'
      const skipped =
        /already_published|refuse_rights|blocker|CLEARED/i.test(msg)
      results.push({ id, ok: false, skipped, error: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    publishes: 0,
    note: 'Bulk rights decision never publishes',
    summary: {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => !r.ok && !r.skipped).length,
    },
    results,
  })
}
