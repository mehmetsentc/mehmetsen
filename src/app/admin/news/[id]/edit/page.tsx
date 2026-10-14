'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Clapperboard, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { AdminNewsEditor } from '@/components/admin/AdminNewsEditor'
import { ArticleInsightsPanel } from '@/components/admin/ArticleInsightsPanel'
import { adminNewsService } from '@/services/adminNewsService'
import type { Post } from '@/types/post'
import { MobileEditor } from '@/components/admin/mobile/MobileEditor'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

function AdminNewsEditInner() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const params = useSearchParams()
  const isMobile = useIsMobileAdminViewport()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    adminNewsService
      .getById(id)
      .then(setPost)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading || isMobile === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  if (!post || !user) {
    return (
      <div className="p-8 text-center text-[rgb(var(--color-muted))]">Haber bulunamadı</div>
    )
  }

  // MOBILE-ADMIN-1: phones / tablets edit in the 3-step editor; «Tam editör» (?full=1) = desktop editor.
  if (isMobile && params.get('full') !== '1') {
    return <MobileEditor mode="edit" post={post} />
  }

  return (
    <div className="p-0 md:p-6 lg:p-8">
      <ArticleInsightsPanel articleId={post.id} />
      {post.status === 'published' ? (
        <div className="mb-3 flex justify-end px-4 md:px-0">
          <Link
            href={`/admin/media-studio/reels?newsId=${encodeURIComponent(post.id)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-semibold"
          >
            <Clapperboard className="h-4 w-4" /> Reels oluştur
          </Link>
        </div>
      ) : null}
      <AdminNewsEditor
        mode="edit"
        variant="page"
        post={post}
        userId={user.uid}
        username={user.username}
      />
    </div>
  )
}

export default function AdminNewsEditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      }
    >
      <AdminNewsEditInner />
    </Suspense>
  )
}
