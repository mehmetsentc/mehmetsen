'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MobileApprovals } from '@/components/admin/mobile/MobileApprovals'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

function DesktopRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/news?filter=pending')
  }, [router])
  return (
    <p className="p-8 text-sm text-[rgb(var(--color-muted))]">
      Masaüstü onay kuyruğuna yönlendiriliyorsunuz…
    </p>
  )
}

export default function AdminApprovalsPage() {
  const isMobile = useIsMobileAdminViewport()

  if (isMobile === null) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  if (isMobile) return <MobileApprovals />
  return <DesktopRedirect />
}
