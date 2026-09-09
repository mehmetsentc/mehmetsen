'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BadgeCheck, ExternalLink, Globe, MapPin, Sparkles } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { PublicPublisherRecord, PublisherArticleItem } from '@/types/publisher'
import { FollowButton } from '@/components/social/FollowButton'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import toast from 'react-hot-toast'
import {
  buildEditorialFrontPage,
  categoryLabelFor,
  formatPublishedAt,
  pickLatest,
} from '@/lib/publisher/editorialTiers'
import { accentColorCssVarValue } from '@/lib/publisher/accentPalette'

type ClaimUiStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'loading'

/**
 * Shared article card primitive. Used by the masonry grid (category-filtered
 * view + the "Latest" rail) AND by the editorial front-page's Secondary/
 * Sections grids. Kept as a single reusable component per LP7R.1 Task 9 so
 * the Pinterest-masonry presentation stays available for a possible future
 * "Keşfet/Archive/Discovery" mode without duplicating markup.
 */
function ArticleCard({
  article,
  categoryMap,
  layout = 'grid',
}: {
  article: PublisherArticleItem
  categoryMap: Map<string, string>
  layout?: 'masonry' | 'grid'
}) {
  const catLabel = categoryLabelFor(article, categoryMap)
  return (
    <Link
      href={ROUTES.NEWS_DETAIL(article.slug)}
      className={cn(
        'group block overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--color-brand))]/40 hover:shadow-md',
        layout === 'masonry' ? 'mb-4 break-inside-avoid' : 'h-full'
      )}
    >
      {article.thumbnailUrl ? (
        <div className="relative w-full overflow-hidden bg-[rgb(var(--color-bg))]">
          <SafeNewsImage
            src={article.thumbnailUrl}
            alt={article.title}
            width={640}
            height={480}
            className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur-sm">
            {catLabel}
          </span>
        </div>
      ) : (
        <div className="relative flex min-h-[120px] w-full items-center justify-center bg-[rgb(var(--color-bg))] p-4">
          <span className="rounded-md bg-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-bold text-[rgb(var(--color-muted))]">
            {catLabel}
          </span>
        </div>
      )}
      <div className="p-4">
        <h3 className="text-base font-bold leading-snug text-[rgb(var(--color-text))] transition-colors group-hover:text-[rgb(var(--color-brand))]">
          {article.title}
        </h3>
        {article.summary ? (
          <p className="mt-2 hidden text-xs leading-relaxed text-[rgb(var(--color-muted))] sm:line-clamp-3 sm:block">
            {article.summary}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between text-[11px] text-[rgb(var(--color-muted))]">
          <span>{formatPublishedAt(article.publishedAt)}</span>
          <span className="font-semibold text-[rgb(var(--color-brand))] opacity-0 transition-opacity group-hover:opacity-100">
            Oku →
          </span>
        </div>
      </div>
    </Link>
  )
}

/**
 * The Pinterest-style masonry grid, extracted as a reusable primitive
 * (LP7R.1 Task 9). Used for: (a) the category-filtered view (unchanged
 * behavior from before this phase), and (b) the "Latest" rail on the
 * editorial front page. Deliberately NOT wired up as a standalone
 * "Keşfet/Archive/Discovery" mode yet — that scope is explicitly deferred
 * per the LP7R.1 spec.
 */
function MasonryArticleGrid({
  articles,
  categoryMap,
}: {
  articles: PublisherArticleItem[]
  categoryMap: Map<string, string>
}) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} categoryMap={categoryMap} layout="masonry" />
      ))}
    </div>
  )
}

