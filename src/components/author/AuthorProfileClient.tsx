'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FollowButton } from '@/components/profile/FollowButton'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { getCategoryLabel } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'
import type { Post } from '@/types/post'
import type { PublicAuthorProfile } from '@/services/newsService.server'
import { cn } from '@/lib/utils'

type TabId = 'all' | 'news' | 'columns' | 'videos' | 'about'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'Akış' },
  { id: 'news', label: 'Haberler' },
  { id: 'columns', label: 'Köşe Yazıları' },
  { id: 'videos', label: 'Videolar' },
  { id: 'about', label: 'Hakkında' },
]

export function AuthorProfileClient({
  author,
  posts,
}: {
  author: PublicAuthorProfile
  posts: Post[]
}) {
  const [tab, setTab] = useState<TabId>('all')

  const filtered = useMemo(() => {
    if (tab === 'all' || tab === 'about') return posts
    if (tab === 'columns') {
      return posts.filter((p) => p.articleFormat === 'column' || p.articleFormat === 'analysis')
    }
    if (tab === 'videos') {
      return posts.filter((p) => p.postType === 'video' || Boolean(p.mediaItems?.some((m) => m.type === 'video')))
    }
    return posts.filter(
      (p) =>
        p.articleFormat !== 'column' &&
        p.articleFormat !== 'analysis' &&
        p.postType !== 'video'
    )
  }, [posts, tab])

  return (
    <div>
      {author.isAI ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md bg-[rgb(var(--color-brand))]/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[rgb(var(--color-brand))]">
            NaHaber AI Editörü
          </span>
          <FollowButton targetUserId={author.uid} isFollowing={false} />
        </div>
      ) : (
        <div className="mb-4">
          <FollowButton targetUserId={author.uid} isFollowing={false} />
        </div>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))] pb-px" aria-label="Yazar sekmeleri">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'border-b-2 border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))]'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'about' ? (
        <section className="space-y-3 text-sm leading-relaxed text-[rgb(var(--color-text))]">
          {author.bio ? <p>{author.bio}</p> : <p className="text-[rgb(var(--color-muted))]">Biyografi henüz eklenmedi.</p>}
          {author.department ? (
            <p>
              <span className="font-bold">Rol:</span> {author.department}
            </p>
          ) : null}
          {author.isAI ? (
            <p className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3 text-xs text-[rgb(var(--color-muted))]">
              Bu profil bir NaHaber yapay zeka editör kimliğidir. İçerikler editöryal kurallar ve
              insan denetimi altında üretilir; gerçek bir gazeteci kişisi değildir.
            </p>
          ) : null}
        </section>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
          Bu sekmede içerik yok.
        </p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((post) => {
            const image =
              post.coverImageUrl?.trim() ||
              post.mediaItems?.find((m) => m.type === 'image')?.url ||
              null
            const formatLabel =
              post.articleFormat === 'column'
                ? 'Köşe Yazısı'
                : post.articleFormat === 'analysis'
                  ? 'Analiz'
                  : getCategoryLabel(post.categoryId)
            return (
              <li key={post.id}>
                <Link
                  href={ROUTES.NEWS_DETAIL(post.slug)}
                  className="flex gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 transition-colors hover:border-[rgb(var(--color-brand))]/40"
                >
                  {image ? (
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-border))]">
                      <SafeNewsImage
                        src={image}
                        alt={post.title}
                        fill
                        className="object-cover"
                        sizes="112px"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                      {formatLabel}
                    </p>
                    <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">
                      {post.title}
                    </h3>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
