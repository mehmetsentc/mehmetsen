/**
 * GET /api/admin/news/scoped?view=all|published|draft|pending|removed&before=<ms>
 * Phase 2: the scoped editor's own slice (province AND district AND category).
 * Unscoped staff keep the existing client list and get 400 here.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isScopeRestricted } from '@/lib/cms/rbacScope'
import { listScopedAdminNews, SCOPED_NEWS_VIEWS, type ScopedNewsView } from '@/lib/cms/scopedAdminDocs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read', { scopeAware: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isScopeRestricted(auth.scope)) {
    return NextResponse.json({ error: 'Only for scoped editors' }, { status: 400 })
  }
  if (auth.scope.kind === 'invalid') {
    return NextResponse.json({ error: 'Yetki kapsamı geçersiz', code: 'STAFF_SCOPE_FORBIDDEN' }, { status: 403 })
  }
  const params = new URL(request.url).searchParams
  const view = (params.get('view') || 'all') as ScopedNewsView
  if (!SCOPED_NEWS_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  const beforeRaw = Number(params.get('before'))
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : null
  try {
    return NextResponse.json(await listScopedAdminNews(auth.scope, view, before))
  } catch (err) {
    console.error('[admin/news/scoped]', err)
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }
}
