'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** MOBILE-ADMIN-1: «Hızlı haber / Son dakika» = the mobile editor (one create flow). */
function QuickRedirect() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    router.replace(params.get('mode') === 'breaking' ? '/admin/news/create?mode=breaking' : '/admin/news/create')
  }, [router, params])
  return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
}

export default function AdminQuickPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Yükleniyor…</div>}>
      <QuickRedirect />
    </Suspense>
  )
}
