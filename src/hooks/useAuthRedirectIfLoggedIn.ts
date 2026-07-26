'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import {
  consumeReturnPath,
  rememberReturnPath,
  sanitizeReturnPath,
} from '@/lib/auth/returnTo'

/** Sends authenticated users away from login/register pages. */
export function useAuthRedirectIfLoggedIn() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const next = sanitizeReturnPath(searchParams.get('next'))
    if (next) rememberReturnPath(next)
  }, [searchParams])

  useEffect(() => {
    if (loading || !user) return
    if (!user.onboardingCompleted) {
      router.replace(ROUTES.ONBOARDING)
      return
    }
    router.replace(consumeReturnPath() ?? ROUTES.FEED)
  }, [user, loading, router, user?.onboardingCompleted])
}
