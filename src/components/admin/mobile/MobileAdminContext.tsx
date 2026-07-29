'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

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

const HIDE_CHROME_PREFIXES = ['/admin/news/create', '/admin/quick', '/admin/approvals/']

function shouldHideChrome(pathname: string): boolean {
  if (pathname.includes('/edit')) return true
  return HIDE_CHROME_PREFIXES.some((p) => pathname.startsWith(p) || pathname === p.replace(/\/$/, ''))
}

export function MobileAdminProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [createOpen, setCreateOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingBadge, setPendingBadge] = useState(0)

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
