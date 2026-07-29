'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { MobileApprovalReview } from '@/components/admin/mobile/MobileApprovalReview'

function ReviewInner() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <MobileApprovalReview id={id} />
}

export default function AdminApprovalDetailPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>}>
      <div className="md:hidden">
        <ReviewInner />
      </div>
      <div className="hidden p-8 md:block">
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Bu inceleme ekranı mobil içindir.{' '}
          <a href="/admin/news?filter=pending" className="font-semibold text-[rgb(var(--color-brand))]">
            Masaüstü onay kuyruğuna git
          </a>
        </p>
      </div>
    </Suspense>
  )
}
