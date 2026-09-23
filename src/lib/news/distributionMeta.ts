import { slugifyNewsTitle } from '@/lib/newsSlug'

export const SOCIAL_HEADLINE_MAX = 100
export const SOCIAL_SUMMARY_MAX = 200
export const SOCIAL_CAPTION_MAX = 700
export const PUSH_TITLE_MAX = 60
export const PUSH_TEXT_MAX = 120
export const MEDIA_ALT_MAX = 140
export const MEDIA_FILENAME_MAX = 120
export const READING_TIME_MIN = 1
export const READING_TIME_MAX = 30

export type DistributionMediaKind = 'image' | 'video'

export interface DistributionMediaMeta {
  url: string
  kind: DistributionMediaKind
  alt: string
  filename: string
}

export interface DistributionFields {
  socialHeadline: string
  socialStorySummary: string
  socialCaption: string
  pushTitle: string
  pushText: string
  imageAlt: string
  imageFilename: string
  videoAlt: string
  videoFilename: string
  readingTimeMinutes: number
  mediaMeta: DistributionMediaMeta[]
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v'])

export function pickTrimmedString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

export function clampDistributionText(text: string, max: number): string {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  if (sentence > max * 0.55) return cut.slice(0, sentence + 1).trim()
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim()
}

export function estimateReadingTimeMinutes(text: string): number {
  const words = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(READING_TIME_MIN, Math.min(READING_TIME_MAX, Math.ceil((words || 1) / 200)))
}

export function parseReadingTimeMinutes(value: unknown, fallbackText = ''): number {
  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value.replace(/[^\d]/g, ''), 10)
        : Number.NaN
  if (Number.isFinite(raw) && raw >= READING_TIME_MIN) {
    return Math.max(READING_TIME_MIN, Math.min(READING_TIME_MAX, Math.round(raw)))
  }
  return estimateReadingTimeMinutes(fallbackText)
}

export function defaultMediaExtension(kind: DistributionMediaKind): string {
  return kind === 'video' ? 'mp4' : 'jpg'
}

export function inferMediaKind(url: string, fallback: DistributionMediaKind = 'image'): DistributionMediaKind {
  const ext = extensionFromName(url)
  if (ext && VIDEO_EXT.has(ext)) return 'video'
  if (ext && IMAGE_EXT.has(ext)) return 'image'
  return fallback
}

function extensionFromName(value: string): string {
  const clean = value.split('?')[0]?.split('#')[0] ?? value
  const match = clean.match(/\.([a-z0-9]{2,5})$/i)
  return match?.[1]?.toLowerCase() ?? ''
}

export function buildMediaFilename(
  title: string,
  kind: DistributionMediaKind,
  index = 0,
  preferredExt?: string
): string {
  const base = slugifyNewsTitle(title || 'haber').slice(0, 70) || 'haber'
  const suffix = index > 0 ? `-${index + 1}` : ''
  const ext = preferredExt && isAllowedExt(preferredExt, kind) ? preferredExt : defaultMediaExtension(kind)
  return `${base}${suffix}.${ext}`.slice(0, MEDIA_FILENAME_MAX)
}

function isAllowedExt(ext: string, kind: DistributionMediaKind): boolean {
  const clean = ext.replace(/^\./, '').toLowerCase()
  return kind === 'video' ? VIDEO_EXT.has(clean) : IMAGE_EXT.has(clean)
}

export function normalizeMediaFilename(
  raw: string,
  kind: DistributionMediaKind,
  fallbackTitle: string,
  index = 0
): string {
  const trimmed = raw.trim().toLowerCase()
  const ext = extensionFromName(trimmed)
  const withoutExt = trimmed.replace(/\.[a-z0-9]{2,5}$/i, '')
  const slug = slugifyNewsTitle(withoutExt.replace(/[_]+/g, ' '))
  if (!slug || slug === 'haber') {
    return buildMediaFilename(fallbackTitle, kind, index, ext || undefined)
  }
  const safeExt = isAllowedExt(ext, kind) ? ext : defaultMediaExtension(kind)
  return `${slug}.${safeExt}`.slice(0, MEDIA_FILENAME_MAX)
}

export function normalizeMediaAlt(raw: string, fallback: string): string {
  return clampDistributionText(raw || fallback, MEDIA_ALT_MAX)
}

function asMediaMetaList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []
}

