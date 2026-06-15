'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { TimelinePost } from '@/types/post'

const NewsTimeline = dynamic(
  () => import('@/components/feed/NewsTimeline').then((m) => m.NewsTimeline),
  { ssr: false, loading: () => null }
)

interface DeferredNewsTimelineProps {
  defaultCategory?: string
  initialPosts?: TimelinePost[]
  initialCategoryId?: string
  serverStaticCount: number
}

/** Loads timeline interactivity after idle — static HTML already visible. */
export function DeferredNewsTimeline(props: DeferredNewsTimelineProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const onIdle = () => setReady(true)
    const id =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(onIdle, { timeout: 3000 })
        : window.setTimeout(onIdle, 2000)

    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && typeof id === 'number') {
        cancelIdleCallback(id)
      } else {
        clearTimeout(id)
      }
    }
  }, [])

  if (!ready) return null

  return <NewsTimeline {...props} serverStaticCount={props.serverStaticCount} />
}
