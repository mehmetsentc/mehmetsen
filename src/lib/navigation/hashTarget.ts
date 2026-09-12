/** Decode a URL hash into a document element id. Empty / bare `#` → null. */
export function hashTargetId(hash: string): string | null {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
