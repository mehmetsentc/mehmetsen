'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { adminArchiveService, type AdminArchiveItem } from '@/services/adminArchiveService'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

export default function AdminArchivePage() {
  const [items, setItems] = useState<AdminArchiveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(
    async (reset = true) => {
      setLoading(true)
      try {
        const result = await adminArchiveService.list(reset ? undefined : lastDoc ?? undefined)
        setItems((prev) => (reset ? result.items : [...prev, ...result.items]))
        setLastDoc(result.lastDoc)
        setHasMore(result.hasMore)
      } catch (err) {
        console.error(err)
        toast.error('Arşiv yüklenemedi')
      } finally {
        setLoading(false)
      }
    },
    [lastDoc]
  )

  useEffect(() => {
    setLastDoc(null)
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Haber Arşivi</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-text-muted))]">
          Son 90 gün RSS arşivi — feed&apos;e otomatik yayınlanmaz ({items.length} kayıt)
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full divide-y divide-[rgb(var(--color-border))] text-sm">
          <thead className="bg-[rgb(var(--color-surface-elevated))]">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Başlık</th>
              <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Kategori</th>
              <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Şehir</th>
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Kaynak</th>
              <th className="px-4 py-3 text-right font-medium">Güven</th>
              <th className="px-4 py-3 text-right font-medium">Arşiv</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--color-border))]">
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[rgb(var(--color-text-muted))]">
                  Yükleniyor…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[rgb(var(--color-text-muted))]">
                  Henüz arşiv kaydı yok.{' '}
                  <code className="text-xs">npm run newsroom-archive -- --maxAiCalls=5</code>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-[rgb(var(--color-surface-elevated))]/50">
                  <td className="max-w-xs px-4 py-3">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {item.title}
                    </a>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--color-text-muted))]">
                      {item.summary}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{item.categoryId || '—'}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{item.city || '—'}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{item.source}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.confidenceScore}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-[rgb(var(--color-text-muted))]">
                    {item.archivedAt
                      ? formatDistanceToNow(item.archivedAt, { addSuffix: true, locale: tr })
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" disabled={loading} onClick={() => load(false)}>
            Daha fazla
          </Button>
        </div>
      )}
    </div>
  )
}
