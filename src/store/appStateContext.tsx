'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import {
  getCache,
  setCache,
  CACHE_TTL,
  type CachePersistence,
} from '@/lib/clientCache'
import {
  hasMediaBeenFetched as mediaCacheHas,
  markMediaFetched as mediaCacheMark,
  hydrateMediaCache,
} from '@/lib/mediaCache'

const LOADED_VIDEOS_SESSION_KEY = 'nahaber:appState:loadedVideos:session:v1'
const LOADED_VIDEOS_LOCAL_KEY = 'nahaber:appState:loadedVideos:local:v1'
const MAX_PERSISTED_VIDEO_IDS = 100

interface PersistedVideoState {
  ids: string[]
  urls: Record<string, string>
}

interface AppStateContextValue {
  /** Videos that have buffered at least once this app session. */
  markVideoLoaded: (id: string, mediaUrl?: string) => void
  isVideoLoaded: (id: string) => boolean
  /** Stable media URL for a video id (avoids src churn on re-render). */
  getVideoUrl: (id: string) => string | undefined
  /** Read a feed snapshot (bridges to clientCache). */
  getCachedFeed: <T>(key: string, persistence?: CachePersistence) => T | null
  /** Write a feed snapshot (bridges to clientCache). */
  setCachedFeed: <T>(
    key: string,
    data: T,
    ttl?: number,
    persistence?: CachePersistence
  ) => void
  hasMediaBeenFetched: (url: string) => boolean
  markMediaFetched: (url: string) => void
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined)

function readPersistedVideoState(): PersistedVideoState {
  const empty: PersistedVideoState = { ids: [], urls: {} }
  if (typeof window === 'undefined') return empty

  const read = (key: string): PersistedVideoState | null => {
    try {
      const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PersistedVideoState
      if (!parsed || !Array.isArray(parsed.ids)) return null
      return {
        ids: parsed.ids.filter((id) => typeof id === 'string'),
        urls:
          parsed.urls && typeof parsed.urls === 'object' ? parsed.urls : {},
      }
    } catch {
      return null
    }
  }

  return read(LOADED_VIDEOS_SESSION_KEY) ?? read(LOADED_VIDEOS_LOCAL_KEY) ?? empty
}

function writePersistedVideoState(
  ids: Set<string>,
  urls: Map<string, string>
): void {
  if (typeof window === 'undefined') return

  const idList = Array.from(ids).slice(-MAX_PERSISTED_VIDEO_IDS)
  const urlRecord: Record<string, string> = {}
  for (const id of idList) {
    const url = urls.get(id)
    if (url) urlRecord[id] = url
  }
  const payload: PersistedVideoState = { ids: idList, urls: urlRecord }
  const serialized = JSON.stringify(payload)

  try {
    sessionStorage.setItem(LOADED_VIDEOS_SESSION_KEY, serialized)
  } catch {
    // memory state remains valid
  }
  try {
    localStorage.setItem(LOADED_VIDEOS_LOCAL_KEY, serialized)
  } catch {
    // optional cross-session layer
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const loadedVideoIdsRef = useRef<Set<string>>(new Set())
  const videoUrlCacheRef = useRef<Map<string, string>>(new Map())
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    hydrateMediaCache()
    const persisted = readPersistedVideoState()
    loadedVideoIdsRef.current = new Set(persisted.ids)
    videoUrlCacheRef.current = new Map(Object.entries(persisted.urls))
    for (const url of Object.values(persisted.urls)) {
      mediaCacheMark(url)
    }
  }, [])

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      writePersistedVideoState(loadedVideoIdsRef.current, videoUrlCacheRef.current)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [])

  const markVideoLoaded = useCallback(
    (id: string, mediaUrl?: string) => {
      if (!id) return
      loadedVideoIdsRef.current.add(id)
      if (mediaUrl) {
        videoUrlCacheRef.current.set(id, mediaUrl)
        mediaCacheMark(mediaUrl)
      }
      schedulePersist()
    },
    [schedulePersist]
  )

  const isVideoLoaded = useCallback((id: string) => {
    return loadedVideoIdsRef.current.has(id)
  }, [])

  const getVideoUrl = useCallback((id: string) => {
    return videoUrlCacheRef.current.get(id)
  }, [])

  const getCachedFeed = useCallback(
    <T,>(key: string, persistence: CachePersistence = 'session'): T | null => {
      return getCache<T>(key, persistence)
    },
    []
  )

  const setCachedFeed = useCallback(
    <T,>(
      key: string,
      data: T,
      ttl: number = CACHE_TTL.DEFAULT,
      persistence: CachePersistence = 'session'
    ): void => {
      setCache(key, data, ttl, persistence)
    },
    []
  )

  const value = useMemo<AppStateContextValue>(
    () => ({
      markVideoLoaded,
      isVideoLoaded,
      getVideoUrl,
      getCachedFeed,
      setCachedFeed,
      hasMediaBeenFetched: mediaCacheHas,
      markMediaFetched: mediaCacheMark,
    }),
    [markVideoLoaded, isVideoLoaded, getVideoUrl, getCachedFeed, setCachedFeed]
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

/**
 * Reads shared app state. Safe outside a provider — returns no-op stubs so
 * components never crash when rendered in isolation (tests, Storybook).
 */
export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext)
  if (ctx) return ctx

  return {
    markVideoLoaded: () => {},
    isVideoLoaded: () => false,
    getVideoUrl: () => undefined,
    getCachedFeed: <T,>(key: string, persistence?: CachePersistence) =>
      getCache<T>(key, persistence),
    setCachedFeed: <T,>(
      key: string,
      data: T,
      ttl?: number,
      persistence?: CachePersistence
    ) => setCache(key, data, ttl, persistence),
    hasMediaBeenFetched: mediaCacheHas,
    markMediaFetched: mediaCacheMark,
  }
}
