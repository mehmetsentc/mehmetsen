import { resolveLocalNewsCitySlug } from '@/constants/cities'
import { computeEngagementScore } from '@/lib/engagementScore'
import { shouldShowBreakingBadge, shouldShowTrendingFlag } from '@/lib/newsBreaking'
import type { TimelinePost } from '@/types/post'

export const YEREL_HABER_CATEGORY = 'yerel-haber'

/** National / non-local categories — must not appear in Yerel Haber feed. */
const NATIONAL_ONLY_CATEGORIES = new Set([
  'gundem',
  'son-dakika',
  'dunya',
  'ekonomi',
  'spor',
  'magazin',
  'teknoloji',
  'saglik',
  'siyaset',
  'kultur',
  'bilim',
])

/** True when a post belongs in the Yerel Haber category view. */
export function isYerelHaberEligible(post: TimelinePost): boolean {
  const cat = post.categoryId?.trim().toLowerCase() ?? ''
  const citySlug = post.citySlug?.trim()

  if (NATIONAL_ONLY_CATEGORIES.has(cat)) return false

  if (cat === YEREL_HABER_CATEGORY) return Boolean(citySlug)

  return Boolean(citySlug)
}

export interface FeedPersonalization {
  citySlug?: string | null
  favoriteCategories?: string[]
  interests?: string[]
  followingUsernames?: Set<string>
}

const CATEGORY_BOOST = 80
const INTEREST_BOOST = 50
const FOLLOWING_BOOST = 40
const TRENDING_THRESHOLD = 25

/** Sort tiers — higher wins. Pinned breaking first, then local, breaking, trending, national. */
const TIER_PINNED = 5
const TIER_LOCAL = 4
const TIER_BREAKING = 3
const TIER_TRENDING = 2
const TIER_NATIONAL = 1

function matchesInterest(post: TimelinePost, interests: string[]): boolean {
  if (interests.length === 0) return false
  const haystack = [
    post.title,
    post.summary,
    post.content,
    post.categoryId,
    ...(post.tags ?? []),
    post.citySlug ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR')

  return interests.some((term) => {
    const t = term.trim().toLocaleLowerCase('tr-TR')
    return t.length > 1 && haystack.includes(t)
  })
}

export function isLocalFeedItem(post: TimelinePost, userCitySlug?: string | null): boolean {
  const rawCity = userCitySlug?.trim().toLowerCase()
  if (!rawCity) return false

  const provinceSlug = resolveLocalNewsCitySlug(rawCity)
  const postCity = post.citySlug?.trim().toLowerCase()
  const isYerelCategory = post.categoryId?.trim().toLowerCase() === YEREL_HABER_CATEGORY

  if (postCity === rawCity || postCity === provinceSlug) {
    return isYerelCategory || Boolean(postCity)
  }

  if (rawCity !== provinceSlug) {
    const haystack = [
      post.title,
      post.summary,
      post.content,
      ...(post.tags ?? []),
    ]
      .join(' ')
      .toLocaleLowerCase('tr-TR')
    const districtLabel = rawCity.replace(/-/g, ' ')
    if (haystack.includes(districtLabel) || haystack.includes(rawCity)) {
      return isYerelCategory
    }
  }

  return false
}

function resolveTier(post: TimelinePost, citySlug: string): number {
  if ((post as TimelinePost & { isPinned?: boolean }).isPinned) {
    return TIER_PINNED
  }
  if (citySlug && isLocalFeedItem(post, citySlug)) {
    return TIER_LOCAL
  }
  if (shouldShowBreakingBadge(post)) {
    return TIER_BREAKING
  }
  if (shouldShowTrendingFlag(post) || computeEngagementScore(post) >= TRENDING_THRESHOLD) {
    return TIER_TRENDING
  }
  return TIER_NATIONAL
}

/**
 * Rank feed: local city → breaking → trending engagement → national recency.
 * Applied client-side after chronological fetch.
 */
export function rankFeedPosts(posts: TimelinePost[], prefs: FeedPersonalization = {}): TimelinePost[] {
  const citySlug = prefs.citySlug?.trim().toLowerCase() ?? ''
  const categories = new Set((prefs.favoriteCategories ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))
  const interests = (prefs.interests ?? []).map((i) => i.trim().toLowerCase()).filter(Boolean)
  const following = prefs.followingUsernames ?? new Set<string>()

  const scored = posts.map((post) => {
    const tier = resolveTier(post, citySlug)
    let boost = 0

    if (categories.size > 0 && categories.has(post.categoryId?.toLowerCase() ?? '')) {
      boost += CATEGORY_BOOST
    }

    if (matchesInterest(post, interests)) {
      boost += INTEREST_BOOST
    }

    if (following.has(post.authorUsername.toLowerCase())) {
      boost += FOLLOWING_BOOST
    }

    const engagement = computeEngagementScore(post)
    const breakingPriority = shouldShowBreakingBadge(post)
      ? Math.min(
          100,
          Math.max(
            1,
            (post as TimelinePost & { breakingScore?: number }).breakingScore ??
              post.priorityScore ??
              50
          )
        )
      : 0
    const recency = new Date(post.publishedAt ?? post.createdAt).getTime()

    const score =
      tier * 1_000_000_000_000 +
      breakingPriority * 1_000_000_000 +
      boost * 1_000_000 +
      Math.min(engagement, 200) * 10_000 +
      recency / 1_000

    return { post, score }
  })

  return scored.sort((a, b) => b.score - a.score).map((s) => s.post)
}

/** Client filter for the Yerel Haber category chip — local news only, no national gündem mix-in. */
export function filterYerelHaberPosts(
  posts: TimelinePost[],
  userCitySlug?: string | null
): TimelinePost[] {
  const eligible = posts.filter(isYerelHaberEligible)

  if (!userCitySlug?.trim()) return eligible

  const rawCity = userCitySlug.trim().toLowerCase()
  const provinceSlug = resolveLocalNewsCitySlug(rawCity)

  const localMatches = eligible.filter((post) => {
    const postCity = post.citySlug?.trim().toLowerCase()
    if (postCity === rawCity || postCity === provinceSlug) return true

    if (rawCity !== provinceSlug) {
      const haystack = [post.title, post.summary, ...(post.tags ?? [])]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
      const districtLabel = rawCity.replace(/-/g, ' ')
      if (haystack.includes(districtLabel) || haystack.includes(rawCity)) return true
    }

    return false
  })

  if (localMatches.length > 0) return localMatches
  return eligible
}
