'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { isAdminUser } from '@/lib/admin'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireAdmin?: boolean
}

function AuthSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  )
}

export function AuthGuard({
  children,
  requireAuth = true,
  requireAdmin = false,
}: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const deniedToastShown = useRef(false)
  const redirectingRef = useRef(false)

  useEffect(() => {
    if (loading) return

    // 1) Onboarding gate — user oturum açmışsa onboarding tamamlanana kadar
    // tüm rotalardan /onboarding'e zorla. Public rotalarda da geçerlidir;
    // böylece Google ile yeni kayıt olan kullanıcı dolaşırken /onboarding'i
    // atlayamaz.
    if (user && !user.onboardingCompleted && pathname !== ROUTES.ONBOARDING) {
      router.replace(ROUTES.ONBOARDING)
      return
    }

    if (!requireAuth) return

    if (!user) {
      if (!redirectingRef.current) {
        redirectingRef.current = true
        router.replace(ROUTES.LOGIN)
      }
      return
    }

    redirectingRef.current = false

    if (requireAdmin && !isAdminUser(user)) {
      if (!deniedToastShown.current) {
        deniedToastShown.current = true
        toast.error('Admin yetkisi gerekli')
      }
      router.replace(ROUTES.FEED)
    }
  }, [user, loading, requireAuth, requireAdmin, router, pathname])

  // Render shell immediately while auth resolves — nav stays interactive.
  if (loading) {
    return <>{children}</>
  }

  // Onboarding gate — public route'ta bile onboarding tamamlanmamışsa
  // yönlendirme spinner'ı göster. /onboarding'in kendisi hariç.
  if (user && !user.onboardingCompleted && pathname !== ROUTES.ONBOARDING) {
    return <AuthSpinner label="Profilini tamamla..." />
  }

  if (!requireAuth) {
    return <>{children}</>
  }

  if (!user) {
    return <AuthSpinner label="Giriş sayfasına yönlendiriliyor..." />
  }

  if (requireAdmin && !isAdminUser(user)) {
    return <AuthSpinner label="Yönlendiriliyor..." />
  }

  return <>{children}</>
}
