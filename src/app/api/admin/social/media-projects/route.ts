/**
 * GET  /api/admin/social/media-projects        — recent media projects (Reels Studio «Medya projesi»)
 * POST /api/admin/social/media-projects        — create { videoItemId, rights, title?, caption?, linkedNewsId? }
 * Central social-account managers only; same-origin for changes.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createProject, listProjects } from '@/lib/media/mediaStore'

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
  const r = await createProject(auth.ctx.uid, await readJsonBody(request), Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value }, 201)
}
