'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * MOBILE-ADMIN-1: approvals live in the single «Haberler» list on every screen size
 * (filter «Onay bekleyen»). Single-item review stays at /admin/approvals/[id].
 */
export default function AdminApprovalsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/news?filter=pending')
  }, [router])
  return (
    <p className="p-8 text-sm text-[rgb(var(--color-muted))]">
      Onay bekleyen haberlere yönlendiriliyorsunuz…
    </p>
  )
}
