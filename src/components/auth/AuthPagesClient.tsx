'use client'

import { useAuthRedirectIfLoggedIn } from '@/hooks/useAuthRedirectIfLoggedIn'

/** Redirects authenticated users away from login/register pages. */
export function AuthPagesClient({ children }: { children: React.ReactNode }) {
  useAuthRedirectIfLoggedIn()
  return <>{children}</>
}
