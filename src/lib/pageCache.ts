import { CACHE_TTL } from '@/lib/clientCache'

/** Client cache keys for instant page re-entry (stale-while-revalidate). */
export const PAGE_CACHE_KEYS = {
  discover: 'page:discover:v1',
  influencer: 'page:influencer:v1',
  saved: (userId: string) => `page:saved:${userId}:v1`,
  category: (categoryId: string) => `page:category:${categoryId}:v1`,
  local: (citySlug: string) => `page:local:${citySlug}:v1`,
  weather: (city: string) => `page:weather:${city}:v1`,
} as const

export const PAGE_CACHE_TTL = {
  discover: CACHE_TTL.DEFAULT,
  influencer: CACHE_TTL.DEFAULT,
  saved: CACHE_TTL.SHORT,
  category: CACHE_TTL.DEFAULT,
  local: CACHE_TTL.DEFAULT,
  weather: CACHE_TTL.LONG,
} as const
