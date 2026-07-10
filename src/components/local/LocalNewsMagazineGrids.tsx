'use client'

import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { GridStory } from '@/components/home/desktop/desktopGridStories'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID } from '@/components/home/desktop/desktopLayout'
import { ROUTES } from '@/constants/routes'
import type { TimelinePost } from '@/types/post'

interface LocalNewsMagazineGridsProps {
  namedSections: Array<{ title: string; posts: TimelinePost[] }>
  overflowChunks: TimelinePost[][]
  loadingMore?: boolean
  sentinelRef?: React.RefObject<HTMLDivElement | null>
}

export function LocalNewsMagazineGrids({
  namedSections,
  overflowChunks,
  loadingMore,
  sentinelRef,
}: LocalNewsMagazineGridsProps) {
  return (
    <>
      {namedSections.map((section) => (
        <section
          key={section.title}
          className={DESKTOP_SECTION_DIVIDER}
          aria-label={section.title}
        >
          <DesktopSectionHeader title={section.title} href={ROUTES.LOCAL} />
          <div className={FOUR_CARD_GRID}>
            {section.posts.map((post) => (
              <GridStory key={post.id} post={post} />
            ))}
          </div>
        </section>
      ))}

      {overflowChunks.map((chunk, index) => (
        <section
          key={`overflow-${index}`}
          className={DESKTOP_SECTION_DIVIDER}
          aria-label={index === 0 ? 'Daha fazla haber' : undefined}
        >
          {index === 0 ? (
            <DesktopSectionHeader title="Daha Fazla" href={ROUTES.LOCAL} />
          ) : null}
          <div className={FOUR_CARD_GRID}>
            {chunk.map((post) => (
              <GridStory key={post.id} post={post} />
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
