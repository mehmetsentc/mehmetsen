import 'server-only'

/**
 * REELS — build a news reel for one article and store it in Firebase Storage.
 * REELS-4: AI Reels editor (style + spoken script), presenter personas, intro /
 * outro / music options, Gemini-TTS (optional, budget-capped), media from
 * mediaItems videos, studio media approval. Media is used only when the article
 * passes the social media-rights check or an editor approved it in the studio.
 * Idempotent: an existing reel with the same options is reused unless force.
 */
import { spawn } from 'node:child_process'
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
import { recordReel } from './reelLibrary'
import { renderReel, type ReelMedia } from './renderReel'
import { synthesizeReelVoiceEx } from './voice'
import { clampRate, isValidVoiceName } from './voiceRules'
import { getReelVoiceSettings } from './voiceSettings'
import { articleBlocksToPlainText, type ArticleBlock } from '@/lib/articleBlocks'
import { stripHtmlToNewsPlainText } from '@/lib/stripHtmlToNewsPlainText'
import { NEWS_BODY_MAX, NEWS_SCRIPT_MAX } from './director'
import { resolveNewsVideo, type NewsVideo } from '@/lib/social/newsVideo'
import { prepareSourceVideo } from './sourceVideo'

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const MAX_MEDIA_BYTES = 200 * 1024 * 1024

export function reelsEnabled(): boolean {
  return (process.env.SOCIAL_REELS_ENABLED ?? 'true').trim().toLowerCase() !== 'false'
}

export function reelStoragePath(newsId: string): string {
  return `videos/reels/${newsId.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`
}

export function reelCoverStoragePath(newsId: string): string {
  return `videos/reels/${newsId.replace(/[^A-Za-z0-9_-]/g, '_')}-cover.jpg`
}

/**
 * A stored reel made from photos is rebuilt once when the story now has a usable
 * video file. `videoSource` remembers the video already tried, so a source that
 * cannot be read does not trigger a new render (and TTS) on every share.
 */
export function needsVideoRebuild(src: Pick<ReelSource, 'videoUrl' | 'mediaAllowed'>, meta: Record<string, string>): boolean {
  if (!src.videoUrl || !src.mediaAllowed) return false
  if (meta.media === 'video') return false
  return (meta.videoSource ?? '') !== src.videoUrl.slice(0, 500)
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
  /** REELS-13: the article body as plain text (≤ NEWS_BODY_MAX), source of the anchor script. */
  body?: string
  category: string
  categoryId: string
  place: string | null
  imageUrl: string | null
  /** REELS-9: the story's other photos (gallery, extra images, body images), cover excluded. */
  imageUrls?: string[]
  videoUrl: string | null
  /** Where videoUrl lives: NaHaber storage or an external link (copied into Storage before use). */
  videoOrigin?: 'nahaber' | 'external' | null
  videoHls?: boolean
  /** What the story's video is, also when it can't be used (YouTube / player page). */
  videoKind?: NewsVideo['kind']
  mediaAllowed: boolean
  mediaBasis: string
  breaking: boolean
  postType: string | null
}

/**
 * The story's video FILE (NaHaber storage, external MP4 or HLS) from every video
 * field (playbackUrl, videoUrl, videoEmbedUrl, mediaItems, bodyBlocks).
 * YouTube / player pages are not files → null (the reel uses the photos).
 */
export function videoUrlFromDoc(d: Record<string, unknown>): string | null {
  const v = resolveNewsVideo(d)
  return v.kind === 'file' ? v.url : null
}

/**
 * Pure mapping from a Firestore news doc to reel inputs.
 * alwaysUseMedia (studio policy, default on): the story's own image / video is always used
 * — video when there is one, otherwise the image — regardless of the social rights check.
 */
