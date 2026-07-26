'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { getGameRules } from '@/constants/gameRules'
import { sortValueToDisplay, type GameScoreMetric } from '@/lib/games/scores'

export type LeaderRow = {
  rank: number
  userId: string
  username: string
  displayName: string
  metric: GameScoreMetric
  displayValue: number
  sortValue: number
  wins: number
}

type GameScoresCtx = {
  gameSlug: string
  leaders: LeaderRow[]
  myBest: number | null
  loading: boolean
  metric: GameScoreMetric
  submitScore: (value: number, opts?: { won?: boolean }) => Promise<unknown>
  refresh: () => Promise<void>
  formatValue: (value: number, metric?: GameScoreMetric) => string
}

const Ctx = createContext<GameScoresCtx | null>(null)

export function GameScoresProvider({
  gameSlug,
  children,
}: {
  gameSlug: string
  children: ReactNode
}) {
  const { user } = useAuth()
  const rules = getGameRules(gameSlug)
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [myBest, setMyBest] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const submitting = useRef(false)

  const refresh = useCallback(async () => {
    if (!rules) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/games/scores?game=${encodeURIComponent(gameSlug)}&limit=10`)
      const data = (await res.json()) as { leaders?: LeaderRow[] }
      const list = data.leaders ?? []
      setLeaders(list)
      if (user?.uid) {
        const mine = list.find((l) => l.userId === user.uid)
        setMyBest(mine ? mine.displayValue : null)
      }
    } catch {
      /* sessiz */
    } finally {
      setLoading(false)
    }
  }, [gameSlug, rules, user?.uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submitScore = useCallback(
    async (value: number, opts?: { won?: boolean }) => {
      if (!rules || !user || submitting.current) return null
      submitting.current = true
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return null

        const payloadValue =
          rules.metric === 'wins' ? Math.max(1, Math.round(value) || 1) : Math.round(value)

        const res = await fetch('/api/games/scores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameSlug,
            value: payloadValue,
            won: opts?.won ?? false,
            username: user.username ?? '',
            displayName: user.displayName ?? user.username ?? '',
          }),
        })
        const data = (await res.json()) as {
          best?: { displayValue: number }
        }
        if (!res.ok) return null
        if (typeof data.best?.displayValue === 'number') {
          setMyBest(data.best.displayValue)
        }
        void refresh()
        return data.best ?? null
      } catch {
        return null
      } finally {
        submitting.current = false
      }
    },
    [gameSlug, refresh, rules, user]
  )

  const formatValue = useCallback(
    (value: number, metric: GameScoreMetric = rules?.metric ?? 'score') =>
      sortValueToDisplay(metric, 0, value),
    [rules?.metric]
  )

  const value = useMemo(
    () => ({
      gameSlug,
      leaders,
      myBest,
      loading,
      metric: (rules?.metric ?? 'score') as GameScoreMetric,
      submitScore,
      refresh,
      formatValue,
    }),
    [formatValue, gameSlug, leaders, loading, myBest, refresh, rules?.metric, submitScore]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGameScores(gameSlug?: string): GameScoresCtx {
  const ctx = useContext(Ctx)
  const { user } = useAuth()
  const slug = gameSlug ?? ctx?.gameSlug ?? ''
  const rules = getGameRules(slug)
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [myBest, setMyBest] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const submitting = useRef(false)

  const refreshFallback = useCallback(async () => {
    if (!slug || !rules) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/games/scores?game=${encodeURIComponent(slug)}&limit=10`)
      const data = (await res.json()) as { leaders?: LeaderRow[] }
      const list = data.leaders ?? []
      setLeaders(list)
      if (user?.uid) {
        const mine = list.find((l) => l.userId === user.uid)
        setMyBest(mine ? mine.displayValue : null)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [rules, slug, user?.uid])

  useEffect(() => {
    if (ctx && (!gameSlug || gameSlug === ctx.gameSlug)) return
    void refreshFallback()
  }, [ctx, gameSlug, refreshFallback])

  const submitFallback = useCallback(
    async (value: number, opts?: { won?: boolean }) => {
      if (!rules || !user || submitting.current) return null
      submitting.current = true
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return null
        const payloadValue =
          rules.metric === 'wins' ? Math.max(1, Math.round(value) || 1) : Math.round(value)
        const res = await fetch('/api/games/scores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameSlug: slug,
            value: payloadValue,
            won: opts?.won ?? false,
            username: user.username ?? '',
            displayName: user.displayName ?? user.username ?? '',
          }),
        })
        const data = (await res.json()) as { best?: { displayValue: number } }
        if (!res.ok) return null
        if (typeof data.best?.displayValue === 'number') setMyBest(data.best.displayValue)
        void refreshFallback()
        return data.best ?? null
      } catch {
        return null
      } finally {
        submitting.current = false
      }
    },
    [refreshFallback, rules, slug, user]
  )

  if (ctx && (!gameSlug || gameSlug === ctx.gameSlug)) return ctx

  return {
    gameSlug: slug,
    leaders,
    myBest,
    loading,
    metric: rules?.metric ?? 'score',
    submitScore: submitFallback,
    refresh: refreshFallback,
    formatValue: (value, metric = rules?.metric ?? 'score') =>
      sortValueToDisplay(metric, 0, value),
  }
}
