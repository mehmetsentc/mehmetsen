'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const linkClass =
  'text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline'

interface DesktopHeaderAuthProps {
  className?: string
}

export function DesktopHeaderAuth({ className }: DesktopHeaderAuthProps) {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    setHydrated(true)
    setHasSession(Boolean(auth.currentUser))
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setHasSession(Boolean(firebaseUser))
    })
    return unsub
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.FEED)
  }, [logout, router])

  const goTo = useCallback(
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      event.stopPropagation()
      router.push(href)
    },
    [router]
  )

  const isLoggedIn = Boolean(user) || hasSession
  const displayLabel = user?.displayName || user?.username || 'Hesabım'
  const showLogin = hydrated && !isLoggedIn && !loading

  return (
    <div
      className={cn(
        'relative z-[100] flex items-center gap-3 text-[12px] font-semibold pointer-events-auto',
        className
      )}
      data-no-category-swipe
    >
      {isLoggedIn ? (
        <>
          <span
            className="max-w-[140px] truncate text-[rgb(var(--color-text))]"
            title={displayLabel}
          >
            {displayLabel}
          </span>
          <button type="button" onClick={handleLogout} className={linkClass}>
            Çıkış Yap
          </button>
        </>
      ) : showLogin ? (
        <a href={ROUTES.LOGIN} className={linkClass} onClick={goTo(ROUTES.LOGIN)}>
          Giriş
        </a>
      ) : (
        <span className="invisible select-none" aria-hidden>
          Giriş
        </span>
      )}
      <a href={ROUTES.APP} className={linkClass} onClick={goTo(ROUTES.APP)}>
        Uygulama
      </a>
    </div>
  )
}
