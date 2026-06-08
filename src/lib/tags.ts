const MAX_TAGS = 8
const MAX_TAG_LENGTH = 30

export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').toLowerCase()
  if (!tag || tag.length > MAX_TAG_LENGTH) return null
  if (!/^[\p{L}\p{N}_]+$/u.test(tag)) return null
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
  return `#${tag}`
}
