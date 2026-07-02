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
  if (typeof window === 'undefined') return true
  try {
    const stored = localStorage.getItem(REELS_MUTED_KEY)
    // null = ilk ziyaret → sessiz (tarayıcı autoplay politikası gereği)
    // '0' = kullanıcı daha önce açıkça sesi açmış → sessiz değil
    // '1' = kullanıcı daha önce açıkça sessize almış → sessiz
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
