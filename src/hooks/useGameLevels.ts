'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  getUnlockedLevel,
  unlockNextLevel,
  type GameLevelId,
} from '@/lib/games/progress'

export function useGameLevels(gameSlug: string) {
  const { user } = useAuth()
  const userId = user?.uid ?? 'guest'
  const [unlocked, setUnlocked] = useState<GameLevelId>(1)
  const [level, setLevel] = useState<GameLevelId>(1)

  useEffect(() => {
    const u = getUnlockedLevel(gameSlug, userId)
    setUnlocked(u)
    setLevel(1)
  }, [gameSlug, userId])

  const selectLevel = useCallback(
    (next: GameLevelId) => {
      if (next > unlocked) return
      setLevel(next)
    },
    [unlocked]
  )

  const completeLevel = useCallback(() => {
    const nextUnlocked = unlockNextLevel(gameSlug, userId, level)
    setUnlocked(nextUnlocked)
    return nextUnlocked
  }, [gameSlug, userId, level])

  return { level, unlocked, selectLevel, completeLevel, setLevel }
}
