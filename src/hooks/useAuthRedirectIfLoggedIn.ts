'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'

/** Sends authenticated users away from login/register pages. */
export function useAuthRedirectIfLoggedIn() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading || !user) return
    router.replace(user.onboardingCompleted ? ROUTES.FEED : ROUTES.ONBOARDING)
  }, [user, loading, router, user?.onboardingCompleted])
}
