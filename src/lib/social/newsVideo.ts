/**
 * One place that answers «does this news item have a video, and what kind?»
 * for social sharing (posts, stories, reels, Shorts).
 *
 * Looked at, in order: playbackUrl, videoUrl, videoEmbedUrl, mediaItems
 * (type video), bodyBlocks (type video).
 *
 *   file     — a video FILE the renderer can read:
 *                origin 'nahaber'  → NaHaber's own storage (Firebase / R2 / nahaber.com)
 *                origin 'external' → a direct MP4/MOV/WebM or HLS (.m3u8) link elsewhere;
 *                                    copied into NaHaber Storage before use (see sourceVideo.ts)
 *   youtube  — a YouTube link / embed. Never downloaded or re-uploaded (YouTube
 *              terms + the video's owner); the share links to the article instead.
 *   embed    — another player page (Vimeo, Dailymotion …): not a file, link only.
 *   none
 */
import { parseYouTubeVideoId } from '@/lib/postUtils'

export type NewsVideo =
  | { kind: 'file'; url: string; origin: 'nahaber' | 'external'; hls: boolean }
  | { kind: 'youtube'; id: string; watchUrl: string }
  | { kind: 'embed'; url: string }
  | { kind: 'none' }

const OWNED_HOST_RE =
  /(^|\.)nahaber\.com$|(^|\.)firebasestorage\.googleapis\.com$|(^|\.)firebasestorage\.app$|(^|\.)r2\.dev$|(^|\.)r2\.cloudflarestorage\.com$/i
const GCS_HOST = 'storage.googleapis.com'
const FILE_EXT_RE = /\.(mp4|mov|m4v|webm)$/i
const HLS_RE = /\.m3u8$/i
const EMBED_HOST_RE = /(^|\.)(vimeo\.com|dailymotion\.com|dai\.ly|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com)$/i

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Candidate video URLs of a news document, most specific first, deduplicated. */
export function newsVideoCandidates(d: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    const s = str(v)
    if (s && !out.includes(s)) out.push(s)
  }
  push(d.playbackUrl)
  push(d.videoUrl)
  push(d.videoEmbedUrl)
  for (const m of Array.isArray(d.mediaItems) ? d.mediaItems : []) {
    const o = (m ?? {}) as Record<string, unknown>
    if (o.type === 'video') push(o.url)
  }
  for (const b of Array.isArray(d.bodyBlocks) ? d.bodyBlocks : []) {
    const o = (b ?? {}) as Record<string, unknown>
    if (o.type === 'video') push(o.url)
  }
  return out
}

function decodedPath(u: URL): string {
  try {
    return decodeURIComponent(u.pathname)
  } catch {
    return u.pathname
  }
}

/** Classify ONE url (null = not a video we recognise). */
export function classifyVideoUrl(raw: string): NewsVideo | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const yt = parseYouTubeVideoId(raw)
  if (yt || /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(u.hostname)) {
    return yt ? { kind: 'youtube', id: yt, watchUrl: `https://www.youtube.com/watch?v=${yt}` } : null
  }
  const path = decodedPath(u)
  const hls = HLS_RE.test(path)
  if (FILE_EXT_RE.test(path) || hls) {
    // Only https files are fetched; an http-only file is treated as a plain link.
    if (u.protocol !== 'https:') return { kind: 'embed', url: raw }
    const owned = OWNED_HOST_RE.test(u.hostname) || u.hostname === GCS_HOST
    return { kind: 'file', url: raw, origin: owned ? 'nahaber' : 'external', hls }
  }
  if (EMBED_HOST_RE.test(u.hostname)) return { kind: 'embed', url: raw }
  return null
}

/**
 * The video to use for a news item. A file always wins over YouTube / embeds
 * (a NaHaber file over an external one), so an uploaded copy is preferred to a link.
 */
export function resolveNewsVideo(d: Record<string, unknown>): NewsVideo {
  const found = newsVideoCandidates(d).map(classifyVideoUrl).filter((v): v is NewsVideo => !!v)
  const owned = found.find((v) => v.kind === 'file' && v.origin === 'nahaber')
  if (owned) return owned
  const ext = found.find((v) => v.kind === 'file')
  if (ext) return ext
  return found.find((v) => v.kind === 'youtube') ?? found.find((v) => v.kind === 'embed') ?? { kind: 'none' }
}

/** True when the item has any video (file, YouTube or another player) or is flagged as video. */
export function newsHasVideo(d: Record<string, unknown>): boolean {
  return resolveNewsVideo(d).kind !== 'none' || d.hasVideo === true || d.isVideo === true
}

/** Short Turkish label for the panel. */
export function newsVideoLabel(v: NewsVideo): string | null {
  if (v.kind === 'file') return v.origin === 'nahaber' ? 'Video (NaHaber)' : v.hls ? 'Video (yayın akışı)' : 'Video (link)'
  if (v.kind === 'youtube') return 'YouTube videosu'
  if (v.kind === 'embed') return 'Video (dış oynatıcı)'
  return null
}
