/**
 * POST /api/admin/social/story-projects/{id}/assets
 *   { action: 'add', kind: 'image', storagePath, previewUrl?, name? }  — a photo the editor uploaded
 *   { action: 'add', kind: 'video', videoItemId }                       — a Video Kütüphanesi video
 *   { action: 'describe', assetId }                                     — (re)read what it shows
 *   { action: 'remove', assetId }
 * 'add' and 'describe' start a background job that stores the AI description on the asset.
 * GET ?job=… polls it.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { isShortId, type StoryAsset } from '@/lib/story/storyProject'
import { addAsset, getStory, removeAsset } from '@/lib/story/storyStore'
import { pollStoryJob } from '@/lib/story/storyJobRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

export const GET = (request: Request) => pollStoryJob(request)

function describeJob(uid: string, id: string, asset: StoryAsset) {
  return startReelJob({
    jobId: reelJobId(['sdesc', id, asset.id]),
    kind: 'build',
    newsId: `story_${id}`,
    by: uid,
    run: async () => {
      const { describeAsset } = await import('@/lib/story/storyRender')
      const description = await describeAsset(id, asset)
      return { result: { assetId: asset.id, description } }
    },
  })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  const uid = auth.ctx.uid
  if (body.action === 'remove') {
    const r = await removeAsset(uid, id, body.assetId, Date.now())
    return r.ok ? json({ project: r.value }) : json({ error: r.message, code: r.code }, r.status)
  }
  if (body.action === 'describe') {
    const p = await getStory(id)
    const asset = p && isShortId(body.assetId) ? p.assets.find((a) => a.id === body.assetId) : undefined
    if (!asset) return json({ error: 'Görüntü bulunamadı', code: 'not_found' }, 404)
    return json({ job: await describeJob(uid, id, asset) }, 202)
  }
  const r = await addAsset(uid, id, body, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  const job = await describeJob(uid, id, r.value.asset)
  return json({ project: r.value.project, asset: r.value.asset, job }, 201)
}
