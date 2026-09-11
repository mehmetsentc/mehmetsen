export function parseNewsImageHostname(src: string): string | null {
  try {
    const raw = src.startsWith('//') ? `https:${src}` : src
    if (raw.startsWith('/')) return null
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Fail-closed: next/image defaultLoader throws during render for any
 * hostname missing from remotePatterns. Live RSS hosts (evrensel.net,
 * sozcucdn, apex sozcu.com.tr, …) cannot stay synced with that list, so
 * only same-origin site-relative paths may use next/image.
 */
export function shouldUseNextImage(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false
  return trimmed.startsWith('/') && !trimmed.startsWith('//')
}