export function reelSourceFromDoc(d: Record<string, unknown>, policy: { alwaysUseMedia?: boolean } = {}): ReelSource {
  const video = resolveNewsVideo(d)
  const videoUrl = video.kind === 'file' ? video.url : null
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
    body: newsBodyText(d),
    category: getCategoryLabel(categoryId),
    categoryId,
    place: str(d.city) || null,
    imageUrl: extractImageUrl(d) ?? null,
    imageUrls: reelPhotoUrlsFromDoc(d, extractImageUrl(d) ?? null).slice(1),
    videoUrl,
    videoOrigin: video.kind === 'file' ? video.origin : null,
    videoHls: video.kind === 'file' ? video.hls : false,
    videoKind: video.kind,
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
  /** REELS-5/8: cover look (foto | manset | panel | bulten); default from studio settings. */
  cover?: string | null
  /** REELS-6/7: reel layout (dinamik | bulten | kart); default from studio settings. */
  layout?: string | null
  /** CMS user who built it (saved in the reel library). */
  by?: string | null
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
  /** REELS-5: Instagram cover (JPEG, public). */
  coverUrl?: string | null
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

/**
 * REELS-13: reels made before the full anchor script (short 1–2 sentence voice-over)
 * are rebuilt once when shared again; later shares reuse the new reel.
 */
export const REEL_SCRIPT_VERSION = '13'

/**
 * REELS-14: time a VIDEO render may take (projected from its first frames). The
 * background job ends at 800 s; voice, AI script and the video download come first,
 * and a photo render (~2–3 min on Vercel) must still fit after an early abort.
 */
export const VIDEO_RENDER_BUDGET_MS = 420_000

/** Plain article text: content / body HTML, else the article blocks. */
export function newsBodyText(d: Record<string, unknown>): string {
  const html = str(d.content) || str(d.body) || str(d.htmlContent)
  let text = html ? stripHtmlToNewsPlainText(html).replace(/(^|\n)#{1,6}\s*/g, '$1') : ''
  if (!text && Array.isArray(d.bodyBlocks)) {
    try {
      text = articleBlocksToPlainText(d.bodyBlocks as ArticleBlock[])
    } catch {
      text = ''
    }
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, NEWS_BODY_MAX)
}

/** The editor's decision for one story (also used by the studio «Önizle» step and the digest). */
export async function planReel(src: ReelSource, opts: ReelBuildOptions = {}, oneSentence = false): Promise<ReelPlan> {
  const settings = await getReelVoiceSettings()
  const personas = parsePersonas(settings.personas)
  const ruleFirst = personaFor(personas, 'haber', opts.personaId)
  const studioText = str(opts.voiceText).replace(/\s+/g, ' ')
  const dir =
    studioText && !scriptProblem(studioText, `${src.headline} ${src.summary} ${src.body ?? ''} ${studioText}`, NEWS_SCRIPT_MAX)
      ? { style: (await directReel({ title: src.headline, summary: src.summary, categoryId: src.categoryId, categoryLabel: src.category, breaking: src.breaking, postType: src.postType }, ruleFirst, null)).style, voiceText: studioText, source: 'studio' as const }
      : await directReel(
          { title: src.headline, summary: src.summary, body: src.body ?? '', categoryId: src.categoryId, categoryLabel: src.category, breaking: src.breaking, postType: src.postType },
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

const MAX_REEL_PHOTOS = 6

/** REELS-9: every photo of a story (cover first), https only, no duplicates, no video files. */
export function reelPhotoUrlsFromDoc(d: Record<string, unknown>, cover: string | null): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (v: unknown) => {
    const u = typeof v === 'string' ? v.trim() : ''
    if (!/^https:\/\//i.test(u) || /\.(mp4|mov|m3u8|webm)(\?|#|$)/i.test(u) || /\/api\/og\//.test(u)) return
    const key = u.split('?')[0]!
    if (seen.has(key)) return
    seen.add(key)
    out.push(u)
  }
  add(cover)
  for (const k of ['thumbnail', 'coverImageUrl', 'imageUrl', 'featuredImage', 'image']) add(d[k])
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  for (const m of list(d.mediaItems)) {
    const o = (m ?? {}) as Record<string, unknown>
    const type = String(o.type ?? '').toLowerCase()
    if (!type || type === 'image') add(o.url)
  }
  for (const m of list(d.additionalImages)) add(typeof m === 'string' ? m : (m as Record<string, unknown> | null)?.url)
  for (const m of list(d.galleryImages)) add(typeof m === 'string' ? m : (m as Record<string, unknown> | null)?.url)
  for (const b of list(d.bodyBlocks)) {
    const o = (b ?? {}) as Record<string, unknown>
    if (o.type === 'image') add(o.url)
    if (o.type === 'gallery') for (const g of list(o.images)) add((g as Record<string, unknown> | null)?.url)
  }
  return out.slice(0, MAX_REEL_PHOTOS)
}

/** Resolve licensed media (video file on disk or image bytes); brand panel otherwise. */
export async function resolveReelMedia(src: ReelSource, tag: string, storeKey: string | null = null): Promise<{ media: ReelMedia; tmp: string | null }> {
  if (!src.mediaAllowed) return { media: { kind: 'none' }, tmp: null }
  try {
    if (src.videoUrl) {
      // The story's own video: a local copy, time-boxed; external links are kept in Storage.
      const v = await prepareSourceVideo({
        url: src.videoUrl,
        origin: src.videoOrigin ?? (/firebasestorage|storage\.googleapis\.com/.test(src.videoUrl) ? 'nahaber' : 'external'),
        hls: src.videoHls ?? /\.m3u8(\?|$)/i.test(src.videoUrl),
        tag,
        storeKey,
      })
      if (v.ok) return { media: { kind: 'video', path: v.path }, tmp: v.path }
      console.warn(`[reels] story video unusable (${v.reason}), using photos`)
    }
    if (src.imageUrl) {
      const data = await fetchBytes(src.imageUrl)
      // the other photos are optional: a failed fetch just drops that slide
      const more = (await Promise.allSettled((src.imageUrls ?? []).map((u) => fetchBytes(u))))
        .flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      return { media: { kind: 'image', data, ...(more.length ? { more } : {}) }, tmp: null }
    }
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

/** One JPEG frame (~1s in) of a video file / URL, for the cover. */
async function videoFrameJpeg(src: string): Promise<Buffer | null> {
  try {
    const { resolveFfmpegPath } = await import('./reelTheme')
    const ffmpeg = await resolveFfmpegPath()
    return await new Promise<Buffer | null>((resolve) => {
      const p = spawn(ffmpeg, ['-v', 'error', '-ss', '1', '-i', src, '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
      const chunks: Buffer[] = []
      const timer = setTimeout(() => p.kill('SIGKILL'), 20_000)
      p.stdout.on('data', (c: Buffer) => chunks.push(c))
      p.on('close', () => { clearTimeout(timer); const b = Buffer.concat(chunks); resolve(b.length ? b : null) })
      p.on('error', () => { clearTimeout(timer); resolve(null) })
    })
  } catch {
    return null
  }
}

/** Render + store the cover; returns its public URL (null on failure — the reel still ships). */
async function saveReelCover(newsId: string, src: ReelSource, style: ReelStyle, variant: CoverVariant, media?: ReelMedia | null): Promise<string | null> {
  try {
    let image: Buffer | null = null
    if (media?.kind === 'image') image = media.data
    else if (media?.kind === 'video') image = await videoFrameJpeg(media.path)
    else if (src.mediaAllowed) {
      if (src.imageUrl) image = await fetchBytes(src.imageUrl).catch(() => null)
      else if (src.videoUrl) image = await videoFrameJpeg(src.videoUrl)
    }
    const { renderReelCover } = await import('./reelCover')
    const jpg = await renderReelCover({ headline: src.headline, summary: src.summary, category: src.category, place: src.place, style, breaking: src.breaking, image, variant })
    const file = getAdminStorage().bucket(BUCKET).file(reelCoverStoragePath(newsId))
    await file.save(jpg, { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400', metadata: { variant } } })
    await file.makePublic()
    let gen: string | number = Date.now()
    try {
      const [m] = await file.getMetadata()
      if (m.generation) gen = m.generation
    } catch {
      // keep the timestamp
    }
    return `https://storage.googleapis.com/${BUCKET}/${reelCoverStoragePath(newsId)}?v=${encodeURIComponent(String(gen))}`
  } catch (err) {
    console.warn('[reels] cover failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Existing cover URL, or a fresh one (older reels had none). */
async function coverFor(newsId: string, src: ReelSource, style: ReelStyle, variant: CoverVariant): Promise<{ url: string | null; created: boolean }> {
  const file = getAdminStorage().bucket(BUCKET).file(reelCoverStoragePath(newsId))
  try {
    const [exists] = await file.exists()
    if (exists) {
      const [m] = await file.getMetadata()
      const v = ((m.metadata ?? {}) as Record<string, string>).variant
      if (!v || v === variant) return { url: `https://storage.googleapis.com/${BUCKET}/${reelCoverStoragePath(newsId)}?v=${encodeURIComponent(String(m.generation ?? ''))}`, created: false }
    }
  } catch {
    // fall through and render
  }
  return { url: await saveReelCover(newsId, src, style, variant), created: true }
}

type CoverVariant = 'foto' | 'manset' | 'panel' | 'bulten'
const isCoverVariant = (v: unknown): v is CoverVariant => v === 'foto' || v === 'manset' || v === 'panel' || v === 'bulten'
type Layout = 'kart' | 'bulten' | 'dinamik'
const isLayout = (v: unknown): v is Layout => v === 'kart' || v === 'bulten' || v === 'dinamik'

function styleOf(v: unknown): ReelStyle {
  return v === 'magazin' || v === 'spor' || v === 'analiz' ? v : 'haber'
}

export async function buildReelForNews(newsId: string, opts: ReelBuildOptions = {}): Promise<ReelBuildResult> {
  if (!reelsEnabled()) throw new Error('reels: SOCIAL_REELS_ENABLED=false')
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) throw new Error('reels: news not found')
  const d = snap.data() as Record<string, unknown>
  if (str(d.status) !== 'published') throw new Error('reels: news is not published')
  const settings = await getReelVoiceSettings()
  const src = reelSourceFromDoc(d, { alwaysUseMedia: settings.alwaysUseMedia !== false })
  if (!src.headline) throw new Error('reels: news has no title')
  const coverVariant: CoverVariant = isCoverVariant(opts.cover) ? opts.cover : isCoverVariant(settings.cover) ? settings.cover : 'foto'
  const layout: Layout = isLayout(opts.layout) ? opts.layout : isLayout(settings.layout) ? settings.layout : 'dinamik'
  const slug = str(d.slug) || null
  const record = (url: string, coverUrl: string | null, m: { seconds?: number | null; persona?: string | null; style?: string | null; media?: string | null }) =>
    recordReel({ newsId, slug, headline: src.headline, url, coverUrl, seconds: m.seconds ?? null, persona: m.persona ?? null, style: m.style ?? null, media: m.media ?? null, by: opts.by ?? null })
      .catch((err) => console.warn('[reels] library record failed:', err instanceof Error ? err.message : err))

  const hasStudioChoice = !!(opts.voice || opts.rate != null || opts.personaId || opts.intro || opts.outro || opts.music || opts.voiceText || opts.layout)
  const bucket = getAdminStorage().bucket(BUCKET)
  const file = bucket.file(reelStoragePath(newsId))
  // Plain «build» (automation / share) reuses whatever reel exists.
  if (!opts.force && !hasStudioChoice && !opts.dryRun) {
    const [exists] = await file.exists()
    const [meta] = exists ? await file.getMetadata() : [null]
    const m = (meta?.metadata ?? {}) as Record<string, string>
    // A reel rendered from photos while the story has a usable video is rebuilt with the video.
    if (exists && meta && !needsVideoRebuild(src, m) && m.scriptVersion === REEL_SCRIPT_VERSION) {
      const url = reelPublicUrl(newsId, meta.generation ?? null)
      const cover = await coverFor(newsId, src, styleOf(m.style), coverVariant)
      if (cover.created) await record(url, cover.url, { seconds: m.seconds ? Number(m.seconds) : null, persona: m.persona, style: m.style, media: m.media })
      return { newsId, url, coverUrl: cover.url, reused: true, media: (m.media as 'image') ?? 'image', mediaBasis: m.mediaBasis ?? '', ...(m.seconds ? { seconds: Number(m.seconds) } : {}), ...(m.voice ? { voice: m.voice } : {}) }
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

  const hash = `${optionsHash(plan)}${layout === 'kart' ? '' : layout === 'bulten' ? '-b' : '-d'}`
  if (!opts.force) {
    const [exists] = await file.exists()
    if (exists) {
      const [meta] = await file.getMetadata()
      const m = (meta.metadata ?? {}) as Record<string, string>
      if (m.optionsHash === hash && !needsVideoRebuild(src, m) && m.scriptVersion === REEL_SCRIPT_VERSION) {
        const url = reelPublicUrl(newsId, meta.generation ?? null)
        const cover = await coverFor(newsId, src, plan.style, coverVariant)
        if (cover.created) await record(url, cover.url, { seconds: m.seconds ? Number(m.seconds) : null, persona: plan.persona.id, style: plan.style, media: m.media })
        return { ...base, url, coverUrl: cover.url, reused: true, media: (m.media as 'image') ?? 'image', ...(m.seconds ? { seconds: Number(m.seconds) } : {}) }
      }
    }
  }

  const spoken = await synthesizeReelVoiceEx(plan.voiceText, AbortSignal.timeout(40_000), { voice: plan.voice, rate: plan.rate, gemini: plan.gemini })
  const resolved = await resolveReelMedia(src, newsId, newsId)
  let media = resolved.media
  const tmp = resolved.tmp
  try {
    const presenter = plan.persona.showCard ? { name: plan.persona.name, title: plan.persona.title, photo: await loadPresenterPhoto(plan.persona.photoUrl) } : null
    const reelInput = (mediaIn: ReelMedia) => ({
      headline: src.headline,
      summary: src.summary,
      category: src.category,
      place: src.place,
      media: mediaIn,
      voiceWav: spoken.wav,
      style: plan.style,
      breaking: src.breaking,
      intro: plan.intro,
      outro: plan.outro,
      music: plan.music,
      presenter,
      dateLabel: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }),
      layout,
      // REELS-13: the spoken script as on-screen captions (sentence by sentence)
      captions: plan.voiceText,
    })
    // REELS-14: a video reel that cannot finish inside the background job (800 s)
    // is stopped after its first frames and made from the story's photos instead.
    let r: Awaited<ReturnType<typeof renderReel>>
    let videoFallback = false
    try {
      r = await renderReel(reelInput(media), media.kind === 'video' ? { budgetMs: VIDEO_RENDER_BUDGET_MS } : {})
    } catch (err) {
      if (!(err instanceof Error && err.name === 'RenderBudgetError')) throw err
      console.warn(`[reels] ${newsId}: video render over budget (${err.message}), using photos`)
      media = (await resolveReelMedia({ ...src, videoUrl: null }, `${newsId}-p`)).media
      r = await renderReel(reelInput(media))
      videoFallback = true
    }
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
          style: plan.style,
          engine: spoken.engine,
          optionsHash: hash,
          scriptVersion: REEL_SCRIPT_VERSION,
          videoSource: (src.videoUrl ?? '').slice(0, 500),
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
    const url = reelPublicUrl(newsId, gen)
    const coverUrl = await saveReelCover(newsId, src, plan.style, coverVariant, media)
    await record(url, coverUrl, { seconds: r.seconds, persona: plan.persona.id, style: plan.style, media: media.kind })
    const note = [spoken.note, videoFallback ? 'Haberin videosu zamanında işlenemedi; Reels fotoğraflarla üretildi.' : null].filter(Boolean).join(' ')
    return { ...base, url, coverUrl, reused: false, seconds: r.seconds, media: media.kind, engine: spoken.engine, ...(note ? { note } : {}) }
  } finally {
    if (tmp) await fs.rm(tmp, { force: true }).catch(() => {})
  }
}