function LeadArticleCard({
  article,
  categoryMap,
}: {
  article: PublisherArticleItem
  categoryMap: Map<string, string>
}) {
  const catLabel = categoryLabelFor(article, categoryMap)
  return (
    <Link
      href={ROUTES.NEWS_DETAIL(article.slug)}
      className="group block overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] shadow-sm transition-all duration-200 hover:border-[rgb(var(--color-brand))]/40 hover:shadow-md"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="relative aspect-video w-full overflow-hidden bg-[rgb(var(--color-bg))] lg:aspect-auto lg:min-h-[280px]">
          {article.thumbnailUrl ? (
            <SafeNewsImage
              src={article.thumbnailUrl}
              alt={article.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="rounded-md bg-[rgb(var(--color-border))] px-2.5 py-1 text-xs font-bold text-[rgb(var(--color-muted))]">
                {catLabel}
              </span>
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur-sm">
            {catLabel}
          </span>
        </div>
        <div className="flex flex-col justify-center p-5 sm:p-7">
          <h2 className="text-xl font-black leading-snug text-[rgb(var(--color-text))] transition-colors group-hover:text-[rgb(var(--color-brand))] sm:text-2xl lg:text-3xl">
            {article.title}
          </h2>
          {article.summary ? (
            <p className="mt-3 hidden text-sm leading-relaxed text-[rgb(var(--color-muted))] sm:line-clamp-3 sm:block">
              {article.summary}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-3 text-xs text-[rgb(var(--color-muted))]">
            <span>{formatPublishedAt(article.publishedAt)}</span>
            <span className="font-semibold text-[rgb(var(--color-brand))]">Oku →</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function PublisherProfileClient({
  publisher,
  articles: initialArticles,
  totalCount: initialTotalCount,
  nextCursor: initialNextCursor = null,
}: {
  publisher: PublicPublisherRecord
  articles: PublisherArticleItem[]
  totalCount?: number
  nextCursor?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState<string>(
    () => searchParams.get('category') || 'all'
  )
  const [articles, setArticles] = useState(initialArticles)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [totalCount, setTotalCount] = useState(initialTotalCount ?? initialArticles.length)
  const [loadingMore, setLoadingMore] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [claimUi, setClaimUi] = useState<ClaimUiStatus>('loading')
  const [studioHref, setStudioHref] = useState<string | null>(null)

  // Map category IDs to localized category names using DEFAULT_CATEGORIES
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of DEFAULT_CATEGORIES) {
      map.set(c.id.toLowerCase(), c.name)
      map.set(c.slug.toLowerCase(), c.name)
    }
    return map
  }, [])

  // Extract distinct categories available in this publisher's articles
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const art of articles) {
      const rawCat = (art.categoryId || 'gundem').toLowerCase().trim()
      counts.set(rawCat, (counts.get(rawCat) || 0) + 1)
    }
    const list: Array<{ id: string; label: string; count: number }> = []
    for (const [id, count] of counts.entries()) {
      const label = categoryMap.get(id) || id.charAt(0).toUpperCase() + id.slice(1)
      list.push({ id, label, count })
    }
    list.sort((a, b) => b.count - a.count)
    return list
  }, [articles, categoryMap])

  // Filter articles based on active category chip
  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'all') return articles
    return articles.filter((art) => {
      const cat = (art.categoryId || 'gundem').toLowerCase().trim()
      return cat === selectedCategory
    })
  }, [articles, selectedCategory])

  // Editorial front page (Lead/Secondary/Sections) computed ONLY from the
  // stable initial SSR'd page — deliberately not the ever-growing `articles`
  // state — so the tiers never reshuffle when "load more" is pressed.
  // `initialArticles` is a stable prop reference for the lifetime of this
  // mount, so this memo only recomputes if the publisher/page truly changes.
  const editorialFrontPage = useMemo(
    () => buildEditorialFrontPage(initialArticles, categoryMap),
    [initialArticles, categoryMap]
  )

  // "Latest" rail: everything loaded so far that wasn't placed into a tier.
  // This is the piece that actually grows as pagination loads more articles.
  const latestArticles = useMemo(
    () => pickLatest(articles, editorialFrontPage.usedIds),
    [articles, editorialFrontPage]
  )

  // Publisher accent (LP7R.1 Task 11): reuses ONLY accentColorHex, scoped to
  // this page via a `--color-brand` CSS variable override on the wrapper —
  // every `rgb(var(--color-brand))` usage already in this file (active
  // chip, hover borders, "Oku ->" links, Lead/Secondary/Sections/Latest
  // cards) then picks it up automatically, with zero new color usages
  // introduced. A missing/invalid accentColorHex falls back to the site
  // default brand color untouched.
  const accentStyle = useMemo(() => {
    const triplet = accentColorCssVarValue(publisher.accentColorHex)
    return triplet ? ({ '--color-brand': triplet } as CSSProperties) : undefined
  }, [publisher.accentColorHex])

  const selectCategory = useCallback(
    (id: string) => {
      setSelectedCategory(id)
      const params = new URLSearchParams(searchParams.toString())
      if (id === 'all') params.delete('category')
      else params.set('category', id)
      const q = params.toString()
      router.replace(q ? `?${q}` : '?', { scroll: false })
    },
    [router, searchParams]
  )

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ cursor: nextCursor, limit: '30' })
      const res = await fetch(
        `/api/publishers/${encodeURIComponent(publisher.slug)}/articles?${params.toString()}`
      )
      if (!res.ok) return
      const body = (await res.json()) as {
        items: PublisherArticleItem[]
        nextCursor: string | null
      }
      setArticles((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        const merged = [...prev]
        for (const item of body.items ?? []) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          merged.push({
            ...item,
            publishedAt: item.publishedAt ? new Date(item.publishedAt as unknown as string) : null,
          })
        }
        setTotalCount((c) => Math.max(c, merged.length))
        return merged
      })
      setNextCursor(body.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, publisher.slug])

  const refreshClaimStatus = useCallback(async () => {
    const user = auth.currentUser
    if (!user) {
      setClaimUi('none')
      setStudioHref(null)
      return
    }
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/publishers/${encodeURIComponent(publisher.slug)}/claim`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setClaimUi('none')
        return
      }
      const body = (await res.json()) as {
        status?: ClaimUiStatus
        studioHref?: string | null
      }
      setClaimUi(body.status ?? 'none')
      setStudioHref(body.studioHref ?? null)
    } catch {
      setClaimUi('none')
    }
  }, [publisher.slug])

  useEffect(() => {
    void refreshClaimStatus()
  }, [refreshClaimStatus])

  const showClaimCta =
    publisher.status === 'UNCLAIMED' &&
    (publisher.verificationStatus === 'UNCLAIMED' ||
      publisher.verificationStatus === 'PENDING' ||
      publisher.verificationStatus === 'REJECTED')

  const submitClaim = async () => {
    const user = auth.currentUser
    if (!user) {
      router.push(`${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.PUBLISHER(publisher.slug))}`)
      return
    }
    setSubmitting(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/publishers/${encodeURIComponent(publisher.slug)}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: message.trim() || undefined,
          businessEmail: businessEmail.trim() || undefined,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Talep gönderilemedi')
      toast.success('Sahiplik talebiniz alındı. İnceleme sonrası bilgilendirileceksiniz.')
      setClaimOpen(false)
      setClaimUi('pending')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Talep gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" style={accentStyle}>
      {/* Publisher Header Banner Card */}
      <header className="mb-8 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] shadow-inner">
              {publisher.logoUrl ? (
                <SafeNewsImage
                  src={publisher.logoUrl}
                  alt={publisher.displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-black text-[rgb(var(--color-brand))]">
                  {publisher.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-[rgb(var(--color-text))] sm:text-3xl">
                  {publisher.displayName}
                </h1>
                {publisher.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    Doğrulandı
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[rgb(var(--color-muted))]">
                {(publisher.city || publisher.countryCode) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" aria-hidden />
                    {[publisher.city, publisher.countryCode].filter(Boolean).join(', ')}
                  </span>
                )}
                {publisher.websiteUrl && (
                  <a
                    href={publisher.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 transition-colors hover:text-[rgb(var(--color-brand))]"
                  >
                    <Globe className="h-4 w-4 shrink-0" aria-hidden />
                    Web sitesi
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
                <span className="inline-flex items-center gap-1 font-medium text-[rgb(var(--color-text))]">
                  <span className="font-bold text-[rgb(var(--color-brand))]">{totalCount || articles.length}</span> haber
                </span>
              </div>
              {publisher.description ? (
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[rgb(var(--color-text))]">
                  {publisher.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0">
            <FollowButton publisherId={publisher.id} publisherSlug={publisher.slug} />
          </div>
        </div>
      </header>

      {claimUi === 'pending' && (
        <section className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">İnceleniyor</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Sahiplik talebiniz incelemede. Aynı yayın için yeni talep oluşturulamaz.
          </p>
        </section>
      )}

      {claimUi === 'approved' && studioHref && (
        <section className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Onaylandı</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Yayıncı hesabınız doğrulandı. Studio’dan profil ve içerik yönetimi yapabilirsiniz.
          </p>
          <Link
            href={studioHref}
            className="mt-3 inline-flex rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white"
          >
            Publisher Studio&apos;ya Git
          </Link>
        </section>
      )}

      {claimUi === 'rejected' && showClaimCta && (
        <section className="mb-8 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Reddedildi</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Önceki talebiniz reddedildi. Gerekirse yeniden başvurabilirsiniz.
          </p>
        </section>
      )}

      {showClaimCta && claimUi !== 'pending' && claimUi !== 'approved' && (
        <section className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          {!claimOpen ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-[rgb(var(--color-text))]">
                Bu yayın kuruluşunu yönetiyor musunuz?
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!auth.currentUser) {
                    router.push(
                      `${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.PUBLISHER(publisher.slug))}`
                    )
                    return
                  }
                  setClaimOpen(true)
                }}
                className="shrink-0 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
              >
                Yayıncı Profilini Doğrula
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Yayıncı doğrulama talebi</p>
              <input
                type="email"
                placeholder="Kurumsal e-posta (isteğe bağlı)"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Kısa açıklama (isteğe bağlı)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitClaim()}
                  className="rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {submitting ? 'Gönderiliyor…' : 'Talebi gönder'}
                </button>
                <button
                  type="button"
                  onClick={() => setClaimOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))]"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Category Filter Chips */}
      <section className="mb-6">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-xl font-black text-[rgb(var(--color-text))] sm:text-2xl">Haberler</h2>
          <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">
            {filteredArticles.length}
            {totalCount > filteredArticles.length ? ` / ${totalCount}` : ''} içerik
          </span>
        </div>

        {availableCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => selectCategory('all')}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                selectedCategory === 'all'
                  ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
                  : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-bg))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              <Sparkles className="h-3 w-3" />
              Tümü ({totalCount || articles.length})
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategory(cat.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                  selectedCategory === cat.id
                    ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
                    : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-bg))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedCategory === 'all' ? (
        /* Editorial front page: Lead / Secondary / Sections / Latest.
           Preserves cursor-pagination (Latest grows via loadMore) and keeps
           the masonry grid alive as the "Latest" rail's presentation. */
        <section>
          {articles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] p-12 text-center">
              <p className="text-sm font-medium text-[rgb(var(--color-muted))]">
                Bu yayın için henüz yayınlanmış haber bulunamadı.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {editorialFrontPage.lead ? (
                <LeadArticleCard article={editorialFrontPage.lead} categoryMap={categoryMap} />
              ) : null}

              {editorialFrontPage.secondary.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {editorialFrontPage.secondary.map((article) => (
                    <ArticleCard key={article.id} article={article} categoryMap={categoryMap} layout="grid" />
                  ))}
                </div>
              ) : null}

              {editorialFrontPage.sections.map((section) => (
                <section key={section.id}>
                  <h3 className="mb-3 text-lg font-black text-[rgb(var(--color-text))] sm:text-xl">
                    {section.label}
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {section.items.map((article) => (
                      <ArticleCard key={article.id} article={article} categoryMap={categoryMap} layout="grid" />
                    ))}
                  </div>
                </section>
              ))}

              {latestArticles.length > 0 ? (
                <section>
                  <h3 className="mb-3 text-lg font-black text-[rgb(var(--color-text))] sm:text-xl">
                    Son Haberler
                  </h3>
                  <MasonryArticleGrid articles={latestArticles} categoryMap={categoryMap} />
                </section>
              ) : null}

              {nextCursor ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-6 py-2.5 text-sm font-bold text-[rgb(var(--color-text))] shadow-sm transition hover:border-[rgb(var(--color-brand))]/40 disabled:opacity-60"
                  >
                    {loadingMore ? 'Yükleniyor…' : 'Daha fazla haber'}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : (
        /* Category-filtered view: preserved Pinterest-style masonry grid,
           unchanged from the pre-LP7R.1 behavior (no load-more here, same
           as before — category filtering only operates over already-loaded
           articles on the client). */
        <section>
          {filteredArticles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] p-12 text-center">
              <p className="text-sm font-medium text-[rgb(var(--color-muted))]">
                Bu kategoride yayınlanmış haber bulunamadı.
              </p>
            </div>
          ) : (
            <MasonryArticleGrid articles={filteredArticles} categoryMap={categoryMap} />
          )}
        </section>
      )}
    </div>
  )
}
