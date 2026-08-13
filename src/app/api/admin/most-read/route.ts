import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasPermission } from '@/types/cms'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  DEFAULT_CATEGORIES,
  YEREL_HABER_CATEGORY_ID,
  getYerelSubcategoryShortLabel,
  isYerelCategoryTree,
  getParentCategory,
} from '@/constants/config'
import { addTurkeyDays, turkeyDayBounds, turkeyYmdNow } from '@/lib/turkeyCalendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Period = 'all' | '7d' | '30d' | '90d'
type Scope = 'all' | 'yerel' | 'national'

const SAMPLE_LIMIT = 500
const TOP_POSTS_LIMIT = 40
const TOP_CATEGORIES_LIMIT = 12

interface RawPost {
  id: string
  title: string
  slug: string
  categoryId: string
  viewsCount: number
  citySlug: string | null
  publishedAtMs: number
  coverUrl: string | null
}

function parsePeriod(raw: string | null): Period {
  if (raw === '7d' || raw === '30d' || raw === '90d' || raw === 'all') return raw
  return 'all'
}

function parseScope(raw: string | null): Scope {
  if (raw === 'yerel' || raw === 'national' || raw === 'all') return raw
  return 'all'
}

function periodStartMs(period: Period): number | null {
  if (period === 'all') return null
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const ymd = addTurkeyDays(turkeyYmdNow(), -(days - 1))
  return turkeyDayBounds(ymd).startMs
}

function categoryLabel(categoryId: string): string {
  const id = categoryId?.trim() || 'genel'
  const def = DEFAULT_CATEGORIES.find((c) => c.id === id)
  if (!def) return id.replace(/-/g, ' ')
  if (isYerelCategoryTree(id) && def.parentId) {
    return `Yerel · ${getYerelSubcategoryShortLabel(def)}`
  }
  return def.name
}

function parentBucketId(categoryId: string): string {
  const id = categoryId?.trim() || 'genel'
  if (isYerelCategoryTree(id)) return YEREL_HABER_CATEGORY_ID
  const parent = getParentCategory(id)
  return parent?.id ?? id
}

function toMs(value: unknown): number {
  if (!value) return 0
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate()
      return d?.getTime?.() ?? 0
    } catch {
      return 0
    }
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    return Number((value as { _seconds: number })._seconds) * 1000
  }
  return 0
}

function buildInsights(input: {
  topCategory: { label: string; views: number } | null
  topYerel: { label: string; views: number } | null
  topPost: { title: string; views: number } | null
  yerelSharePct: number
  sampleSize: number
  period: Period
}): string[] {
  const lines: string[] = []
  const periodLabel =
    input.period === 'all'
      ? 'tüm zamanlar'
      : input.period === '7d'
        ? 'son 7 günde yayınlananlar'
        : input.period === '30d'
          ? 'son 30 günde yayınlananlar'
          : 'son 90 günde yayınlananlar'

  if (input.topCategory) {
    lines.push(
      `En çok görüntülenen kategori: ${input.topCategory.label} (${input.topCategory.views.toLocaleString('tr-TR')} görüntülenme).`,
    )
  }
  if (input.topYerel) {
    lines.push(
      `Yerel’de lider alt kategori: ${input.topYerel.label.replace(/^Yerel · /, '')} (${input.topYerel.views.toLocaleString('tr-TR')}).`,
    )
  }
  if (input.topPost) {
    lines.push(
      `Listenin zirvesi: “${input.topPost.title.slice(0, 72)}${input.topPost.title.length > 72 ? '…' : ''}” — ${input.topPost.views.toLocaleString('tr-TR')} görüntülenme.`,
    )
  }
  lines.push(
    `Özet (${periodLabel}): örneklem ${input.sampleSize} yayında haber; yerel payı %${input.yerelSharePct}.`,
  )
  return lines.slice(0, 4)
}

