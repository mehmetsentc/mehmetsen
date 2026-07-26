'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { loginHrefWithNext, registerHrefWithNext, rememberReturnPath } from '@/lib/auth/returnTo'
import { GameScoresProvider } from '@/hooks/useGameScores'

interface GameAuthGateProps {
  children: React.ReactNode
  gameSlug: string
}

/**
 * Oyun oynamak için üyelik zorunlu.
 * Misafir → kayıt/giriş; skorlar yalnızca üyelerde saklanır.
 */
export function GameAuthGate({ children, gameSlug }: GameAuthGateProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const redirected = useRef(false)

  useEffect(() => {
    if (loading || user || redirected.current) return
    redirected.current = true
    rememberReturnPath(pathname)
    const t = window.setTimeout(() => {
      router.replace(registerHrefWithNext(pathname))
    }, 1200)
    return () => window.clearTimeout(t)
  }, [loading, user, router, pathname])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-[rgb(var(--color-brand))] border-t-transparent" />
        <p className="text-sm text-[rgb(var(--color-muted))]">Oyun yükleniyor…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-4xl" aria-hidden>
          🎮
        </div>
        <h1 className="text-xl font-black text-[rgb(var(--color-text))]">
          Oynamak için üye ol
        </h1>
        <p className="text-sm leading-relaxed text-[rgb(var(--color-muted))]">
          Oyunlar yalnızca üyeler içindir. Üye olunca skorun kaydedilir ve sıralamada görünür.
        </p>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={registerHrefWithNext(pathname)}
            className="rounded-2xl bg-[rgb(var(--color-brand))] px-5 py-3 text-sm font-bold text-white"
          >
            Üye ol
          </Link>
          <Link
            href={loginHrefWithNext(pathname)}
            className="rounded-2xl border border-[rgb(var(--color-border))] px-5 py-3 text-sm font-bold text-[rgb(var(--color-text))]"
          >
            Giriş yap
          </Link>
        </div>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Kayıt sayfasına yönlendiriliyorsunuz…
        </p>
      </div>
    )
  }

  return <GameScoresProvider gameSlug={gameSlug}>{children}</GameScoresProvider>
}
