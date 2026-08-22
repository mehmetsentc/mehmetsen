const MAX_TAGS = 8
const MAX_TAG_LENGTH = 30

/** Strip leading `#` (and optional whitespace) from a raw tag label. */
export function stripTagPrefix(raw: string): string {
  return raw.trim().replace(/^#+\s*/, '')
}

/**
 * URL-safe tag slug for `/etiket/[slug]` routes.
 * Keeps Turkish letters; spaces become hyphens.
 */
export function tagToSlug(raw: string): string {
  return stripTagPrefix(raw)
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Decode a URL segment and normalize to the canonical tag slug. */
export function parseTagSlug(urlSlug: string): string {
  let decoded = urlSlug.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // Keep raw segment when decode fails (malformed % sequences).
  }
  return tagToSlug(decoded)
}

/** Whether a slug is safe to serve on public tag pages. */
export function isValidTagSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_TAG_LENGTH && /^[\p{L}\p{N}_-]+$/u.test(slug)
}

/** Firestore lookup variants for a tag slug or raw stored tag. */
export function tagLookupVariants(raw: string): string[] {
  const cleaned = stripTagPrefix(raw).trim()
  if (!cleaned) return []

  const slug = tagToSlug(cleaned)
  const spaced = slug.replace(/-/g, ' ')
  const variants = new Set<string>()

  for (const candidate of [cleaned, slug, spaced]) {
    if (!candidate) continue
    const lower = candidate.toLocaleLowerCase('tr-TR')
    variants.add(lower)
    variants.add(candidate)
    if (lower.length > 0) {
      variants.add(lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1))
    }
  }

  return [...variants]
}

export function normalizeTag(raw: string): string | null {
  const tag = stripTagPrefix(raw).toLocaleLowerCase('tr-TR')
  if (!tag || tag.length > MAX_TAG_LENGTH) return null
  if (!/^[\p{L}\p{N}_-]+$/u.test(tag)) return null
  return tag
}

export function parseTagsInput(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map(normalizeTag)
    .filter((tag): tag is string => Boolean(tag))
}

export function addTag(current: string[], raw: string): string[] {
  const tag = normalizeTag(raw)
  if (!tag || current.includes(tag) || current.length >= MAX_TAGS) return current
  return [...current, tag]
}

export function removeTag(current: string[], tag: string): string[] {
  return current.filter((t) => t !== tag)
}

export function formatTagLabel(tag: string): string {
  const clean = stripTagPrefix(tag)
  return clean ? `#${clean}` : '#'
}
