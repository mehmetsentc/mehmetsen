'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { registerHrefWithNext, rememberReturnPath } from '@/lib/auth/returnTo'

interface GameAuthGateProps {
  children: React.ReactNode
}

/**
 * Oyun oynamak için üyelik zorunlu.
 * Misafir → /register?next=<oyun-yolu> (kayıttan sonra aynı oyuna dönüş).
 */
export function GameAuthGate({ children }: GameAuthGateProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const redirected = useRef(false)

  useEffect(() => {
    if (loading || user || redirected.current) return
    redirected.current = true
    rememberReturnPath(pathname)
    router.replace(registerHrefWithNext(pathname))
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
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-[rgb(var(--color-brand))] border-t-transparent" />
        <p className="text-sm font-medium text-[rgb(var(--color-text))]">
          Oynamak için üye olmanız gerekiyor
        </p>
        <p className="text-xs text-[rgb(var(--color-muted))]">Kayıt sayfasına yönlendiriliyorsunuz…</p>
      </div>
    )
  }

  return <>{children}</>
}
