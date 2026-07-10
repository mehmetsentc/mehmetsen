'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { annotateTimelinePosts } from '@/lib/newsMapper'
import { isFirestoreInternalError } from '@/lib/firestoreQueue'
import { useScrollActivated } from '@/hooks/useScrollActivated'
import type { TimelinePost } from '@/types/post'

let postServiceModule: Promise<typeof import('@/services/postService')> | null = null
function loadPostService() {
  postServiceModule ??= import('@/services/postService')
  return postServiceModule.then((m) => m.postService)
}

export interface SectionFeedState {
  posts: TimelinePost[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loaded: boolean
  error: string | null
}

const EMPTY_SECTION: SectionFeedState = {
  posts: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  loaded: false,
  error: null,
}

function postTimestamp(post: TimelinePost): number {
  const raw = post.publishedAt ?? post.createdAt
  const ms = typeof raw === 'string' ? Date.parse(raw) : Number(raw)
  return Number.isFinite(ms) ? ms : 0
}

function sortPosts(posts: TimelinePost[]): TimelinePost[] {
  return [...posts].sort((a, b) => postTimestamp(b) - postTimestamp(a))
}

function groupInitialPosts(
  sectionIds: string[],
  initialPosts: TimelinePost[]
): Record<string, TimelinePost[]> {
  const grouped: Record<string, TimelinePost[]> = Object.fromEntries(
    sectionIds.map((id) => [id, [] as TimelinePost[]])
  )
  for (const post of initialPosts) {
    const cat = post.categoryId?.trim()
    if (cat && grouped[cat]) {
      grouped[cat].push(post)
    }
  }
  for (const id of sectionIds) {
    grouped[id] = sortPosts(grouped[id])
  }
  return grouped
}

function buildInitialSectionState(
  sectionIds: string[],
  initialPosts: TimelinePost[]
): Record<string, SectionFeedState> {
  const grouped = groupInitialPosts(sectionIds, initialPosts)
  return Object.fromEntries(
    sectionIds.map((id) => [
      id,
      {
        ...EMPTY_SECTION,
        posts: grouped[id] ?? [],
        loaded: (grouped[id]?.length ?? 0) > 0,
        hasMore: true,
      },
    ])
  )
}

export function useThemedCategoryFeed(sectionIds: string[], initialPosts: TimelinePost[] = []) {
  const activated = useScrollActivated()
  const lastDocsRef = useRef<Record<string, QueryDocumentSnapshot | null>>({})
  const fetchingRef = useRef<Set<string>>(new Set())

  const [sections, setSections] = useState<Record<string, SectionFeedState>>(() =>
    buildInitialSectionState(sectionIds, initialPosts)
  )

  const sectionIdsKey = sectionIds.join(',')
  const stableSectionIds = useMemo(() => sectionIds, [sectionIdsKey])

  const updateSection = useCallback((sectionId: string, patch: Partial<SectionFeedState>) => {
    setSections((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] ?? EMPTY_SECTION), ...patch },
    }))
  }, [])

  const fetchSection = useCallback(
    async (sectionId: string, append: boolean) => {
      if (fetchingRef.current.has(sectionId)) return
      fetchingRef.current.add(sectionId)

      updateSection(sectionId, {
        loading: !append,
        loadingMore: append,
        error: null,
      })

      try {
        const postService = await loadPostService()
        const cursor = append ? (lastDocsRef.current[sectionId] ?? undefined) : undefined
        const result = await postService.getNewsTimeline(cursor, {
          categoryId: sectionId,
          feedSource: 'nahaber',
        })

        const annotated = annotateTimelinePosts(result.posts, new Set())

        setSections((prev) => {
          const current = prev[sectionId] ?? EMPTY_SECTION
          const seen = new Set(append ? current.posts.map((p) => p.id) : [])
          const fresh = annotated.filter((p) => !seen.has(p.id))
          const merged = append ? sortPosts([...current.posts, ...fresh]) : sortPosts(fresh)

          return {
            ...prev,
            [sectionId]: {
              ...current,
              posts: merged,
              loading: false,
              loadingMore: false,
              loaded: true,
              hasMore: result.hasMore,
              error: null,
            },
          }
        })

        if (result.lastDoc) {
          lastDocsRef.current[sectionId] = result.lastDoc
        }
      } catch (err) {
        const message = isFirestoreInternalError(err)
          ? 'Bağlantı hatası oluştu. Lütfen tekrar deneyin.'
          : err instanceof Error
            ? err.message
            : 'Yüklenemedi'
        updateSection(sectionId, {
          loading: false,
          loadingMore: false,
          loaded: true,
          hasMore: false,
          error: message,
        })
      } finally {
        fetchingRef.current.delete(sectionId)
      }
    },
    [updateSection]
  )

  const ensureSectionLoaded = useCallback(
    (sectionId: string) => {
      if (!activated || !stableSectionIds.includes(sectionId)) return
      const state = sections[sectionId]
      if (!state || state.loading || state.loaded) return
      void fetchSection(sectionId, false)
    },
    [activated, stableSectionIds, sections, fetchSection]
  )

  const loadMoreSection = useCallback(
    (sectionId: string) => {
      if (!activated || !stableSectionIds.includes(sectionId)) return
      const state = sections[sectionId]
      if (!state || state.loading || state.loadingMore || !state.hasMore) return
      if (!state.loaded) {
        void fetchSection(sectionId, false)
        return
      }
      void fetchSection(sectionId, true)
    },
    [activated, stableSectionIds, sections, fetchSection]
  )

  return {
    activated,
    sections,
    ensureSectionLoaded,
    loadMoreSection,
  }
}
