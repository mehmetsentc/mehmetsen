'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MobileMenu } from '@/components/admin/mobile/MobileMenu'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

export default function AdminMenuPage() {
  const isMobile = useIsMobileAdminViewport()
  const router = useRouter()

  // ADMIN-UX-1: on a wide screen the sidebar is the menu — go to the dashboard instead of an empty page
  useEffect(() => {
    if (isMobile === false) router.replace('/admin')
  }, [isMobile, router])

  if (!isMobile) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  return <MobileMenu />
}
