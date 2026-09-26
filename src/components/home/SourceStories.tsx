'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Newspaper } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { type SourceStoryGroup } from '@/lib/home/sourceStories'
import type { NewsItem } from '@/types/newsItem'

const StoryViewer = dynamic(
  () => import('@/components/home/StoryViewer').then((m) => m.StoryViewer),
  { ssr: false }
)

const ABOVE_FOLD_STORIES = 2

type SourceStoriesProps = {
  groups: SourceStoryGroup[]
}

function StoryCard({
  item,
  label,
  onOpen,
}: {
  item: NewsItem
  label: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="source-stories-card"
      className="source-story-card group relative shrink-0 snap-start overflow-hidden rounded-2xl text-left"
      style={{ width: 163, height: 290, aspectRatio: '9 / 16' }}
    >
      <SafeNewsImage
        src={item.imageUrl || FEED_FALLBACK_LOGO}
        alt={item.title}
        fill
        sizes="163px"
        fetchPriority="low"
        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <span className="source-story-card__dash" aria-hidden />
        <p className="line-clamp-4 text-xs font-bold leading-snug text-white">{item.title}</p>
        <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-white/70">
          {label}
        </p>
      </div>
    </button>
  )
}

export function SourceStories({ groups }: SourceStoriesProps) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [activeGroupIndex, setActiveGroupIndex] = useState(0)
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [showRest, setShowRest] = useState(false)

  useEffect(() => {
    const enable = () => setShowRest(true)
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(enable, { timeout: 1800 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(enable, 900)
    return () => clearTimeout(timer)
  }, [])

  const openAt = useCallback((groupIndex: number, itemIndex = 0) => {
    if (groups.length === 0) return
    const g = Math.min(Math.max(0, groupIndex), groups.length - 1)
    const items = groups[g]?.items ?? []
    if (items.length === 0) return
    setActiveGroupIndex(g)
    setActiveItemIndex(Math.min(Math.max(0, itemIndex), items.length - 1))
    setViewerOpen(true)
  }, [groups])

  if (groups.length === 0) return null

  return (
    <section aria-label="Kaynak hikayeleri" className="home-section" data-testid="source-stories-rail">
      <div
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory"
        data-no-category-swipe
      >
        <div className="shrink-0 snap-start">
          <button
            type="button"
            data-testid="source-stories-hub"
            onClick={() => openAt(0, 0)}
            className="relative flex h-[290px] w-[163px] flex-col items-center justify-center overflow-hidden rounded-2xl p-3 text-center shadow-brand transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
            style={{
              aspectRatio: '9 / 16',
              background:
                'linear-gradient(135deg, rgb(var(--brand-600)) 0%, rgb(var(--brand-700)) 60%, rgb(var(--brand-900)) 100%)',
            }}
          >
            <Newspaper className="mb-2 h-8 w-8 text-white" />
            <span className="text-sm font-black uppercase leading-tight text-white">
              Tüm Kaynaklar
            </span>
          </button>
        </div>
        {(showRest ? groups : groups.slice(0, ABOVE_FOLD_STORIES)).map((group, groupIndex) => {
          const cover = group.items[0]
          if (!cover) return null
          return (
            <StoryCard
              key={group.key}
              item={cover}
              label={group.label}
              onOpen={() => openAt(groupIndex, 0)}
            />
          )
        })}
      </div>

      {viewerOpen ? (
        <StoryViewer
          groups={groups}
          open
          initialGroupIndex={activeGroupIndex}
          initialIndex={activeItemIndex}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </section>
  )
}
