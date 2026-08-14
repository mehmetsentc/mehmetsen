'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import toast from 'react-hot-toast'

type QueueItem = {
  id: string
  newsId?: string | null
  citySlug?: string | null
  platform?: string | null
  status: string
  createdAt: number
  errorMessage?: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function SmmQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [counts, setCounts] = useState({ queued: 0, failed: 0, published: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/os-ops?resource=smm-queue', { headers: await authHeaders() })
      const body = (await res.json()) as {
        items?: QueueItem[]
        counts?: typeof counts
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'fail')
      setItems(body.items ?? [])
      if (body.counts) setCounts(body.counts)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const enqueueSample = async () => {
    try {
      const res = await fetch('/api/admin/os-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          resource: 'smm-queue',
          citySlug: 'canakkale',
          platform: 'facebook',
        }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success('Kuyruğa eklendi')
      void load()
    } catch {
      toast.error('Eklenemedi (social:publish gerekir)')
    }
  }

  return (
    <AdminOsPageShell
      title="SMM Paylaşım Kuyruğu"
      subtitle="Idempotent publish · retry · dead-letter — smmQueue koleksiyonu"
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void enqueueSample()}
            className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white"
          >
            Test kuyruk kaydı
          </button>
          <Link href="/admin/social" className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold">
            Sosyal hesaplar
          </Link>
        </div>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Kuyruk', value: loading ? '…' : String(counts.queued), tone: 'warn' },
          { label: 'Yayınlandı', value: String(counts.published), tone: 'ok' },
          { label: 'Başarısız', value: String(counts.failed) },
          { label: 'Toplam', value: String(items.length) },
        ]}
      />

      {items.length === 0 && !loading ? (
        <AdminOsEmptyState
          title="Kuyruk boş"
          description="Test kaydı ekleyebilir veya mevcut /admin/social üzerinden manuel paylaşım yapabilirsiniz. Auto-share cron Çanakkale path’i hâlâ çalışır."
          href="/admin/social"
          hrefLabel="Sosyal panele git"
        />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {i.platform || 'platform'} · {i.citySlug || '—'}
                </p>
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {i.newsId ? `news ${i.newsId}` : 'news yok'} · {i.status}
                  {i.errorMessage ? ` · ${i.errorMessage}` : ''}
                </p>
              </div>
              <span className="text-[10px] tabular-nums text-[rgb(var(--color-muted))]">
                {i.createdAt ? format(new Date(i.createdAt), 'dd.MM HH:mm') : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </AdminOsPageShell>
  )
}
