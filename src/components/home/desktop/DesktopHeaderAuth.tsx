'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ChevronDown, User } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface DesktopHeaderAuthProps {
  className?: string
  /** Concept B kırmızı bar üzerinde beyaz / outline stil */
  variant?: 'default' | 'onBrand'
}

export function DesktopHeaderAuth({
  className,
  variant = 'default',
}: DesktopHeaderAuthProps) {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const onBrand = variant === 'onBrand'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    setHydrated(true)
    setHasSession(Boolean(auth.currentUser))
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setHasSession(Boolean(firebaseUser))
    })
    return unsub
  }, [])

  const handleLogout = useCallback(async () => {
    setMenuOpen(false)
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

  const linkClass = onBrand
    ? 'text-white/90 transition-colors hover:text-white hover:underline'
    : 'text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline'

  const loginBtnClass = onBrand
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-white/80 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/10'
    : linkClass

  return (
    <div
      className={cn(
        'relative z-[100] flex items-center gap-3 text-[12px] font-semibold pointer-events-auto',
        className
      )}
      data-no-category-swipe
    >
      {isLoggedIn && !onBrand ? (
        // Desktop newspaper header: one account menu instead of
        // name + Çıkış Yap + Uygulama links side by side.
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex max-w-[180px] items-center gap-1 text-[rgb(var(--color-text))] transition-colors hover:underline"
            title={displayLabel}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-1 text-[13px] font-medium shadow-lg"
            >
              {user?.username ? (
                <a
                  role="menuitem"
                  href={ROUTES.PROFILE(user.username)}
                  onClick={goTo(ROUTES.PROFILE(user.username))}
                  className="block px-3 py-2 text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
                >
                  Profilim
                </a>
              ) : null}
              <a
                role="menuitem"
                href={ROUTES.SETTINGS}
                onClick={goTo(ROUTES.SETTINGS)}
                className="block px-3 py-2 text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
              >
                Hesap ayarları
              </a>
              <a
                role="menuitem"
                href={ROUTES.APP}
                onClick={goTo(ROUTES.APP)}
                className="block px-3 py-2 text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
              >
                Mobil uygulama
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="block w-full border-t border-[rgb(var(--color-border))] px-3 py-2 text-left text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-nav-hover))] hover:text-[rgb(var(--color-text))]"
              >
                Çıkış yap
              </button>
            </div>
          ) : null}
        </div>
      ) : isLoggedIn ? (
        <>
          <span
            className={cn(
              'max-w-[140px] truncate',
              onBrand ? 'text-white' : 'text-[rgb(var(--color-text))]'
            )}
            title={displayLabel}
          >
            {displayLabel}
          </span>
          <button type="button" onClick={handleLogout} className={linkClass}>
            Çıkış Yap
          </button>
        </>
      ) : showLogin ? (
        <a href={ROUTES.LOGIN} className={loginBtnClass} onClick={goTo(ROUTES.LOGIN)}>
          {onBrand ? <User className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> : null}
          Giriş
        </a>
      ) : (
        <span className="invisible select-none" aria-hidden>
          Giriş
        </span>
      )}
      {onBrand ? (
        <a href={ROUTES.APP} className={linkClass} onClick={goTo(ROUTES.APP)}>
          Uygulama
        </a>
      ) : null}
    </div>
  )
}