/** GET /api/admin/most-read?scope=&category=&subcategory=&period=&limit= */
export async function GET(request: Request) {
  const auth = await verifyCmsToken(request)
  if (
    !auth ||
    (!hasPermission(auth.role, 'analytics:read') && !hasPermission(auth.role, 'news:read'))
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'))
  const scope = parseScope(searchParams.get('scope'))
  const category = (searchParams.get('category') ?? '').trim()
  const subcategory = (searchParams.get('subcategory') ?? '').trim()
  const limitRaw = Number(searchParams.get('limit') ?? TOP_POSTS_LIMIT)
  const postsLimit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : TOP_POSTS_LIMIT, 10), 80)
  const startMs = periodStartMs(period)

  try {
    const db = getAdminFirestore()
    let snap
    try {
      snap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('viewsCount', 'desc')
        .limit(SAMPLE_LIMIT)
        .get()
    } catch (indexErr) {
      console.warn('[admin/most-read] viewsCount index miss, fallback fetch:', indexErr)
      snap = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .limit(SAMPLE_LIMIT)
        .get()
    }

    const raw: RawPost[] = snap.docs.map((doc) => {
      const data = doc.data()
      const publishedAtMs =
        toMs(data.publishedAt) ||
        toMs(data.createdAt) ||
        toMs(data.updatedAt) ||
        0
      const cover =
        (typeof data.coverUrl === 'string' && data.coverUrl) ||
        (typeof data.thumbnailUrl === 'string' && data.thumbnailUrl) ||
        (typeof data.imageUrl === 'string' && data.imageUrl) ||
        null
      return {
        id: doc.id,
        title: String(data.title ?? '').trim() || 'Başlıksız',
        slug: String(data.slug ?? '').trim(),
        categoryId: String(data.categoryId ?? data.category ?? '').trim() || 'genel',
        viewsCount: Number(data.viewsCount ?? 0) || 0,
        citySlug: typeof data.citySlug === 'string' ? data.citySlug : null,
        publishedAtMs,
        coverUrl: cover,
      }
    })

    let filtered = raw

    if (startMs != null) {
      filtered = filtered.filter((p) => p.publishedAtMs >= startMs)
    }

    if (scope === 'yerel') {
      filtered = filtered.filter(
        (p) => isYerelCategoryTree(p.categoryId) || Boolean(p.citySlug?.trim()),
      )
    } else if (scope === 'national') {
      filtered = filtered.filter(
        (p) => !isYerelCategoryTree(p.categoryId) && !p.citySlug?.trim(),
      )
    }

    if (subcategory) {
      filtered = filtered.filter((p) => p.categoryId === subcategory)
    } else if (category === YEREL_HABER_CATEGORY_ID) {
      filtered = filtered.filter(
        (p) => isYerelCategoryTree(p.categoryId) || Boolean(p.citySlug?.trim()),
      )
    } else if (category) {
      filtered = filtered.filter((p) => {
        if (p.categoryId === category) return true
        const parent = getParentCategory(p.categoryId)
        return parent?.id === category
      })
    }

    filtered = [...filtered].sort((a, b) => b.viewsCount - a.viewsCount)

    const totalViews = filtered.reduce((s, p) => s + p.viewsCount, 0)
    const yerelPosts = filtered.filter(
      (p) => isYerelCategoryTree(p.categoryId) || Boolean(p.citySlug?.trim()),
    )
    const yerelViews = yerelPosts.reduce((s, p) => s + p.viewsCount, 0)
    const nationalViews = Math.max(0, totalViews - yerelViews)
    const yerelSharePct = totalViews > 0 ? Math.round((yerelViews / totalViews) * 100) : 0

    const exactMap = new Map<string, { views: number; posts: number }>()
    const parentMap = new Map<string, { views: number; posts: number }>()

    for (const post of filtered) {
      const exact = exactMap.get(post.categoryId) ?? { views: 0, posts: 0 }
      exact.views += post.viewsCount
      exact.posts += 1
      exactMap.set(post.categoryId, exact)

      const parentId = parentBucketId(post.categoryId)
      const parent = parentMap.get(parentId) ?? { views: 0, posts: 0 }
      parent.views += post.viewsCount
      parent.posts += 1
      parentMap.set(parentId, parent)
    }

    const toRanked = (
      map: Map<string, { views: number; posts: number }>,
      opts?: { onlyYerel?: boolean; excludeYerel?: boolean },
    ) =>
      [...map.entries()]
        .map(([id, stats]) => {
          const isYerel = isYerelCategoryTree(id) || id === YEREL_HABER_CATEGORY_ID
          return {
            id,
            label: categoryLabel(id),
            views: stats.views,
            posts: stats.posts,
            isYerel,
            parentId: getParentCategory(id)?.id ?? null,
          }
        })
        .filter((row) => {
          if (opts?.onlyYerel) return row.isYerel && row.id !== YEREL_HABER_CATEGORY_ID
          if (opts?.excludeYerel) return !row.isYerel
          return true
        })
        .sort((a, b) => b.views - a.views)

    const categories = toRanked(parentMap).slice(0, TOP_CATEGORIES_LIMIT)
    const subcategories = toRanked(exactMap).slice(0, TOP_CATEGORIES_LIMIT)
    const yerelCategories = toRanked(exactMap, { onlyYerel: true }).slice(0, TOP_CATEGORIES_LIMIT)
    const nationalCategories = toRanked(parentMap, { excludeYerel: true }).slice(
      0,
      TOP_CATEGORIES_LIMIT,
    )

    const topPosts = filtered.slice(0, postsLimit).map((p, index) => ({
      rank: index + 1,
      id: p.id,
      title: p.title,
      slug: p.slug,
      categoryId: p.categoryId,
      categoryLabel: categoryLabel(p.categoryId),
      views: p.viewsCount,
      citySlug: p.citySlug,
      isYerel: isYerelCategoryTree(p.categoryId) || Boolean(p.citySlug?.trim()),
      coverUrl: p.coverUrl,
      publishedAt: p.publishedAtMs ? new Date(p.publishedAtMs).toISOString() : null,
    }))

    const insights = buildInsights({
      topCategory: categories[0]
        ? { label: categories[0].label, views: categories[0].views }
        : null,
      topYerel: yerelCategories[0]
        ? { label: yerelCategories[0].label, views: yerelCategories[0].views }
        : null,
      topPost: topPosts[0]
        ? { title: topPosts[0].title, views: topPosts[0].views }
        : null,
      yerelSharePct,
      sampleSize: filtered.length,
      period,
    })

    return NextResponse.json({
      meta: {
        sampleSize: filtered.length,
        scanned: raw.length,
        totalViews,
        yerelViews,
        nationalViews,
        yerelSharePct,
        period,
        scope,
        category: category || null,
        subcategory: subcategory || null,
        generatedAt: new Date().toISOString(),
        note:
          period === 'all'
            ? 'Görüntülenmeler lifetime viewsCount üzerinden; dönem filtresi yayın tarihine uygulanır.'
            : 'Dönem filtresi yayın tarihine göre uygulanır; görüntülenme sayıları lifetime viewsCount’tur.',
      },
      insights,
      topPosts,
      categories,
      subcategories,
      yerelCategories,
      nationalCategories,
    })
  } catch (error) {
    console.error('[admin/most-read] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'En çok okunanlar yüklenemedi' },
      { status: 500 },
    )
  }
}
