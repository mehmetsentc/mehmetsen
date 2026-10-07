'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { canAccessCms } from '@/lib/cmsAuth'
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied'
import {
  isScopedEditorPathAllowed,
  loadMyStaffScope,
  type MyStaffScope,
} from '@/lib/cms/staffScopeClient'

const IS_DEV = process.env.NODE_ENV === 'development'

function AdminSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[rgb(var(--color-bg))]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      {label && <p className="text-sm text-[rgb(var(--color-muted))]">{label}</p>}
    </div>
  )
}

/** Requires auth + admin role. Skips onboarding redirect for admins. */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || '/admin'
  const deniedToastShown = useRef(false)
  // Phase 2: il/ilçe/kategori editors only see their own section.
  const [staffScope, setStaffScope] = useState<MyStaffScope | null | undefined>(undefined)

  useEffect(() => {
    if (loading || !user || !canAccessCms(user)) return
    let alive = true
    void loadMyStaffScope().then((s) => {
      if (alive) setStaffScope(s)
    })
    return () => {
      alive = false
    }
  }, [user, loading])

  const scopedBlocked =
    staffScope?.scoped === true && !isScopedEditorPathAllowed(pathname, staffScope)

  useEffect(() => {
    if (scopedBlocked) router.replace('/admin/news')
  }, [scopedBlocked, router])

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.replace(ROUTES.LOGIN)
      return
    }

    if (!canAccessCms(user)) {
      if (!deniedToastShown.current) {
        deniedToastShown.current = true
        if (IS_DEV) {
          toast.error('Admin yetkisi gerekli — kurulum adımları aşağıda', { duration: 5000 })
        } else {
          toast.error('Admin yetkisi gerekli')
        }
      }
      if (!IS_DEV) {
        router.replace(ROUTES.FEED)
      }
    }
  }, [user, loading, router])

  if (loading) return <AdminSpinner />
  if (!user) return <AdminSpinner label="Giriş sayfasına yönlendiriliyor..." />
  if (!canAccessCms(user)) {
    return <AdminAccessDenied uid={user.uid} showSetupGuide={IS_DEV} />
  }

  if (staffScope === undefined || scopedBlocked) return <AdminSpinner />

  return <>{children}</>
}
