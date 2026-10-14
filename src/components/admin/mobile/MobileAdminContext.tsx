'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { shouldHideChrome } from '@/lib/mobileAdminRules'

interface MobileAdminContextValue {
  createOpen: boolean
  openCreate: () => void
  closeCreate: () => void
  searchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
  notifOpen: boolean
  openNotif: () => void
  closeNotif: () => void
  hideChrome: boolean
  pendingBadge: number
  setPendingBadge: (n: number) => void
}

const MobileAdminContext = createContext<MobileAdminContextValue | null>(null)

/** Pending approvals for the «Haberler» badge — one count query every 2 min while the admin is open on a phone. */
function usePendingBadge(setPendingBadge: (n: number) => void) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return
    let alive = true
    const tick = async () => {
      try {
        const { countVisiblePendingApprovals } = await import('@/services/adminNewsService')
        const n = await countVisiblePendingApprovals()
        if (alive) setPendingBadge(n)
      } catch {
        // keep the last value
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 120_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [setPendingBadge])
}

export function MobileAdminProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [createOpen, setCreateOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingBadge, setPendingBadge] = useState(0)

  usePendingBadge(setPendingBadge)

  const openCreate = useCallback(() => setCreateOpen(true), [])
  const closeCreate = useCallback(() => setCreateOpen(false), [])
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const openNotif = useCallback(() => setNotifOpen(true), [])
  const closeNotif = useCallback(() => setNotifOpen(false), [])

  const value = useMemo(
    () => ({
      createOpen,
      openCreate,
      closeCreate,
      searchOpen,
      openSearch,
      closeSearch,
      notifOpen,
      openNotif,
      closeNotif,
      hideChrome: shouldHideChrome(pathname),
      pendingBadge,
      setPendingBadge,
    }),
    [
      createOpen,
      openCreate,
      closeCreate,
      searchOpen,
      openSearch,
      closeSearch,
      notifOpen,
      openNotif,
      closeNotif,
      pathname,
      pendingBadge,
    ]
  )

  return <MobileAdminContext.Provider value={value}>{children}</MobileAdminContext.Provider>
}

export function useMobileAdmin() {
  const ctx = useContext(MobileAdminContext)
  if (!ctx) throw new Error('useMobileAdmin must be used within MobileAdminProvider')
  return ctx
}
