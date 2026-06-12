'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORE_KEYS } from '@/lib/stateKeys'

const MAX_TRACKED_PAGES = 40

interface PageSlice {
  scrollY: number
  values: Record<string, unknown>
}

interface PageStateStore {
  pages: Record<string, PageSlice>
  setScroll: (path: string, scrollY: number) => void
  getScroll: (path: string) => number
  setValue: (path: string, key: string, value: unknown) => void
  getValue: <T>(path: string, key: string) => T | undefined
  clearPath: (path: string) => void
}

function emptySlice(): PageSlice {
  return { scrollY: 0, values: {} }
}

function trimPages(pages: Record<string, PageSlice>): Record<string, PageSlice> {
  const keys = Object.keys(pages)
  if (keys.length <= MAX_TRACKED_PAGES) return pages
  const next: Record<string, PageSlice> = {}
  for (const key of keys.slice(-MAX_TRACKED_PAGES)) {
    next[key] = pages[key]
  }
  return next
}

export const usePageStateStore = create<PageStateStore>()(
  persist(
    (set, get) => ({
      pages: {},

      setScroll: (path, scrollY) => {
        if (!path) return
        set((state) => {
          const current = state.pages[path] ?? emptySlice()
          return {
            pages: trimPages({
              ...state.pages,
              [path]: { ...current, scrollY: Math.max(0, scrollY) },
            }),
          }
        })
      },

      getScroll: (path) => {
        if (!path) return 0
        return get().pages[path]?.scrollY ?? 0
      },

      setValue: (path, key, value) => {
        if (!path || !key) return
        set((state) => {
          const current = state.pages[path] ?? emptySlice()
          return {
            pages: trimPages({
              ...state.pages,
              [path]: {
                ...current,
                values: { ...current.values, [key]: value },
              },
            }),
          }
        })
      },

      getValue: <T,>(path: string, key: string): T | undefined => {
        if (!path || !key) return undefined
        return get().pages[path]?.values[key] as T | undefined
      },

      clearPath: (path) => {
        if (!path) return
        set((state) => {
          const { [path]: _, ...rest } = state.pages
          return { pages: rest }
        })
      },
    }),
    {
      name: STORE_KEYS.PAGE,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ pages: state.pages }),
    }
  )
)
