'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Check, X, Trash2, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import type { AdminNewsItem } from '@/services/adminNewsService'

const STATUS_LABELS: Record<string, string> = {
  published: 'Yayında',
  pending: 'Onay Bekliyor',
  draft: 'Taslak',
  archived: 'Kaldırıldı',
  banned: 'Yasaklı',
}

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-red-100 text-red-700',
  banned: 'bg-red-100 text-red-700',
}

interface NewsTableProps {
  posts: AdminNewsItem[]
  loading?: boolean
  onApprove?: (post: AdminNewsItem) => void
  onReject?: (post: AdminNewsItem) => void
  onRemove?: (id: string) => void
  actionLoading?: string | null
}

export function NewsTable({
  posts,
  loading,
  onApprove,
  onReject,
  onRemove,
  actionLoading,
}: NewsTableProps) {
  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center text-[rgb(var(--color-muted))]">
        Haber bulunamadı
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
          <tr>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Başlık</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Yazar</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Kategori</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Kaynak</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Durum</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Tarih</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--color-border))]">
          {posts.map((post) => (
            <tr key={post.id} className="bg-[rgb(var(--color-card))] hover:bg-[rgb(var(--color-surface))]">
              <td className="max-w-[200px] truncate px-4 py-3 font-medium text-[rgb(var(--color-text))]">
                {post.title}
              </td>
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">@{post.authorUsername}</td>
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                {getCategoryLabel(post.categoryId) || '—'}
              </td>
              <td className="max-w-[120px] truncate px-4 py-3 text-xs text-[rgb(var(--color-muted))]">
                {post.source || '—'}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[post.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {post.adminSource === 'newsDrafts' ? 'AI Taslak' : STATUS_LABELS[post.status] ?? post.status}
                </span>
              </td>
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: tr })}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  {post.status === 'pending' && onApprove && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onApprove(post)}
                      disabled={actionLoading === post.id}
                      title="Onayla"
                      className="!px-2"
                    >
                      {actionLoading === post.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {post.status === 'pending' && onReject && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onReject(post)}
                      disabled={actionLoading === post.id}
                      title="Reddet"
                      className="!px-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Link href={ROUTES.ADMIN.NEWS_EDIT(post.id)}>
                    <Button size="sm" variant="secondary" title="Düzenle" className="!px-2">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  {post.status === 'published' && onRemove && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onRemove(post.id)}
                      disabled={actionLoading === post.id}
                      title="Kaldır"
                      className="!px-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
