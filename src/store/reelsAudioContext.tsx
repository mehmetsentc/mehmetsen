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

// localStorage → oturumlar arası ses tercihi kalıcı (sessionStorage değil)
const REELS_MUTED_KEY = 'nahaber-reels-muted'

function readInitialMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = localStorage.getItem(REELS_MUTED_KEY)
    // '1' = muted, '0' veya null (ilk ziyaret) → unmuted (ses açık varsayılan)
    return stored === '1'
  } catch {
    return false
  }
}

function saveToStorage(value: boolean) {
  try {
    localStorage.setItem(REELS_MUTED_KEY, value ? '1' : '0')
  } catch { /* ignore */ }
}

export function ReelsAudioProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    setMutedState(readInitialMuted())
  }, [])

  // Sadece kullanıcı açıkça toggle ettiğinde storage'a yazar
  const setMuted = useCallback((value: boolean) => {
    setMutedState(value)
    saveToStorage(value)
  }, [])

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev
      saveToStorage(next)
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
