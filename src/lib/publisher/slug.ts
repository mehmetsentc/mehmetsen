import { transliterateTurkish } from '@/lib/location'

/** Turkish-aware URL-safe slug for publisher names. */
export function slugifyPublisherName(name: string): string {
  const normalized = transliterateTurkish(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized.slice(0, 80) || 'yayin'
}

/** Append numeric suffix on collision: hurriyet → hurriyet-2 */
export function publisherSlugWithSuffix(base: string, suffix: number): string {
  const clean = base.replace(/-\d+$/, '')
  return suffix <= 1 ? clean : `${clean}-${suffix}`
}

/**
 * Pick first available slug from candidates.
 * `isTaken` should return true when slug exists in DB.
 */
export async function resolveUniquePublisherSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<{ slug: string; collision: boolean }> {
  const base = slugifyPublisherName(name)
  for (let i = 1; i <= 50; i++) {
    const candidate = publisherSlugWithSuffix(base, i)
    if (!(await isTaken(candidate))) {
      return { slug: candidate, collision: i > 1 }
    }
  }
  const fallback = `${base}-${Date.now().toString(36).slice(-6)}`
  return { slug: fallback.slice(0, 120), collision: true }
}
