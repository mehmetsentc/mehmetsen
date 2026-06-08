'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NewsTable } from '@/components/admin/NewsTable'
import { adminNewsService, type AdminNewsFilter, type AdminNewsItem } from '@/services/adminNewsService'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

const FILTERS: { id: AdminNewsFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'published', label: 'Yayında' },
  { id: 'pending', label: 'Onay Bekliyor' },
  { id: 'draft', label: 'Taslak' },
  { id: 'removed', label: 'Kaldırıldı' },
]

export default function AdminNewsPage() {
  const [filter, setFilter] = useState<AdminNewsFilter>('all')
  const [posts, setPosts] = useState<AdminNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(
    async (reset = true) => {
      setLoading(true)
      try {
        const result = await adminNewsService.list(filter, reset ? undefined : lastDoc ?? undefined)
        setPosts((prev) => (reset ? result.posts : [...prev, ...result.posts]))
        setLastDoc(result.lastDoc)
        setHasMore(result.hasMore)
      } catch (err) {
        console.error(err)
        toast.error('Haberler yüklenemedi')
      } finally {
        setLoading(false)
      }
    },
    [filter, lastDoc]
  )

  useEffect(() => {
    setLastDoc(null)
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const handleApprove = async (post: AdminNewsItem) => {
    setActionLoading(post.id)
    try {
      await adminNewsService.approve(post.id, post.adminSource)
      toast.success('Haber onaylandı')
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
    } catch {
      toast.error('Onaylama başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (post: AdminNewsItem) => {
    setActionLoading(post.id)
    try {
      await adminNewsService.reject(post.id, post.adminSource)
      toast.success('Haber reddedildi')
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
    } catch {
      toast.error('Reddetme başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Bu haberi kaldırmak istediğinize emin misiniz?')) return
    setActionLoading(id)
    try {
      await adminNewsService.remove(id)
      toast.success('Haber kaldırıldı')
      setPosts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'archived' as const } : p))
      )
    } catch {
      toast.error('Kaldırma başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Haberler</h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Tüm haberleri yönetin, onaylayın veya kaldırın
          </p>
        </div>
        <Link href={ROUTES.ADMIN.NEWS_CREATE}>
          <Button>
            <Plus className="mr-2 inline h-4 w-4" />
            Yeni Haber
          </Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === f.id
                ? 'bg-brand-600 text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <NewsTable
        posts={posts}
        loading={loading}
        onApprove={handleApprove}
        onReject={handleReject}
        onRemove={handleRemove}
        actionLoading={actionLoading}
      />

      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => load(false)}>
            Daha Fazla Yükle
          </Button>
        </div>
      )}
    </div>
  )
}
