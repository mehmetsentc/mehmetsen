import 'server-only'

/** STORY-1 — shared «?job=» poll for the story routes (only the job's starter may read it). */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { isReelJobId, readReelJob } from '@/lib/reels/reelJobs'

export async function pollStoryJob(request: Request): Promise<Response> {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const job = new URL(request.url).searchParams.get('job')
  if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
  const j = await readReelJob(job)
  if (!j || j.by !== auth.ctx.uid) return json({ error: 'İş bulunamadı' }, 404)
  return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
}
