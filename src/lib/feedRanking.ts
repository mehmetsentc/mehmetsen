import { resolveLocalNewsCitySlug } from '@/constants/cities'
import { computeEngagementScore } from '@/lib/engagementScore'
import { shouldShowBreakingBadge, shouldShowTrendingFlag } from '@/lib/newsBreaking'
import type { TimelinePost } from '@/types/post'
import type { NewsItem } from '@/types/newsItem'

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
  // Hava durumu, meteoroloji — ulusal kaynaklı, şehir adı geçse bile yerel haber değil
  'meteoroloji',
  'hava-durumu',
  'hava',
  'cevre',
  // Finans / kripto — ulusal/global konu
  'finans',
  'kripto',
  'borsa',
  // Diğer ulusal kategoriler
  'otomobil',
  'gastronomi',
  'yasam',
  'eglence',
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

    if (post.authorUsername && following.has(post.authorUsername.toLowerCase())) {
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

// ────────────────────────────────────────────────────────────────────────────
//  HOME FEED "HOT" RANKING (server-side, NewsItem-based)
// ────────────────────────────────────────────────────────────────────────────
//
//  HN/Reddit benzeri log-scaled popülarite + zaman bozunumlu skor.
//  Ana sayfa "Akış" ve "Şu An Trend" rail'inde kullanılır; en çok okunan
//  haberlerin feed'in ilk sıralarına çıkmasını sağlar.
//
//  Tasarım hedefleri:
//  - Çok okunan haberler tepeye çıksın (engagement log-scaled, viral haberler
//    feed'i ezmesin — log10 ile saturate olur).
//  - Yeni haberler her zaman görünür kalsın (freshness puanı her 6 saatte
//    1 puan düşer; viral haberler bile 24 saatten sonra bayatlar).
//  - Editöryal sinyaller (featured / breaking) ufak boost alır.

const HOT_VIEW_WEIGHT = 1
const HOT_LIKE_WEIGHT = 5
const HOT_COMMENT_WEIGHT = 12
const HOT_SHARE_WEIGHT = 3

const HOT_FRESHNESS_HALF_LIFE_HOURS = 6
const HOT_FEATURED_BOOST = 0.4
const HOT_BREAKING_BOOST = 1.0

const HOT_ONE_HOUR_MS = 60 * 60 * 1000
const HOT_MAX_AGE_HOURS = 7 * 24

export interface HotScoreInputs {
  views?: number
  likesCount?: number
  commentsCount?: number
  sharesCount?: number
  publishedAt?: number | string | null
  featured?: boolean
  breaking?: boolean
}

function parseHotPublishedAtMs(publishedAt: HotScoreInputs['publishedAt']): number | null {
  if (publishedAt == null) return null
  if (typeof publishedAt === 'number') {
    return Number.isFinite(publishedAt) && publishedAt > 0 ? publishedAt : null
  }
  const parsed = Date.parse(publishedAt)
  return Number.isFinite(parsed) ? parsed : null
}

export function getHotAgeHours(
  publishedAt: HotScoreInputs['publishedAt'],
  now: number = Date.now()
): number {
  const ms = parseHotPublishedAtMs(publishedAt)
  if (ms == null) return HOT_MAX_AGE_HOURS
  return Math.max(0, (now - ms) / HOT_ONE_HOUR_MS)
}

/**
 * Tek bir haber için "hot" skoru.
 *
 *   engagement = views + 5*likes + 12*comments + 3*shares
 *   hot        = log10(max(engagement, 1) + 1)
 *              + boost (featured / breaking)
 *              - ageHours / 6
 */
export function computeHotScore(input: HotScoreInputs, now: number = Date.now()): number {
  const views = Math.max(0, input.views ?? 0)
  const likes = Math.max(0, input.likesCount ?? 0)
  const comments = Math.max(0, input.commentsCount ?? 0)
  const shares = Math.max(0, input.sharesCount ?? 0)

  const engagement =
    views * HOT_VIEW_WEIGHT +
    likes * HOT_LIKE_WEIGHT +
    comments * HOT_COMMENT_WEIGHT +
    shares * HOT_SHARE_WEIGHT

  const popularity = Math.log10(Math.max(engagement, 1) + 1)
  const ageHours = getHotAgeHours(input.publishedAt, now)
  const freshness = -(ageHours / HOT_FRESHNESS_HALF_LIFE_HOURS)

  const boost =
    (input.featured ? HOT_FEATURED_BOOST : 0) +
    (input.breaking ? HOT_BREAKING_BOOST : 0)

  return popularity + freshness + boost
}

/**
 * NewsItem dizisini hot skoruna göre stabil sırada (yüksekten düşüğe) sıralar.
 * Aynı skorlu haberlerde yeni olan üstte kalır (deterministic tie-break).
 */
export function rankByHotness<T extends HotScoreInputs>(
  items: readonly T[],
  now: number = Date.now()
): T[] {
  return [...items]
    .map((item) => ({ item, score: computeHotScore(item, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aMs = parseHotPublishedAtMs(a.item.publishedAt) ?? 0
      const bMs = parseHotPublishedAtMs(b.item.publishedAt) ?? 0
      return bMs - aMs
    })
    .map(({ item }) => item)
}

export interface TrendingFilters {
  /** Trending'e dahil edilecek en eski haber yaşı (saat). Default: 72. */
  maxAgeHours?: number
  /** Görseli olmayan haberler ana feed başında kötü görünür; default true. */
  requireImage?: boolean
  /** Breaking haberler ayrı bölümde sunulduğu için trending'den çıkarılır; default true. */
  excludeBreaking?: boolean
  /** Hot score için minimum engagement eşiği (views+likes+comments). Default: 5. */
  minEngagement?: number
}

/**
 * "Şu an trend" listesi — sıkı filtre ile pool'dan top N hot haber.
 * Akış için `rankFeedHotAware` kullan.
 */
export function pickTrending(
  pool: readonly NewsItem[],
  limit: number,
  filters: TrendingFilters = {},
  now: number = Date.now()
): NewsItem[] {
  const {
    maxAgeHours = 72,
    requireImage = true,
    excludeBreaking = true,
    minEngagement = 5,
  } = filters

  const candidates = pool.filter((item) => {
    if (excludeBreaking && (item.breaking === true || item.category === 'son-dakika')) return false
    if (requireImage && !item.imageUrl) return false
    const age = getHotAgeHours(item.publishedAt, now)
    if (age > maxAgeHours) return false
    const engagement = (item.views ?? 0) + (item.likesCount ?? 0) + (item.commentsCount ?? 0)
    return engagement >= minEngagement
  })

  return rankByHotness(candidates, now).slice(0, limit)
}

/**
 * Ana feed için "hibrit" sıralama: son `hotWindowHours` (default 72) saatlik
 * haberler hot skoruna göre tepede, daha eski haberler kronolojik düzende
 * altta kalır.
 *
 * Bu sayede:
 * - Çok okunan ama 12 saatlik haber feed'in başında çıkar (kullanıcı istemi).
 * - Bayatlamış (3 gün+) haberler engagement'ı yüksek olsa bile akışı domine
 *   etmez.
 * - Pool'a yeni eklenmiş haberler freshness puanı ile yine üstte görünür
 *   şansı bulur.
 */
export function rankFeedHotAware(
  pool: readonly NewsItem[],
  now: number = Date.now(),
  hotWindowHours: number = 72
): NewsItem[] {
  const hotWindow: NewsItem[] = []
  const stale: NewsItem[] = []

  for (const item of pool) {
    const age = getHotAgeHours(item.publishedAt, now)
    if (age <= hotWindowHours) hotWindow.push(item)
    else stale.push(item)
  }

  const rankedHot = rankByHotness(hotWindow, now)
  return [...rankedHot, ...stale]
}
