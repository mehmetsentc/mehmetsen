import 'server-only'

/**
 * REELS-1 — build a news reel for one article and store it in Firebase Storage.
 * Media is used only when the article passes the social media-rights check
 * (socialEligibility: own content or an editor rights decision); otherwise the
 * reel uses the brand panel. Idempotent: an existing reel is reused unless force.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getCategoryLabel } from '@/lib/newsMapper'
import { socialEligibility } from '@/lib/social/eligibility'
import { extractImageUrl, isOwnContent, isSkippableForSocial } from '@/lib/social/publishOneSocial'
import { renderReel, type ReelMedia } from './renderReel'
import { buildVoiceText } from './timeline'
import { reelVoiceConfig, synthesizeReelVoice } from './voice'
import { resolveReelVoice } from './voiceRules'
import { getReelVoiceSettings } from './voiceSettings'

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const MAX_MEDIA_BYTES = 60 * 1024 * 1024

export function reelsEnabled(): boolean {
  return (process.env.SOCIAL_REELS_ENABLED ?? 'true').trim().toLowerCase() !== 'false'
}

export function reelStoragePath(newsId: string): string {
  return `videos/reels/${newsId.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`
}

/** `v` (Storage generation) busts edge caches after a forced re-render. */
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
  place: string | null
  imageUrl: string | null
  videoUrl: string | null
  mediaAllowed: boolean
  mediaBasis: string
}

/** Pure mapping from a Firestore news doc to reel inputs. */
export function reelSourceFromDoc(d: Record<string, unknown>): ReelSource {
  const videoUrlRaw = str(d.videoUrl)
  const videoUrl = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(videoUrlRaw) ? videoUrlRaw : ''
  // Same media-rights rule as posts/stories; only the "video not supported" gate is
  // lifted, because a reel is the video format.
  const docForRights = videoUrl ? { ...d, hasVideo: false, isVideo: false } : d
  const verdict = socialEligibility(docForRights, {
    isOwnContent,
    isSkippableForSocial,
    extractImageUrl: (x) => extractImageUrl(x) ?? (videoUrl || undefined),
  })
  return {
    headline: str(d.title),
    summary: str(d.summary) || str(d.spot) || str(d.description),
    category: getCategoryLabel(str(d.categoryId) || 'gundem'),
    place: str(d.city) || null,
    imageUrl: extractImageUrl(d) ?? null,
    videoUrl: videoUrl || null,
    mediaAllowed: verdict.ok,
    mediaBasis: verdict.ok ? verdict.basis : verdict.code,
  }
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`reels: media ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_MEDIA_BYTES) throw new Error('reels: media too large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_MEDIA_BYTES) throw new Error('reels: media too large')
  return buf
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
}

export type ReelBuildOptions = { force?: boolean; voice?: string | null; rate?: number | null }

export async function buildReelForNews(newsId: string, opts: ReelBuildOptions = {}): Promise<ReelBuildResult> {
  if (!reelsEnabled()) throw new Error('reels: SOCIAL_REELS_ENABLED=false')
  const bucket = getAdminStorage().bucket(BUCKET)
  const file = bucket.file(reelStoragePath(newsId))
  if (!opts.force) {
    const [exists] = await file.exists()
    if (exists) {
      const [meta] = await file.getMetadata()
      const m = (meta.metadata ?? {}) as Record<string, string>
      return {
        newsId,
        url: reelPublicUrl(newsId, meta.generation ?? null),
        reused: true,
        media: (m.media as 'image') ?? 'image',
        mediaBasis: m.mediaBasis ?? '',
        ...(m.voice ? { voice: m.voice } : {}),
        ...(m.seconds ? { seconds: Number(m.seconds) } : {}),
      }
    }
  }

  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) throw new Error('reels: news not found')
  const d = snap.data() as Record<string, unknown>
  if (str(d.status) !== 'published') throw new Error('reels: news is not published')
  const src = reelSourceFromDoc(d)
  if (!src.headline) throw new Error('reels: news has no title')

  const voiceText = buildVoiceText(src.headline, src.summary)
  const env = reelVoiceConfig()
  const chosen = resolveReelVoice({
    settings: await getReelVoiceSettings(),
    env: { voice: process.env.GOOGLE_TTS_VOICE?.trim() || null, rate: env.rate },
    categoryId: str(d.categoryId) || null,
    override: { voice: opts.voice ?? null, rate: opts.rate ?? null },
  })
  const voiceWav = await synthesizeReelVoice(voiceText, AbortSignal.timeout(30_000), chosen)

  let media: ReelMedia = { kind: 'none' }
  let tmpVideo: string | null = null
  if (src.mediaAllowed) {
    try {
      if (src.videoUrl) {
        tmpVideo = path.join(os.tmpdir(), `reel-src-${newsId}-${Date.now()}.mp4`)
        await fs.writeFile(tmpVideo, await fetchBytes(src.videoUrl))
        media = { kind: 'video', path: tmpVideo }
      } else if (src.imageUrl) {
        media = { kind: 'image', data: await fetchBytes(src.imageUrl) }
      }
    } catch (err) {
      console.warn('[reels] media fetch failed, using brand panel:', err instanceof Error ? err.message : err)
      media = { kind: 'none' }
    }
  }

  try {
    const r = await renderReel({
      headline: src.headline,
      summary: src.summary,
      category: src.category,
      place: src.place,
      media,
      voiceWav,
    })
    await file.save(r.mp4, {
      resumable: false,
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=86400',
        metadata: { media: media.kind, mediaBasis: src.mediaBasis, seconds: r.seconds.toFixed(2), voice: chosen.voice, rate: String(chosen.rate) },
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
    return { newsId, url: reelPublicUrl(newsId, gen), reused: false, seconds: r.seconds, media: media.kind, mediaBasis: src.mediaBasis, voiceText, voice: chosen.voice, rate: chosen.rate }
  } finally {
    if (tmpVideo) await fs.rm(tmpVideo, { force: true }).catch(() => {})
  }
}
