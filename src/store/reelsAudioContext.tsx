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
import { applyReelsAudioPreference } from '@/lib/videoPlayback'
import { effectiveMutedFromPlayer, nextPreferredMutedFromUiToggle } from '@/lib/videoFeed/playbackIntent'

interface ReelsAudioContextValue {
  muted: boolean
  effectiveMuted: boolean
  toggleMuted: () => void
  setMuted: (muted: boolean) => void
  reportPlayerMuted: (actual: boolean) => void
}

const ReelsAudioContext = createContext<ReelsAudioContextValue | undefined>(undefined)

const REELS_MUTED_KEY = 'nahaber-reels-muted'

function readInitialMuted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const stored = localStorage.getItem(REELS_MUTED_KEY)
    return stored !== '0'
  } catch {
    return true
  }
}

function saveToStorage(value: boolean) {
  try {
    localStorage.setItem(REELS_MUTED_KEY, value ? '1' : '0')
  } catch { /* ignore */ }
}

export function ReelsAudioProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(true)
  const [playerMuted, setPlayerMuted] = useState<boolean | null>(null)

  useEffect(() => {
    setMutedState(readInitialMuted())
  }, [])

  const effectiveMuted = effectiveMutedFromPlayer({
    preferredMuted: muted,
    playerMuted,
  })

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value)
    saveToStorage(value)
    applyReelsAudioPreference(value)
  }, [])

  const toggleMuted = useCallback(() => {
    const shown = playerMuted ?? muted
    const next = nextPreferredMutedFromUiToggle(shown)
    setMutedState(next)
    saveToStorage(next)
    applyReelsAudioPreference(next)
  }, [playerMuted, muted])

  const reportPlayerMuted = useCallback((actual: boolean) => {
    setPlayerMuted(actual)
  }, [])

  const value = useMemo(
    () => ({ muted, effectiveMuted, toggleMuted, setMuted, reportPlayerMuted }),
    [muted, effectiveMuted, toggleMuted, setMuted, reportPlayerMuted]
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
