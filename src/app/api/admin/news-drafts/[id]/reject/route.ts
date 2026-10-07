import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { denyIfDocOutsideStaffScope } from '@/lib/cms/staffScopeHttp'
import { newsDraftService } from '@/services/newsDraftService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  // Phase 2: scoped (il/ilçe/kategori) editors may act only inside their scope.
  const admin = await verifyCmsToken(request, 'news:publish', { scopeAware: true })
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const outOfScope = await denyIfDocOutsideStaffScope(admin, 'newsDrafts', id, 'publish')
  if (outOfScope) return outOfScope
  let reason: string | undefined
  try {
    const body = (await request.json()) as { reason?: string }
    reason = body.reason
  } catch {
    // optional body
  }

  try {
    await newsDraftService.rejectDraft(id, reason)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reject failed'
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
