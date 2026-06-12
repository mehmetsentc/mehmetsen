'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { FeedSource } from '@/lib/feedSource'
import { STORE_KEYS } from '@/lib/stateKeys'

interface FeedStore {
  feedSource: FeedSource
  lastCategoryId: string | null
  setFeedSource: (source: FeedSource) => void
  setLastCategoryId: (categoryId: string | null) => void
}

export const useFeedStore = create<FeedStore>()(
  persist(
    (set) => ({
      feedSource: 'nahaber',
      lastCategoryId: null,
      setFeedSource: (feedSource) => set({ feedSource }),
      setLastCategoryId: (lastCategoryId) => set({ lastCategoryId }),
    }),
    {
      name: STORE_KEYS.FEED,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        feedSource: state.feedSource,
        lastCategoryId: state.lastCategoryId,
      }),
    }
  )
)
