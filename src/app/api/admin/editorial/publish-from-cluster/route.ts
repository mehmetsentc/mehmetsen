import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { editorialSupplyService } from '@/services/editorial/editorialSupplyService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const clusterId = typeof body.clusterId === 'string' ? body.clusterId : null

  if (!clusterId) {
    return NextResponse.json({ error: 'clusterId is required' }, { status: 400 })
  }

  try {
    const result = await editorialSupplyService.publishClusterEditorial({
      clusterId,
      actorUserId: auth.uid,
      actorDisplayName: auth.email || 'Admin Editor',
      reviewedAt: new Date(),
      decision: 'APPROVED',
      approvalSource: 'cms_admin_api',
      forceCategory: typeof body.category === 'string' ? body.category : null,
      isBreaking: body.isBreaking === true,
      materialUpdate: body.materialUpdate === true,
      customTitle: typeof body.customTitle === 'string' ? body.customTitle : null,
      customBody: typeof body.customBody === 'string' ? body.customBody : null,
      customImageUrl: typeof body.customImageUrl === 'string' ? body.customImageUrl : null,
    })

    return NextResponse.json({ success: true, result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Editorial publish failed' },
      { status: 400 }
    )
  }
}
