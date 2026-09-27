'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FollowButton } from '@/components/profile/FollowButton'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ProfileAboutCard } from '@/components/profile/platform/ProfileAboutCard'
import { getCategoryLabel } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'
import type { Post } from '@/types/post'
import type { PublicAuthorProfile } from '@/services/newsService.server'
import { cn } from '@/lib/utils'

type TabId = 'news' | 'columns' | 'videos'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'news', label: 'Son haberler' },
  { id: 'columns', label: 'Dosyalar' },
  { id: 'videos', label: 'Videolar' },
]

function storyImage(post: Post): string | null {
  return (
    post.coverImageUrl?.trim() ||
    post.mediaItems?.find((m) => m.type === 'image')?.url ||
    null
  )
}

function formatLabel(post: Post): string {
  if (post.articleFormat === 'column') return 'Köşe yazısı'
  if (post.articleFormat === 'analysis') return 'Analiz'
  return getCategoryLabel(post.categoryId)
}

export function AuthorProfileClient({
  author,
  posts,
}: {
  author: PublicAuthorProfile
  posts: Post[]
}) {
  const [tab, setTab] = useState<TabId>('news')

  const columns = useMemo(
    () => posts.filter((p) => p.articleFormat === 'column' || p.articleFormat === 'analysis'),
    [posts]
  )
  const videos = useMemo(
    () =>
      posts.filter(
        (p) => p.postType === 'video' || Boolean(p.mediaItems?.some((m) => m.type === 'video'))
      ),
    [posts]
  )

  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'columns') return columns.length > 0
    if (t.id === 'videos') return videos.length > 0
    return true
  })

  const filtered = tab === 'columns' ? columns : tab === 'videos' ? videos : posts
  const [lead, ...rest] = filtered

  const about = (
    <ProfileAboutCard title="Hakkında">
      {author.bio && !/ai\s*edit[oö]r|yapay\s*zeka/i.test(author.bio) ? (
        <p className="whitespace-pre-wrap break-words">{author.bio}</p>
      ) : (
        <p className="text-[rgb(var(--color-muted))]">Biyografi henüz eklenmedi.</p>
      )}
      {author.department && !/ai\s*edit[oö]r|yapay\s*zeka/i.test(author.department) ? (
        <p>
          <span className="font-semibold">Masa:</span> {author.department}
        </p>
      ) : null}
      {author.location ? <p className="text-[rgb(var(--color-muted))]">{author.location}</p> : null}
    </ProfileAboutCard>
  )

  return (
    <div data-profile-type="editor">
      <div className="mb-4 lg:hidden">{about}</div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <FollowButton targetUserId={author.uid} isFollowing={false} />
          </div>

          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))]" aria-label="Editör haberleri">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'shrink-0 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--color-brand))]',
                  tab === t.id
                    ? 'border-[rgb(var(--color-brand))] text-[rgb(var(--color-text))]'
                    : 'border-transparent text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
              Henüz yayımlanmış haber bulunmuyor.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
              Bu bölümde haber yok.
            </p>
          ) : (
            <div className="space-y-4">
              {lead ? <StoryCard post={lead} prominent /> : null}
              {rest.length > 0 ? (
                <ul className="space-y-3">
                  {rest.map((post) => (
                    <li key={post.id}>
                      <StoryCard post={post} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <div className="hidden lg:block">{about}</div>
      </div>
    </div>
  )
}

function StoryCard({ post, prominent = false }: { post: Post; prominent?: boolean }) {
  const image = storyImage(post)
  return (
    <Link
      href={ROUTES.NEWS_DETAIL(post.slug)}
      className={cn(
        'group flex gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 transition-colors hover:border-[rgb(var(--color-brand))]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--color-brand))]',
        prominent && 'sm:p-4'
      )}
    >
      {image ? (
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-border))]',
            prominent ? 'h-28 w-40 sm:h-36 sm:w-56' : 'h-20 w-28'
          )}
        >
          <SafeNewsImage src={image} alt="" fill className="object-cover" sizes={prominent ? '224px' : '112px'} />
        </div>
      ) : (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-border))]/40 text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]',
            prominent ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-20 w-20'
          )}
          aria-hidden
        >
          NaHaber
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
          {formatLabel(post)}
        </p>
        <h3
          className={cn(
            'mt-0.5 font-bold text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))]',
            prominent ? 'line-clamp-3 text-lg sm:text-xl' : 'line-clamp-2 text-sm'
          )}
        >
          {post.title}
        </h3>
        {prominent && post.summary ? (
          <p className="mt-2 line-clamp-3 hidden text-sm leading-relaxed text-[rgb(var(--color-muted))] sm:block">
            {post.summary}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
