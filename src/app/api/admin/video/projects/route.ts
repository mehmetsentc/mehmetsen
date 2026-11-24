/**
 * KURGU — GET  /api/admin/video/projects   — recent edit projects (Video Merkezi «Projeler»)
 *         POST /api/admin/video/projects   — { title?, aspect? } blank project
 *                                            or { fromNewsVideo: newsId } — a news item's own video
 * Central social-account managers only; same-origin for changes.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createEditProject, editProjectForNewsVideo, listEditProjects } from '@/lib/edit/editStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ projects: await listEditProjects() })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const r = body.fromNewsVideo !== undefined ? await editProjectForNewsVideo(auth.ctx.uid, body.fromNewsVideo, Date.now()) : await createEditProject(auth.ctx.uid, body, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value }, 201)
}
