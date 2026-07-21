'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import {
  Search,
  TrendingUp,
  Hash,
  Users,
  Clapperboard,
  Newspaper,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react'
import { DEFAULT_CATEGORIES, TOP_NAV_CATEGORY_IDS } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { useSearch } from '@/hooks/useSearch'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import { Avatar } from '@/components/ui/Avatar'
import { getPostDetailHref, hasVideoContent } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { Post } from '@/types/post'
import type { User } from '@/types/user'
import type { SearchResults } from '@/services/searchService'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'

const TRENDING = ['çanakkale', 'seçim', 'ekonomi', 'spor', 'teknoloji']

type SearchTab = 'all' | 'news' | 'users' | 'videos' | 'categories'

function PostResult({ post }: { post: Post }) {
  const isVideo = hasVideoContent(post)
  const href = getPostDetailHref(post)

  return (
    <Link href={href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-border))]">
        {post.coverImageUrl ? (
          <SafeNewsImage src={post.coverImageUrl} alt="" fill className="object-cover" loading="lazy" sizes="56px" />
        ) : (
          <div className="flex h-full items-center justify-center text-[rgb(var(--color-muted))]">
            {isVideo ? <Clapperboard className="h-5 w-5" /> : <Newspaper className="h-5 w-5" />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">{post.title}</p>
        <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
          @{post.authorUsername} · {getCategoryLabel(post.categoryId)}
        </p>
      </div>
    </Link>
  )
}

function UserResult({ user }: { user: User }) {
  return (
    <Link
      href={ROUTES.PROFILE(user.username)}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
    >
      <Avatar name={user.displayName} src={user.photoURL} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[rgb(var(--color-text))]">{user.displayName}</p>
        <p className="truncate text-xs text-[rgb(var(--color-muted))]">@{user.username}</p>
      </div>
    </Link>
  )
}

function ResultsSection({
  title,
  children,
  count,
}: {
  title: string
  children: React.ReactNode
  count?: number
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
        <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
          {title}
          {typeof count === 'number' && (
            <span className="ml-2 text-xs font-medium text-[rgb(var(--color-muted))]">({count})</span>
          )}
        </h2>
      </div>
      <div className="divide-y divide-[rgb(var(--color-border))]">{children}</div>
    </section>
  )
}

function SearchResultsPanel({
  tab,
  results,
  query,
}: {
  tab: SearchTab
  results: SearchResults
  query: string
}) {
  const showNews = tab === 'all' || tab === 'news'
  const showUsers = tab === 'all' || tab === 'users'
  const showVideos = tab === 'all' || tab === 'videos'
  const showCategories = tab === 'all' || tab === 'categories'

  const newsItems = tab === 'videos' ? [] : results.posts
  const videoItems = results.videos
  const categoryItems = results.categories

  const total =
    (showNews ? newsItems.length : 0) +
    (showVideos ? videoItems.length : 0) +
    (showUsers ? results.users.length : 0) +
    (showCategories ? categoryItems.length : 0)

  if (total === 0) {
    return (
      <div className="surface-card py-12 text-center">
        <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Sonuç bulunamadı</p>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          &quot;{query}&quot; için eşleşen içerik yok. Farklı bir kelime deneyin.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showUsers && results.users.length > 0 && (
        <ResultsSection title="Kullanıcılar" count={results.users.length}>
          {results.users.map((user) => (
            <UserResult key={user.uid} user={user} />
          ))}
        </ResultsSection>
      )}

      {showNews && newsItems.length > 0 && (
        <ResultsSection title="Haberler" count={newsItems.length}>
          {newsItems.map((post) => (
            <PostResult key={post.id} post={post} />
          ))}
        </ResultsSection>
      )}

      {showVideos && videoItems.length > 0 && (
        <ResultsSection title="Videolar" count={videoItems.length}>
          {videoItems.map((post) => (
            <PostResult key={post.id} post={post} />
          ))}
        </ResultsSection>
      )}

      {showCategories && categoryItems.length > 0 && (
        <ResultsSection title="Kategoriler" count={categoryItems.length}>
          {categoryItems.map((cat) => (
            <Link
              key={cat.id}
              href={`${ROUTES.FEED}?category=${cat.id}`}
              className="block px-4 py-3 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
            >
              {cat.name}
            </Link>
          ))}
        </ResultsSection>
      )}
    </div>
  )
}

function SearchPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const initialTagOnly = searchParams.get('tag') === '1'
  const [tab, setTab] = usePageState<SearchTab>(PAGE_STATE_KEYS.searchTab, 'all')
  const { query, applyQuery, results, loading, error, searched, submit } = useSearch(initialQ, initialTagOnly)

  useEffect(() => {
    const q = searchParams.get('q') ?? ''
    const nextTagOnly = searchParams.get('tag') === '1'
    applyQuery(q, nextTagOnly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const updateQuery = (value: string, tag = false) => {
    applyQuery(value, tag)
    const trimmed = value.trim()
    const params = new URLSearchParams()
    if (trimmed) params.set('q', trimmed)
    if (tag) params.set('tag', '1')
    const next = trimmed ? `${ROUTES.SEARCH}?${params.toString()}` : ROUTES.SEARCH
    // URL güncellemesini düşük öncelikli yap — her tuşta router.replace INP'yi şişiriyordu
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => router.replace(next), { timeout: 800 })
    } else {
      globalThis.setTimeout(() => router.replace(next), 0)
    }
  }

  const tabs: { id: SearchTab; label: string; icon: typeof Search }[] = [
    { id: 'all', label: 'Tümü', icon: Search },
    { id: 'news', label: 'Haberler', icon: Newspaper },
    { id: 'users', label: 'Kullanıcılar', icon: Users },
    { id: 'videos', label: 'Videolar', icon: Clapperboard },
    { id: 'categories', label: 'Kategoriler', icon: Hash },
  ]

  const showDiscover = !query.trim() || (!searched && !loading)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Keşfet</h1>
        <p className="page-subtitle">Haber, kullanıcı ve video ara</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
          if (query.trim()) {
            router.replace(`${ROUTES.SEARCH}?q=${encodeURIComponent(query.trim())}`)
          }
        }}
      >
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
          <input
            type="search"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="Haber, kullanıcı veya #etiket ara..."
            className="page-input pr-11"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => updateQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
              aria-label="Temizle"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn('filter-chip px-4 py-2', tab === id && 'filter-chip-active')}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[rgb(var(--color-muted))]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Aranıyor…
        </div>
      )}

      {error && !loading && (
        <div className="surface-card flex items-center gap-3 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {searched && !loading && !error && query.trim() && (
        <SearchResultsPanel tab={tab} results={results} query={query.trim()} />
      )}

      {showDiscover && !loading && (
        <>
          <section className="surface-card-padded">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="section-heading">Trend Aramalar</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {TRENDING.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => updateQuery(tag)}
                  className="tag-pill"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </section>

          {(tab === 'all' || tab === 'categories') && (
            <section className="surface-card-padded">
              <h2 className="section-heading mb-3">Kategoriler</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TOP_NAV_CATEGORY_IDS.slice(0, 12)
                  .map((id) => DEFAULT_CATEGORIES.find((c) => c.id === id))
                  .filter(Boolean)
                  .map((cat) => (
                    <Link
                      key={cat!.id}
                      href={ROUTES.CATEGORY(cat!.slug)}
                      className="category-link"
                    >
                      {cat!.name}
                    </Link>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  )
}
