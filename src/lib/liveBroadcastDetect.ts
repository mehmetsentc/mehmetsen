/**
 * Shared live-broadcast / shorts / video-only detection for ingest filters.
 * Pure live streams and source-video redirects are not usable articles on NaHaber.
 */

const CANLI_TITLE_PATTERNS: RegExp[] = [
  /#\s*canlı/i,
  /#\s*canli/i,
  /#\s*shorts?\b/i,
  /\bcanlı\s*yayın/i,
  /\bcanli\s*yayin/i,
  /\bcanlıyayın/i,
  /\bcanliyayin/i,
  /\bcanlı\s*takip/i,
  /\bcanlı\s*anlatım/i,
  /\bcanlı\s*blog/i,
  /\bcanlı\s*izle(?:yin)?\b/i,
  /\/\s*#\s*canlı/i,
  /\bankacanl[ıi]\b/i,
  /#\s*ankacanl[ıi]/i,
]

/** Ongoing live-event phrasing (present continuous) — not past-tense news. */
const LIVE_EVENT_TITLE_PATTERNS: RegExp[] = [
  /\baçıklama\s+yapıyor\b/i,
  /\bkonuşma\s+yapıyor\b/i,
  /\bkonuşuyor\b/i,
  /\baçıklıyor\b/i,
  /\bbasın\s+toplantısı\s+(?:düzenliyor|düzenleniyor|yapıyor|yapılıyor|gerçekleştiriyor|gerçekleştiriliyor|veriyor|veriliyor)\b/i,
]

const YOUTUBE_LIVE_URL = /youtube\.com\/(?:live|watch)|youtu\.be\//i

export function isLiveBroadcastTitle(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  if (CANLI_TITLE_PATTERNS.some((p) => p.test(t))) return true
  if (LIVE_EVENT_TITLE_PATTERNS.some((p) => p.test(t))) return true

  const lower = t.toLowerCase()
  if (
    lower.includes('canlı') &&
    (lower.startsWith('canlı') ||
      lower.includes(' yayın') ||
      lower.endsWith('#canlı') ||
      lower.endsWith('# canlı') ||
      lower.includes('canlıda '))
  ) {
    return true
  }

  return false
}

export function isLiveBroadcastContent(
  title: string,
  content?: string,
  summary?: string
): boolean {
  if (isLiveBroadcastTitle(title)) return true

  const body = `${content ?? ''} ${summary ?? ''}`.toLowerCase()
  if (!body.trim()) return false

  if (CANLI_TITLE_PATTERNS.some((p) => p.test(body))) return true

  if (
    YOUTUBE_LIVE_URL.test(body) &&
    (body.includes('canlı') || body.includes('canliyayin') || body.includes('canlıyayın'))
  ) {
    return true
  }

  return false
}

/** YouTube RSS: skip live/shorts and video-only stubs with no article body. */
export function shouldSkipYouTubeRssEntry(
  title: string,
  description: string,
  opts?: { minDescriptionChars?: number }
): { skip: boolean; reason?: string } {
  if (isLiveBroadcastTitle(title)) {
    return { skip: true, reason: 'live_or_shorts_title' }
  }
  if (isLiveBroadcastContent(title, description)) {
    return { skip: true, reason: 'live_broadcast_body' }
  }

  const desc = description.replace(/\s+/g, ' ').trim()
  const min = opts?.minDescriptionChars ?? 80
  if (desc.length < min) {
    return { skip: true, reason: 'video_only_thin_body' }
  }

  // Description is mostly channel boilerplate + watch URL — still not an article
  const withoutUrls = desc
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(subscribe|abone|bildirim|notification)\b/gi, '')
    .trim()
  if (withoutUrls.length < min) {
    return { skip: true, reason: 'video_only_thin_body' }
  }

  return { skip: false }
}
