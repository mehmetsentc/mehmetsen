'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { AdminNewsForm } from '@/components/admin/AdminNewsForm'
import { adminNewsService } from '@/services/adminNewsService'
import type { Post } from '@/types/post'

export default function AdminNewsEditPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
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

  if (loading) {
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

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Haber Düzenle</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">{post.title}</p>
      </div>
      <AdminNewsForm mode="edit" post={post} userId={user.uid} username={user.username} />
    </div>
  )
}
