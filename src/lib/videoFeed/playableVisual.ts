import { isEmbedPlayerUrl } from '@/lib/videoEmbed'
import { parseYouTubeVideoId } from '@/lib/postUtils'
import { detectStorageBackend } from '@/lib/storage'

type MediaLike = {
  type?: string
  url?: string | null
}

export type VisualVideoCandidate = {
  id?: string
  title?: string
  summary?: string
  content?: string
  slug?: string
  status?: string
  publishedAt?: string | null
  createdAt?: string
  source?: string
  sourceUrl?: string
  coverImageUrl?: string | null
  audioUrl?: string | null
  hasVideo?: boolean
  isTTS?: boolean
  mediaItems?: MediaLike[]
  videoUrl?: string | null
  videoEmbedUrl?: string | null
  clusterId?: string | null
}

const OWNED_HOST_RE =
  /(^|\.)nahaber\.com$|(^|\.)firebasestorage\.googleapis\.com$|(^|\.)firebasestorage\.app$|(^|\.)r2\.dev$|(^|\.)r2\.cloudflarestorage\.com$/i

function collectCandidateUrls(post: VisualVideoCandidate): string[] {
  const urls: string[] = []
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (trimmed) urls.push(trimmed)
  }
  push(post.videoUrl)
  push(post.videoEmbedUrl)
  for (const item of post.mediaItems ?? []) {
    if (item.type === 'video') push(item.url)
  }
  return urls
}

function isHlsUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('.m3u8') || lower.includes('application/vnd.apple.mpegurl')
}

function isDirectVisualFile(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return /\.(mp4|webm|mov|m4v|ogg)(\/|$)/.test(path) || /\.(mp4|webm|mov|m4v|ogg)$/.test(path)
  } catch {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
  }
}

export function parseVimeoVideoId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const match =
    trimmed.match(/player\.vimeo\.com\/video\/(\d+)/i) ||
    trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  return match?.[1] ?? null
}

export function parseDailymotionVideoId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const match =
    trimmed.match(/dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/i) ||
    trimmed.match(/dai\.ly\/([a-zA-Z0-9]+)/i)
  return match?.[1] ?? null
}

export function isOwnedNativeVideoUrl(url: string): boolean {
  const backend = detectStorageBackend(url)
  if (backend === 'r2' || backend === 'firebase') return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    return OWNED_HOST_RE.test(host)
  } catch {
    return false
  }
}

function isSupportedVisualNativeUrl(url: string): boolean {
  if (isHlsUrl(url)) return false
  if (!isDirectVisualFile(url)) return false
  return isOwnedNativeVideoUrl(url)
}

function isSupportedEmbedUrl(url: string): boolean {
  if (isHlsUrl(url)) return false
  if (isDirectVisualFile(url) && !isOwnedNativeVideoUrl(url)) return false
  if (parseYouTubeVideoId(url)) return true
  if (parseVimeoVideoId(url)) return true
  if (parseDailymotionVideoId(url)) return true
  return isEmbedPlayerUrl(url)
}

export function hasPlayableVisualVideo(
  post: VisualVideoCandidate | null | undefined
): boolean {
  if (!post || typeof post !== 'object') return false
  const urls = collectCandidateUrls(post)
  if (urls.length === 0) return false
  return urls.some((url) => isSupportedEmbedUrl(url) || isSupportedVisualNativeUrl(url))
}

export function getVisualVideoDedupKey(
  post: VisualVideoCandidate | null | undefined
): string | null {
  if (!post) return null
  const urls = collectCandidateUrls(post)
  for (const url of urls) {
    const yt = parseYouTubeVideoId(url)
    if (yt) return `yt:${yt}`
  }
  for (const url of urls) {
    const vimeo = parseVimeoVideoId(url)
    if (vimeo) return `vimeo:${vimeo}`
    const dm = parseDailymotionVideoId(url)
    if (dm) return `dailymotion:${dm}`
  }
  for (const url of urls) {
    if (isSupportedEmbedUrl(url) || isSupportedVisualNativeUrl(url)) {
      return `url:${normalizePlayableUrl(url)}`
    }
  }
  return null
}

export function normalizePlayableUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.hash = ''
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase()
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'si', 'feature'].forEach(
      (key) => parsed.searchParams.delete(key)
    )
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    const search = parsed.searchParams.toString()
    return `${parsed.protocol}//${parsed.hostname}${path}${search ? `?${search}` : ''}`
  } catch {
    return url.trim().toLowerCase()
  }
}
