/** KURGU — POST /api/admin/video/projects/{id}/voice { text, voice?, rate?, startMs? } → TTS voice-over on the audio track. */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { addVoiceOver } from '@/lib/edit/editStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  try {
    const r = await addVoiceOver(auth.ctx.uid, (await params).id, await readJsonBody(request), Date.now())
    if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
    return json({ project: r.value })
  } catch (err) {
    return json({ error: err instanceof Error && /zaman|timeout|abort/i.test(err.message) ? 'Seslendirme zaman aşımına uğradı' : 'Seslendirme üretilemedi', code: 'tts_failed' }, 502)
  }
}
