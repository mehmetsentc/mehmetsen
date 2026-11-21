'use client'

import { Suspense } from 'react'
import { SocialAccountsWorkspace } from '@/components/admin/social/accounts/SocialAccountsWorkspace'

/**
 * «Sosyal hesaplar» — compact list + detail panel. Connecting, OAuth, scope
 * editing and automation keep using the existing flows and APIs.
 */
export default function SocialAdminAccountsPage() {
  return (
    <Suspense fallback={null}>
      <SocialAccountsWorkspace />
    </Suspense>
  )
}
