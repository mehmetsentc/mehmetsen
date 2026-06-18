'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface ReelsAudioContextValue {
  muted: boolean
  toggleMuted: () => void
  setMuted: (muted: boolean) => void
}

const ReelsAudioContext = createContext<ReelsAudioContextValue | undefined>(undefined)

const REELS_MUTED_KEY = 'nahaber-reels-muted'

function readInitialMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = sessionStorage.getItem(REELS_MUTED_KEY)
    // '1' = muted, '0' = unmuted; null (first visit) → unmuted (ses açık)
    return stored === '1'
  } catch {
    return false
  }
}

export function ReelsAudioProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    setMutedState(readInitialMuted())
  }, [])

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value)
    try {
      sessionStorage.setItem(REELS_MUTED_KEY, value ? '1' : '0')
    } catch {
      // ignore
    }
  }, [])

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem(REELS_MUTED_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ muted, toggleMuted, setMuted }),
    [muted, toggleMuted, setMuted]
  )

  return <ReelsAudioContext.Provider value={value}>{children}</ReelsAudioContext.Provider>
}

export function useReelsAudio() {
  const ctx = useContext(ReelsAudioContext)
  if (!ctx) {
    throw new Error('useReelsAudio must be used within ReelsAudioProvider')
  }
  return ctx
}
