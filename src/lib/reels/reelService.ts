import 'server-only'

/**
 * REELS — build a news reel for one article and store it in Firebase Storage.
 * REELS-4: AI Reels editor (style + spoken script), presenter personas, intro /
 * outro / music options, Gemini-TTS (optional, budget-capped), media from
 * mediaItems videos, studio media approval. Media is used only when the article
 * passes the social media-rights check or an editor approved it in the studio.
 * Idempotent: an existing reel with the same options is reused unless force.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getCategoryLabel } from '@/lib/newsMapper'
import { socialEligibility } from '@/lib/social/eligibility'
import { extractImageUrl, isOwnContent, isSkippableForSocial } from '@/lib/social/publishOneSocial'
import { directReel, scriptProblem } from './director'
import { reelsEditorLlm } from './directorLlm'
import { parsePersonas, personaFor, type ReelPersona } from './personas'
import { isReelIntro, isReelMusic, isReelOutro, type ReelIntro, type ReelMusic, type ReelOutro, type ReelStyle } from './reelOptions'
import { renderReel, type ReelMedia } from './renderReel'
import { synthesizeReelVoiceEx } from './voice'
import { clampRate, isValidVoiceName } from './voiceRules'
import { getReelVoiceSettings } from './voiceSettings'

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const VIDEO_RE = /\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i

export function reelsEnabled(): boolean {
  return (process.env.SOCIAL_REELS_ENABLED ?? 'true').trim().toLowerCase() !== 'false'
}

export function reelStoragePath(newsId: string): string {
  return `videos/reels/${newsId.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`
}

/** `v` (Storage generation) busts edge caches after a re-render. */
export function reelPublicUrl(newsId: string, v?: string | number | null): string {
  return `https://storage.googleapis.com/${BUCKET}/${reelStoragePath(newsId)}${v ? `?v=${encodeURIComponent(String(v))}` : ''}`
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export type ReelSource = {
  headline: string
  summary: string
  category: string
  categoryId: string
  place: string | null
  imageUrl: string | null
  videoUrl: string | null
  mediaAllowed: boolean
  mediaBasis: string
  breaking: boolean
  postType: string | null
}

/** First playable video: legacy videoUrl, then mediaItems videos. */
export function videoUrlFromDoc(d: Record<string, unknown>): string | null {
  const direct = str(d.videoUrl)
  if (VIDEO_RE.test(direct)) return direct
  const items = Array.isArray(d.mediaItems) ? (d.mediaItems as Array<{ type?: string; url?: string }>) : []
  const v = items.find((m) => m?.type === 'video' && VIDEO_RE.test(str(m.url)))
  return v ? str(v.url) : null
}

/**
 * Pure mapping from a Firestore news doc to reel inputs.
 * alwaysUseMedia (studio policy, default on): the story's own image / video is always used
 * — video when there is one, otherwise the image — regardless of the social rights check.
 */
export function reelSourceFromDoc(d: Record<string, unknown>, policy: { alwaysUseMedia?: boolean } = {}): ReelSource {
  const videoUrl = videoUrlFromDoc(d)
  // Same media-rights rule as posts/stories; only the «video not supported» gate is lifted.
  const docForRights = videoUrl ? { ...d, hasVideo: false, isVideo: false } : d
  const verdict = socialEligibility(docForRights, {
    isOwnContent,
    isSkippableForSocial,
    extractImageUrl: (x) => extractImageUrl(x) ?? (videoUrl || undefined),
  })
  const approval = d.reelMediaApproval && typeof d.reelMediaApproval === 'object' ? (d.reelMediaApproval as { by?: string }) : null
  const categoryId = str(d.categoryId) || 'gundem'
  return {
    headline: str(d.title),
    summary: str(d.summary) || str(d.spot) || str(d.description),
    category: getCategoryLabel(categoryId),
    categoryId,
    place: str(d.city) || null,
    imageUrl: extractImageUrl(d) ?? null,
    videoUrl,
    mediaAllowed: verdict.ok || !!approval?.by || (!!policy.alwaysUseMedia && !!(videoUrl || extractImageUrl(d))),
    mediaBasis: verdict.ok ? verdict.basis : approval?.by ? 'studio_approved' : policy.alwaysUseMedia && (videoUrl || extractImageUrl(d)) ? 'studio_policy' : verdict.code,
    breaking: d.isBreaking === true || categoryId === 'son-dakika',
    postType: str(d.postType) || null,
  }
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`reels: media ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_MEDIA_BYTES) throw new Error('reels: media too large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_MEDIA_BYTES) throw new Error('reels: media too large')
  return buf
}

export type ReelBuildOptions = {
  force?: boolean
  voice?: string | null
  rate?: number | null
  personaId?: string | null
  intro?: string | null
  outro?: string | null
  music?: string | null
  /** Studio-edited spoken script (checked like the AI script). */
  voiceText?: string | null
  /** Preview the editor's decision without rendering. */
  dryRun?: boolean
}

export type ReelBuildResult = {
  newsId: string
  url: string
  reused: boolean
  seconds?: number
  media: 'image' | 'video' | 'none'
  mediaBasis: string
  voiceText?: string
  voice?: string
  rate?: number
  style?: ReelStyle
  persona?: { id: string; name: string; title: string }
  engine?: 'gemini' | 'google'
  editor?: 'ai' | 'rules' | 'studio'
  intro?: ReelIntro
  outro?: ReelOutro
  music?: ReelMusic
  note?: string
}

export type ReelPlan = {
  style: ReelStyle
  persona: ReelPersona
  voiceText: string
  editor: 'ai' | 'rules' | 'studio'
  intro: ReelIntro
  outro: ReelOutro
  music: ReelMusic
  voice: string
  rate: number
  gemini: { style: string; voice: string; budgetUsd: number } | null
  note?: string
}

/** The editor's decision for one story (also used by the studio «Önizle» step and the digest). */
export async function planReel(src: ReelSource, opts: ReelBuildOptions = {}, oneSentence = false): Promise<ReelPlan> {
  const settings = await getReelVoiceSettings()
  const personas = parsePersonas(settings.personas)
  const ruleFirst = personaFor(personas, 'haber', opts.personaId)
  const studioText = str(opts.voiceText).replace(/\s+/g, ' ')
  const dir =
    studioText && !scriptProblem(studioText, `${src.headline} ${src.summary} ${studioText}`, 320)
      ? { style: (await directReel({ title: src.headline, summary: src.summary, categoryId: src.categoryId, categoryLabel: src.category, breaking: src.breaking, postType: src.postType }, ruleFirst, null)).style, voiceText: studioText, source: 'studio' as const }
      : await directReel(
          { title: src.headline, summary: src.summary, categoryId: src.categoryId, categoryLabel: src.category, breaking: src.breaking, postType: src.postType },
          ruleFirst,
          reelsEditorLlm(),
          { oneSentence },
        )
  const persona = personaFor(personas, dir.style, opts.personaId)
  const intro = isReelIntro(opts.intro) ? opts.intro : isReelIntro(settings.intro) ? settings.intro : 'soft'
  const outro = isReelOutro(opts.outro) ? opts.outro : isReelOutro(settings.outro) ? settings.outro : 'logo'
  const music = isReelMusic(opts.music) ? opts.music : isReelMusic(settings.music) ? settings.music : 'auto'
  return {
    style: dir.style,
    persona,
    voiceText: dir.voiceText,
    editor: dir.source,
    intro,
    outro,
    music,
    voice: isValidVoiceName(opts.voice) ? opts.voice : persona.voice,
    rate: (opts.rate != null ? clampRate(opts.rate) : null) ?? persona.rate,
    gemini: settings.geminiEnabled && persona.useGemini && persona.geminiStyle
      ? { style: persona.geminiStyle, voice: persona.geminiVoice, budgetUsd: settings.geminiMonthlyUsd ?? 10 }
      : null,
    ...('note' in dir && dir.note ? { note: dir.note } : {}),
  }
}

export async function loadPresenterPhoto(url: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const b = Buffer.from(await res.arrayBuffer())
    return b.length < 8 * 1024 * 1024 ? b : null
  } catch {
    return null
  }
}

/** Resolve licensed media (video file on disk or image bytes); brand panel otherwise. */
export async function resolveReelMedia(src: ReelSource, tag: string): Promise<{ media: ReelMedia; tmp: string | null }> {
  if (!src.mediaAllowed) return { media: { kind: 'none' }, tmp: null }
  try {
    if (src.videoUrl) {
      if (/\.m3u8(\?|$)/i.test(src.videoUrl)) return { media: { kind: 'video', path: src.videoUrl }, tmp: null } // ffmpeg reads HLS directly
      const tmp = path.join(os.tmpdir(), `reel-src-${tag}-${Date.now()}.mp4`)
      await fs.writeFile(tmp, await fetchBytes(src.videoUrl))
      return { media: { kind: 'video', path: tmp }, tmp }
    }
    if (src.imageUrl) return { media: { kind: 'image', data: await fetchBytes(src.imageUrl) }, tmp: null }
  } catch (err) {
    console.warn('[reels] media fetch failed, using brand panel:', err instanceof Error ? err.message : err)
  }
  return { media: { kind: 'none' }, tmp: null }
}

function optionsHash(p: ReelPlan): string {
  return createHash('sha1')
    .update(JSON.stringify([p.voiceText, p.voice, p.rate, p.persona.id, p.persona.showCard, p.intro, p.outro, p.music, p.style, !!p.gemini]))
    .digest('hex')
    .slice(0, 16)
}

export async function buildReelForNews(newsId: string, opts: ReelBuildOptions = {}): Promise<ReelBuildResult> {
  if (!reelsEnabled()) throw new Error('reels: SOCIAL_REELS_ENABLED=false')
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) throw new Error('reels: news not found')
  const d = snap.data() as Record<string, unknown>
  if (str(d.status) !== 'published') throw new Error('reels: news is not published')
  const src = reelSourceFromDoc(d, { alwaysUseMedia: (await getReelVoiceSettings()).alwaysUseMedia !== false })
  if (!src.headline) throw new Error('reels: news has no title')

  const hasStudioChoice = !!(opts.voice || opts.rate != null || opts.personaId || opts.intro || opts.outro || opts.music || opts.voiceText)
  const bucket = getAdminStorage().bucket(BUCKET)
  const file = bucket.file(reelStoragePath(newsId))
  // Plain «build» (automation / share) reuses whatever reel exists.
  if (!opts.force && !hasStudioChoice && !opts.dryRun) {
    const [exists] = await file.exists()
    if (exists) {
      const [meta] = await file.getMetadata()
      const m = (meta.metadata ?? {}) as Record<string, string>
      return { newsId, url: reelPublicUrl(newsId, meta.generation ?? null), reused: true, media: (m.media as 'image') ?? 'image', mediaBasis: m.mediaBasis ?? '', ...(m.seconds ? { seconds: Number(m.seconds) } : {}), ...(m.voice ? { voice: m.voice } : {}) }
    }
  }

  const plan = await planReel(src, opts)
  const base = {
    newsId,
    mediaBasis: src.mediaBasis,
    voiceText: plan.voiceText,
    voice: plan.voice,
    rate: plan.rate,
    style: plan.style,
    persona: { id: plan.persona.id, name: plan.persona.name, title: plan.persona.title },
    editor: plan.editor,
    intro: plan.intro,
    outro: plan.outro,
    music: plan.music,
    ...(plan.note ? { note: plan.note } : {}),
  }
  if (opts.dryRun) return { ...base, url: '', reused: false, media: src.mediaAllowed ? (src.videoUrl ? 'video' : src.imageUrl ? 'image' : 'none') : 'none' }

  const hash = optionsHash(plan)
  if (!opts.force) {
    const [exists] = await file.exists()
    if (exists) {
      const [meta] = await file.getMetadata()
      const m = (meta.metadata ?? {}) as Record<string, string>
      if (m.optionsHash === hash) return { ...base, url: reelPublicUrl(newsId, meta.generation ?? null), reused: true, media: (m.media as 'image') ?? 'image', ...(m.seconds ? { seconds: Number(m.seconds) } : {}) }
    }
  }

  const spoken = await synthesizeReelVoiceEx(plan.voiceText, AbortSignal.timeout(40_000), { voice: plan.voice, rate: plan.rate, gemini: plan.gemini })
  const { media, tmp } = await resolveReelMedia(src, newsId)
  try {
    const r = await renderReel({
      headline: src.headline,
      summary: src.summary,
      category: src.category,
      place: src.place,
      media,
      voiceWav: spoken.wav,
      style: plan.style,
      breaking: src.breaking,
      intro: plan.intro,
      outro: plan.outro,
      music: plan.music,
      presenter: plan.persona.showCard ? { name: plan.persona.name, title: plan.persona.title, photo: await loadPresenterPhoto(plan.persona.photoUrl) } : null,
      dateLabel: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }),
    })
    await file.save(r.mp4, {
      resumable: false,
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=86400',
        metadata: {
          media: media.kind,
          mediaBasis: src.mediaBasis,
          seconds: r.seconds.toFixed(2),
          voice: plan.voice,
          rate: String(plan.rate),
          persona: plan.persona.id,
          engine: spoken.engine,
          optionsHash: hash,
        },
      },
    })
    await file.makePublic()
    let gen: string | number = Date.now()
    try {
      const [m] = await file.getMetadata()
      if (m.generation) gen = m.generation
    } catch {
      // keep the timestamp
    }
    return { ...base, url: reelPublicUrl(newsId, gen), reused: false, seconds: r.seconds, media: media.kind, engine: spoken.engine, ...(spoken.note ? { note: spoken.note } : {}) }
  } finally {
    if (tmp) await fs.rm(tmp, { force: true }).catch(() => {})
  }
}
