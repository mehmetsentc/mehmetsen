'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Badge } from '@/components/ui/Badge'
import { ROUTES } from '@/constants/routes'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { StoryViewer } from './StoryViewer'
import type { NewsItem } from '@/types/newsItem'

interface BreakingStoriesProps {
  items: NewsItem[]
}

interface StoryCardProps {
  item: NewsItem
  priority?: boolean
  onOpen: () => void
}

function StoryCard({ item, priority = false, onOpen }: StoryCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative shrink-0 snap-start overflow-hidden rounded-2xl text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
      style={{ width: 163, height: 290, aspectRatio: '9/16' }}
    >
      <SafeNewsImage
        src={item.imageUrl || FEED_FALLBACK_LOGO}
        alt={item.title}
        fill
        sizes="163px"
        priority={priority}
        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <Badge variant="danger" className="mb-2">
          Son Dakika
        </Badge>
        <p className="line-clamp-4 text-xs font-bold leading-snug text-white">{item.title}</p>
      </div>
    </button>
  )
}

export function BreakingStories({ items }: BreakingStoriesProps) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const openAt = useCallback((index: number) => {
    setActiveIndex(index)
    setViewerOpen(true)
  }, [])

  if (items.length === 0) return null

  return (
    <section aria-label="Son Dakika" className="home-section">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="home-section-title">Son Dakika</h2>
      </div>

      <div
          className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory"
          data-no-category-swipe
        >
          <div className="shrink-0 snap-start">
            <Link
              href={ROUTES.CATEGORY('son-dakika')}
              className="relative flex h-[290px] w-[163px] flex-col items-center justify-center overflow-hidden rounded-2xl p-3 text-center shadow-brand transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
              style={{
                aspectRatio: '9/16',
                background:
                  'linear-gradient(135deg, rgb(var(--brand-600)) 0%, rgb(var(--brand-700)) 60%, rgb(var(--brand-900)) 100%)',
              }}
            >
              <Zap className="mb-2 h-8 w-8 text-white" />
              <span className="text-sm font-black uppercase leading-tight text-white">
                Tüm Son Dakika
              </span>
            </Link>
          </div>
          {items.map((item, index) => (
            <StoryCard
              key={item.id}
              item={item}
              priority={false}
              onOpen={() => openAt(index)}
            />
          ))}
        </div>

      <StoryViewer
        items={items}
        open={viewerOpen}
        initialIndex={activeIndex}
        onClose={() => setViewerOpen(false)}
      />
    </section>
  )
}
