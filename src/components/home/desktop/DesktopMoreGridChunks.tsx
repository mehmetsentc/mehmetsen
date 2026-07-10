'use client'

import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID } from '@/components/home/desktop/desktopLayout'
import { ImageStory } from '@/components/home/desktop/DesktopStoryBlocks'
import type { NewsItem } from '@/types/newsItem'

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

interface DesktopMoreGridChunksProps {
  items: NewsItem[]
  title?: string
  href?: string
  loadingMore?: boolean
  sentinelRef?: React.RefObject<HTMLDivElement | null>
}

/** 4-card grid chunks replacing archive-style DesktopMoreList rows. */
export function DesktopMoreGridChunks({
  items,
  title = 'Daha Fazla',
  href,
  loadingMore,
  sentinelRef,
}: DesktopMoreGridChunksProps) {
  const chunks = chunkItems(items, 4)
  if (chunks.length === 0 && !loadingMore) return null

  return (
    <>
      {chunks.map((chunk, index) => (
        <section
          key={`more-chunk-${index}`}
          className={DESKTOP_SECTION_DIVIDER}
          aria-label={index === 0 ? title : undefined}
        >
          {index === 0 ? <DesktopSectionHeader title={title} href={href} /> : null}
          <div className={FOUR_CARD_GRID}>
            {chunk.map((item) => (
              <ImageStory key={item.id} item={item} aspect="video" />
            ))}
          </div>
        </section>
      ))}

      {loadingMore ? (
        <div className="mb-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : null}

      {sentinelRef ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}
    </>
  )
}
