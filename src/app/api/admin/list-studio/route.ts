/**
 * LİSTE / TEKNOLOJİ STÜDYOSU — GET /api/admin/list-studio?studio=muzik|teknoloji (son 50 proje)
 *   POST { studio, listType, count, title? } · { copyOf } · { studio: 'teknoloji', fromNewsId } (haberden taslak)
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createList, listLists } from '@/lib/listStudio/listStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const studio = new URL(request.url).searchParams.get('studio') === 'teknoloji' ? 'teknoloji' : 'muzik'
  return json({ lists: await listLists(studio) })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const r = await createList(auth.ctx.uid, body, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ list: r.value }, 201)
}