export function resolveDistributionFields(input: {
  parsed?: Record<string, unknown> | null
  title: string
  spot?: string
  summary?: string
  content?: string
  imageUrls?: string[]
  videoUrls?: string[]
  imageAnalyses?: Array<{ url: string; alt?: string; caption?: string }>
}): DistributionFields {
  const parsed = input.parsed ?? {}
  const title = input.title.trim()
  const spot = (input.spot ?? '').trim()
  const summary = (input.summary ?? '').trim()
  const content = (input.content ?? '').trim()
  const imageUrls = (input.imageUrls ?? []).map((url) => url.trim()).filter(Boolean)
  const videoUrls = (input.videoUrls ?? []).map((url) => url.trim()).filter(Boolean)
  const analyses = input.imageAnalyses ?? []

  const socialHeadline = clampDistributionText(
    pickTrimmedString(parsed.socialHeadline, parsed.socialTitle, title),
    SOCIAL_HEADLINE_MAX
  )
  const socialStorySummary = clampDistributionText(
    pickTrimmedString(parsed.socialStorySummary, parsed.socialDescription, spot, summary),
    SOCIAL_SUMMARY_MAX
  )
  const socialCaption = clampDistributionText(
    pickTrimmedString(parsed.socialCaption, parsed.socialDescription, summary, spot),
    SOCIAL_CAPTION_MAX
  )
  const pushTitle = clampDistributionText(
    pickTrimmedString(parsed.pushTitle, socialHeadline, title),
    PUSH_TITLE_MAX
  )
  const pushText = clampDistributionText(
    pickTrimmedString(parsed.pushText, parsed.pushBody, socialStorySummary, spot, summary),
    PUSH_TEXT_MAX
  )
  const readingTimeMinutes = parseReadingTimeMinutes(
    parsed.readingTimeMinutes ?? parsed.readingTime,
    `${title} ${spot} ${content}`
  )

  const parsedMedia = asMediaMetaList(parsed.mediaMeta)
  const mediaMeta: DistributionMediaMeta[] = []

  imageUrls.forEach((url, index) => {
    const fromAi = parsedMedia.find((item) => String(item.url ?? '').trim() === url)
    const analysis = analyses.find((item) => item.url === url)
    const kind: DistributionMediaKind = 'image'
    mediaMeta.push({
      url,
      kind,
      alt: normalizeMediaAlt(
        pickTrimmedString(fromAi?.alt, index === 0 ? parsed.imageAlt : '', analysis?.alt, analysis?.caption, title),
        title
      ),
      filename: normalizeMediaFilename(
        pickTrimmedString(fromAi?.filename, index === 0 ? parsed.imageFilename : ''),
        kind,
        title,
        index
      ),
    })
  })

  videoUrls.forEach((url, index) => {
    const fromAi = parsedMedia.find((item) => String(item.url ?? '').trim() === url)
    mediaMeta.push({
      url,
      kind: 'video',
      alt: normalizeMediaAlt(
        pickTrimmedString(fromAi?.alt, index === 0 ? parsed.videoAlt : '', `${title} videosu`),
        `${title} videosu`
      ),
      filename: normalizeMediaFilename(
        pickTrimmedString(fromAi?.filename, index === 0 ? parsed.videoFilename : ''),
        'video',
        title,
        index
      ),
    })
  })

  const cover = mediaMeta.find((item) => item.kind === 'image')
  const video = mediaMeta.find((item) => item.kind === 'video')

  return {
    socialHeadline,
    socialStorySummary,
    socialCaption,
    pushTitle,
    pushText,
    imageAlt: cover?.alt || normalizeMediaAlt(pickTrimmedString(parsed.imageAlt, title), title),
    imageFilename:
      cover?.filename ||
      normalizeMediaFilename(pickTrimmedString(parsed.imageFilename), 'image', title, 0),
    videoAlt: video?.alt || normalizeMediaAlt(pickTrimmedString(parsed.videoAlt), videoUrls[0] ? `${title} videosu` : ''),
    videoFilename:
      video?.filename ||
      (videoUrls[0]
        ? normalizeMediaFilename(pickTrimmedString(parsed.videoFilename), 'video', title, 0)
        : ''),
    readingTimeMinutes,
    mediaMeta,
  }
}

export function persistableDistributionFields(fields: DistributionFields): Record<string, unknown> {
  return {
    socialHeadline: fields.socialHeadline,
    socialStorySummary: fields.socialStorySummary,
    socialCaption: fields.socialCaption,
    pushTitle: fields.pushTitle,
    pushText: fields.pushText,
    imageAlt: fields.imageAlt,
    imageFilename: fields.imageFilename,
    videoAlt: fields.videoAlt,
    videoFilename: fields.videoFilename,
    readingTimeMinutes: fields.readingTimeMinutes,
  }
}
