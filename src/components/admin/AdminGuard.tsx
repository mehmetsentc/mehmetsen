'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { isAdminUser } from '@/lib/admin'
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied'

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
  const deniedToastShown = useRef(false)

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.replace(ROUTES.LOGIN)
      return
    }

    if (!isAdminUser(user)) {
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
  if (!isAdminUser(user)) {
    return <AdminAccessDenied uid={user.uid} showSetupGuide={IS_DEV} />
  }

  return <>{children}</>
}
