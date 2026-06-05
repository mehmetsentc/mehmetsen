'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireAdmin?: boolean
}

export function AuthGuard({
  children,
  requireAuth = true,
  requireAdmin = false,
}: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    if (requireAuth && !user) {
      router.replace(ROUTES.LOGIN)
      return
    }

    if (requireAdmin && user?.role !== 'admin') {
      router.replace(ROUTES.FEED)
      return
    }

    if (!requireAuth && user) {
      router.replace(ROUTES.FEED)
    }
  }, [user, loading, requireAuth, requireAdmin, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (requireAuth && !user) return null
  if (requireAdmin && user?.role !== 'admin') return null
  if (!requireAuth && user) return null

  return <>{children}</>
}
