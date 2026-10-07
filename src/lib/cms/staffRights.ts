/**
 * Phase 2D — per-editor rights inside a section (decided 2026-10-07):
 * six rights, each granted one by one; a new section starts with NO rights.
 * Pure helpers shared by server enforcement and the admin UI.
 */
export const STAFF_RIGHTS = ['create', 'edit', 'info', 'media', 'publish', 'ads'] as const
export type StaffRight = (typeof STAFF_RIGHTS)[number]

export const STAFF_RIGHT_LABELS: Readonly<Record<StaffRight, string>> = {
  create: 'Haber ekleme',
  edit: 'Metin düzenleme',
  info: 'Bilgi ekleme',
  media: 'Resim/video ekleme',
  publish: 'Onaylama/yayınlama',
  ads: 'Reklam ekleme',
}

export function isStaffRight(v: unknown): v is StaffRight {
  return typeof v === 'string' && (STAFF_RIGHTS as readonly string[]).includes(v)
}

/** Görsel / video alanları. */
const MEDIA_FIELDS = new Set([
  'thumbnail', 'coverImageUrl', 'imageCaption', 'imageAlt', 'imageFilename',
  'videoUrl', 'videoAlt', 'videoFilename', 'additionalImages', 'mediaItems', 'images',
])
/** Bilgi: özet, etiket, konum, kategori, SEO, sosyal/push metinleri, kaynaklar. */
const INFO_FIELDS = new Set([
  'summary', 'seoTitle', 'seoDescription', 'seoKeywords', 'tags', 'categoryId', 'countryCategoryId',
  'citySlug', 'city', 'districtSlug', 'district', 'countrySlug', 'country', 'location',
  'socialHeadline', 'socialStorySummary', 'socialCaption', 'pushTitle', 'pushText',
  'readingTimeMinutes', 'aiResearchSources', 'sourceUrl', 'sourceLabel', 'originalTitle',
])
/** Metin: başlık, spot, gövde, düzen. */
const EDIT_FIELDS = new Set([
  'title', 'slug', 'spot', 'content', 'bodyBlocks', 'articleLayout', 'articleFormat',
  'isLiveBlog', 'liveUpdates',
])
/** Yayın kararı. */
const PUBLISH_FIELDS = new Set(['featured', 'localFeatured', 'isBreaking'])
/** Request plumbing that carries no content. */
const NEUTRAL_FIELDS = new Set(['draftId'])

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

function norm(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (Array.isArray(v) && v.length === 0) return ''
  if (typeof v === 'string') return v.trim()
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Rights an UPDATE body needs. The CMS editor resends every field on save, so only
 * fields whose value DIFFERS from the stored document count (`existing`).
 * Unknown fields need `edit` (fail closed).
 */
export function requiredRightsForUpdate(
  body: Record<string, unknown>,
  existing?: Record<string, unknown> | null
): Set<StaffRight> {
  const need = new Set<StaffRight>()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || NEUTRAL_FIELDS.has(key)) continue
    if (existing && norm(existing[key]) === norm(value)) continue
    if (key === 'status') {
      const s = String(value ?? '').trim()
      need.add(s === 'published' || s === 'archived' || s === 'banned' ? 'publish' : 'edit')
    } else if (PUBLISH_FIELDS.has(key)) {
      if (value) need.add('publish')
    } else if (MEDIA_FIELDS.has(key)) need.add('media')
    else if (INFO_FIELDS.has(key)) need.add('info')
    else need.add('edit')
  }
  return need
}

/** Rights a CREATE body needs: `create`, plus media / publish when used. */
export function requiredRightsForCreate(body: Record<string, unknown>): Set<StaffRight> {
  const need = new Set<StaffRight>(['create'])
  for (const key of MEDIA_FIELDS) if (!isEmpty(body[key])) need.add('media')
  if (String(body.status ?? '').trim() === 'published') need.add('publish')
  for (const key of PUBLISH_FIELDS) if (body[key]) need.add('publish')
  return need
}
