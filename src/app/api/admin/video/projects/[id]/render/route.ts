/**
 * KURGU — POST /api/admin/video/projects/{id}/render → background export job (202)
 *         GET  /api/admin/video/projects/{id}/render?job=… → job state (only its starter)
 * An unchanged project is never rendered twice (same render key → same file).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { runReelJobHandler } from '@/lib/reels/reelJobHandlers'
import { renderKeyFor, renderProblem } from '@/lib/edit/editProject'
import { getEditProject, setEditRendered } from '@/lib/edit/editStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const job = new URL(request.url).searchParams.get('job')
  if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
  const j = await readReelJob(job)
  if (!j || j.by !== auth.ctx.uid) return json({ error: 'İş bulunamadı' }, 404)
  return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const p = await getEditProject(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const problem = renderProblem(p)
  if (problem) return json({ error: problem, code: 'not_renderable' }, 409)
  const key = renderKeyFor(p)
  if (p.render.status === 'ready' && p.render.key === key && p.render.outputUrl) return json({ render: p.render, reused: true })
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['edit', id, key]),
    kind: 'render',
    newsId: `edit_${id}`,
    by: uid,
    run: () => runReelJobHandler('edit.render', { id, key, uid }),
    remote: { handler: 'edit.render', args: { id, key, uid } },
  })
  return json({ job }, 202)
}
