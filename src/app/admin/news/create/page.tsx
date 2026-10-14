'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { AdminNewsEditor } from '@/components/admin/AdminNewsEditor'
import { MobileEditor } from '@/components/admin/mobile/MobileEditor'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

function CreateInner() {
  const { user } = useAuth()
  const params = useSearchParams()
  const isMobile = useIsMobileAdminViewport()

  if (!user || isMobile === null) return null
  // MOBILE-ADMIN-1: phones / tablets get the 3-step editor; «Tam editör» (?full=1) keeps the desktop one.
  if (isMobile && params.get('full') !== '1') {
    return <MobileEditor mode="create" breakingDefault={params.get('mode') === 'breaking'} />
  }

  return (
    <div className="p-0 md:p-6 lg:p-8">
      <AdminNewsEditor
        mode="create"
        variant="page"
        userId={user.uid}
        username={user.username}
      />
    </div>
  )
}

export default function AdminNewsCreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateInner />
    </Suspense>
  )
}
