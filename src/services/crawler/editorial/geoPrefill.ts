import { TURKISH_PROVINCES } from '@/constants/cities'

export function matchCitySlug(city: string | null | undefined): string | null {
  const raw = (city || '').trim()
  if (!raw) return null
  const lower = raw.toLocaleLowerCase('tr-TR')
  const hit = TURKISH_PROVINCES.find(
    (p) => p.name.toLocaleLowerCase('tr-TR') === lower || p.slug === lower
  )
  return hit?.slug ?? null
}
