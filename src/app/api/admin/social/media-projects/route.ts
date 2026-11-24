/**
 * GET  /api/admin/social/media-projects        — recent media projects (Reels Studio «Medya projesi»)
 * POST /api/admin/social/media-projects        — create { videoItemId, rights, title?, caption?, linkedNewsId? }
 *                                                 or { fromNewsId } — the news item's own video (HABER-VIDEO)
 * Central social-account managers only; same-origin for changes.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createProject, listProjects, projectForNewsVideo } from '@/lib/media/mediaStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ projects: await listProjects() })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  // HABER-VIDEO: { fromNewsId } opens (or creates) the cutting project for a news item's own video
  const r = body.fromNewsId !== undefined ? await projectForNewsVideo(auth.ctx.uid, body.fromNewsId, Date.now()) : await createProject(auth.ctx.uid, body, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value }, 201)
}
