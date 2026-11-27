import 'server-only'

/**
 * FinOps (25 Nov 2026): the heavy reel / video jobs as NAMED handlers with JSON args.
 *
 * A job can then run where the owner flag says (reelJobOwner.ts): in the Vercel function
 * that started it (as before) or on the Railway reel worker (scripts/worker/reel-worker.ts).
 * The routes call these same handlers for the local run, so there is one source of truth.
 *
 * A handler reloads its project from storage. If the project changed after the job was
 * queued (different render key), it stops instead of rendering stale content under the
 * old key; the studio shows the error and the user starts the render again.
 */
import { writeSocialAudit } from '@/lib/social/accounts/audit'

export type ReelJobOut = { result: unknown; httpStatus?: number }

type Args = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Options buildReelForNews accepts from the studio (all JSON-safe). */
export type ReelBuildOpts = {
  force?: boolean
  dryRun?: boolean
  voice?: string | null
  rate?: number | null
  personaId?: string | null
  intro?: string | null
  outro?: string | null
  music?: string | null
  voiceText?: string | null
  cover?: string | null
  layout?: string | null
  template?: string | null
  videoItemId?: string | null
  by?: string
}

export const REEL_JOB_HANDLERS = {
  /** Reels studio «Oluştur» (POST /api/admin/social/reels/render, async). */
  'reels.render': async (a: Args): Promise<ReelJobOut> => {
    const { buildReelForNews } = await import('@/lib/reels/reelService')
    const opts = (a.opts ?? {}) as ReelBuildOpts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { result: { result: await buildReelForNews(str(a.newsId), opts as any) } }
  },

  /** Share flow «prepare» (POST /api/admin/social/reels/share { prepare: true }). */
  'reels.prepare': async (a: Args): Promise<ReelJobOut> => {
    const newsId = str(a.newsId)
    const uid = str(a.uid)
    // MÜZİK-SEÇİMİ: editörün onay ekranındaki seçimi; hassas haber bilgi notu kaldırıldı (kullanıcı kararı)
    const musicChoice = a.music === 'off' ? 'off' : a.music === 'on' ? 'on' : null
    const { buildReelForNews } = await import('@/lib/reels/reelService')
    const b = await buildReelForNews(newsId, { by: uid, musicChoice })
    return { result: { prepared: true, url: b.url, coverUrl: b.coverUrl ?? null, reused: b.reused, notice: null, music: musicChoice } }
  },

  /** TikTok dialog «Video oluştur» and the social automation worker. */
  'reels.buildAndRecord': async (a: Args): Promise<ReelJobOut> => {
    const { buildAndRecordReel } = await import('@/lib/social/tiktokService')
    return buildAndRecordReel(str(a.newsId), str(a.uid))
  },

  /** Medya stüdyosu: one clip. */
  'media.render': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const uid = str(a.uid)
    const [{ getProject, setClipRendered }, { clipRenderKey, sourceLabelFor }, { renderClip }] = await Promise.all([
      import('@/lib/media/mediaStore'),
      import('@/lib/media/mediaProject'),
      import('@/lib/media/mediaRender'),
    ])
    const p = await getProject(id)
    const clip = p?.clips.find((c) => c.id === a.clipId)
    if (!p || !clip) throw new Error('Bölüm bulunamadı')
    const label = sourceLabelFor(p.rights)
    const renderKey = clipRenderKey(p.videoItemId, clip, label)
    if (renderKey !== a.renderKey) throw new Error('Bölüm değişti; videoyu yeniden oluşturun')
    try {
      const out = await renderClip({ projectId: id, clipId: clip.id, renderKey, videoItemId: p.videoItemId, startMs: clip.startMs, endMs: clip.endMs, cuts: clip.cuts, sourceFileUrl: p.sourceKind === 'news' ? (p.sourceFileUrl ?? null) : null, title: clip.title, sourceLabel: label, options: clip.options })
      const stored = await setClipRendered(id, clip.id, renderKey, out, Date.now())
      await writeSocialAudit({ actorId: uid, action: 'media.clip.render', entityType: 'mediaProject', entityId: id, meta: { clipId: clip.id, seconds: out.seconds, reused: out.reused, stored } })
      return { result: { ...out, stored } }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video üretilemedi'
      await setClipRendered(id, clip.id, renderKey, { error: message }, Date.now()).catch(() => undefined)
      throw err
    }
  },

  /** KURGU: export an edit project. */
  'edit.render': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const key = str(a.key)
    const uid = str(a.uid)
    const [{ getEditProject, setEditRendered }, { renderKeyFor }, { renderEditProject }] = await Promise.all([
      import('@/lib/edit/editStore'),
      import('@/lib/edit/editProject'),
      import('@/lib/edit/editRender'),
    ])
    const p = await getEditProject(id)
    if (!p) throw new Error('Proje bulunamadı')
    if (renderKeyFor(p) !== key) throw new Error('Proje değişti; videoyu yeniden oluşturun')
    try {
      const out = await renderEditProject(p, key)
      const stored = await setEditRendered(id, key, out, Date.now())
      await writeSocialAudit({ actorId: uid, action: 'video.edit.render', entityType: 'editProject', entityId: id, meta: { seconds: out.seconds, reused: out.reused, stored, clips: p.clips.length } })
      return { result: { ...out, stored } }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video üretilemedi'
      await setEditRendered(id, key, { error: message }, Date.now()).catch(() => undefined)
      throw err
    }
  },

  /** REKLAM STÜDYOSU: ad video. */
  'ad.render': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const key = str(a.key)
    const uid = str(a.uid)
    const [{ getAd, setAdRendered }, { adRenderKey, compileAd, duckUnderVoice }, { renderEditProject }, { drawAdOverlay }] = await Promise.all([
      import('@/lib/adStudio/adStore'),
      import('@/lib/adStudio/adModel'),
      import('@/lib/edit/editRender'),
      import('@/lib/adStudio/adText'),
    ])
    const ad = await getAd(id)
    if (!ad) throw new Error('Reklam bulunamadı')
    if (adRenderKey(ad) !== key) throw new Error('Reklam değişti; videoyu yeniden oluşturun')
    const { project, overlays } = compileAd(ad)
    try {
      const out = await renderEditProject(project, key, undefined, {
        fitSource: true,
        // reklam: yeniden kodlamada kayıp az olsun (CRF 21 → 17, aynı hız, ~%75 daha yüksek bit hızı)
        crf: 17,
        duckUnderVoice: duckUnderVoice(ad),
        drawText: async (t, W, H, file, root) => {
          const o = overlays.get(t.id)
          if (!o) throw new Error('Reklam katmanı bulunamadı')
          await drawAdOverlay(o, W, H, file, root)
        },
      })
      const stored = await setAdRendered(id, key, out, Date.now())
      await writeSocialAudit({ actorId: uid, action: 'ads.render', entityType: 'adProject', entityId: id, meta: { seconds: out.seconds, reused: out.reused, stored, look: ad.look, kind: ad.kind, voice: ad.voiceOn ? ad.voiceId : null } })
      return { result: { ...out, stored } }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reklam videosu üretilemedi'
      await setAdRendered(id, key, { error: message }, Date.now()).catch(() => undefined)
      throw err
    }
  },

  /** Konu → Video, 1-minute video in one job. */
  'story.render': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const uid = str(a.uid)
    const [R, { getStory }] = await Promise.all([import('@/lib/story/storyRender'), import('@/lib/story/storyStore')])
    const p = await getStory(id)
    const out = await R.renderAndStore(id)
    await writeSocialAudit({ actorId: uid, action: 'story.render', entityType: 'storyProject', entityId: id, meta: { seconds: out.seconds, reused: out.reused, stored: out.stored, voice: out.voiceEngine, scenes: p?.scenes.length ?? 0 } })
    return { result: { ...out, project: await getStory(id) } }
  },

  /** Konu → Video, long video: narration + part plan. */
  'story.prepare': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const R = await import('@/lib/story/storyRender')
    try {
      const plan = await R.prepareLongRender(id)
      return { result: { phase: 'prepare', parts: plan.ranges.length } }
    } catch (err) {
      await R.failRender(id, err)
      throw err
    }
  },

  /** Konu → Video, long video: one part. */
  'story.part': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const R = await import('@/lib/story/storyRender')
    try {
      return { result: await R.renderLongPart(id, num(a.part)) }
    } catch (err) {
      await R.failRender(id, err)
      throw err
    }
  },

  /** Konu → Video, long video: join the parts. */
  'story.finish': async (a: Args): Promise<ReelJobOut> => {
    const id = str(a.id)
    const uid = str(a.uid)
    const [R, { getStory }] = await Promise.all([import('@/lib/story/storyRender'), import('@/lib/story/storyStore')])
    const p = await getStory(id)
    try {
      const out = await R.finishLongRender(id)
      await writeSocialAudit({ actorId: uid, action: 'story.render', entityType: 'storyProject', entityId: id, meta: { seconds: out.seconds, stored: out.stored, voice: out.voiceEngine, scenes: p?.scenes.length ?? 0, parts: num(a.parts), format: p?.format, targetMin: p?.targetMin } })
      return { result: { ...out, project: await getStory(id) } }
    } catch (err) {
      await R.failRender(id, err)
      throw err
    }
  },
} as const

export type ReelJobHandlerName = keyof typeof REEL_JOB_HANDLERS

export function isReelJobHandlerName(v: unknown): v is ReelJobHandlerName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REEL_JOB_HANDLERS, v)
}

export async function runReelJobHandler(name: ReelJobHandlerName, args: Args): Promise<ReelJobOut> {
  return REEL_JOB_HANDLERS[name](args)
}
