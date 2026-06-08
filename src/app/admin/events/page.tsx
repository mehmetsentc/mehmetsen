'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { StatsCard } from '@/components/admin/StatsCard'
import { Button } from '@/components/ui/Button'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { adminService } from '@/services/adminService'
import { ROUTES } from '@/constants/routes'

interface SyncStats {
  completedAt?: string
  scraped: number
  inserted: number
  updated: number
  skipped: number
  markedPast: number
  markedRemoved: number
  durationMs: number
  failedProviders?: string[]
}

function formatSyncTime(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export default function AdminEventsPage() {
  const [count, setCount] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<SyncStats | null>(null)

  const refreshCount = useCallback(() => {
    adminService.getEventsCount().then(setCount).catch(console.error)
  }, [])

  const refreshMeta = useCallback(() => {
    adminService.getEventSyncMeta().then((meta) => {
      if (!meta) return
      setLastSync({
        completedAt: meta.completedAt,
        scraped: meta.scraped ?? 0,
        inserted: meta.inserted ?? 0,
        updated: meta.updated ?? 0,
        skipped: meta.skipped ?? 0,
        markedPast: meta.markedPast ?? 0,
        markedRemoved: meta.markedRemoved ?? 0,
        durationMs: meta.durationMs ?? 0,
        failedProviders: meta.failedProviders,
      })
    }).catch(console.error)
  }, [])

  useEffect(() => {
    refreshCount()
    refreshMeta()
  }, [refreshCount, refreshMeta])

  const handleSync = async () => {
    const user = auth.currentUser
    if (!user) {
      toast.error('Senkronizasyon için giriş yapmalısınız.')
      return
    }

    setSyncing(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/events/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Senkronizasyon başarısız')
      }
      setLastSync({
        completedAt: data.completedAt,
        scraped: data.scraped ?? 0,
        inserted: data.inserted ?? 0,
        updated: data.updated ?? 0,
        skipped: data.skipped ?? 0,
        markedPast: data.markedPast ?? 0,
        markedRemoved: data.markedRemoved ?? 0,
        durationMs: data.durationMs ?? 0,
        failedProviders: data.failedProviders,
      })
      refreshCount()
      toast.success('Etkinlik senkronizasyonu tamamlandı.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Senkronizasyon başarısız'
      toast.error(message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Etkinlikler</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Firestore etkinlik koleksiyonu — günlük senkronizasyon
        </p>
      </div>

      <div className="mb-8 max-w-sm">
        <StatsCard
          title="Toplam Etkinlik"
          value={count ?? '…'}
          icon={CalendarDays}
          accent="blue"
          description="Firestore events koleksiyonu"
        />
      </div>

      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6">
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Etkinlikler Biletix, Bubilet ve Biletino&apos;dan her gece 00:00 (İstanbul)
          sunucu tarafında çekilir ve Firestore <code>events</code> koleksiyonuna yazılır.
          Değişmeyen kayıtlar <code>fingerprint</code> ile atlanır; sayfa yüklemeleri
          yalnızca Firestore&apos;dan okur. Kaynak feed&apos;inden düşen etkinlikler{' '}
          <strong>cancelled</strong> olarak işaretlenir.
        </p>

        {lastSync && (
          <div className="mt-3 space-y-1 text-xs text-[rgb(var(--color-muted))]">
            <p>
              Son senkron: <strong>{formatSyncTime(lastSync.completedAt)}</strong> (TR)
            </p>
            <p>
              {lastSync.scraped} çekildi · {lastSync.inserted} yeni · {lastSync.updated}{' '}
              güncellendi · {lastSync.skipped} atlandı · {lastSync.markedPast} geçmişe alındı
              {lastSync.markedRemoved > 0 ? ` · ${lastSync.markedRemoved} kaldırıldı` : ''} (
              {(lastSync.durationMs / 1000).toFixed(1)}s)
            </p>
            {lastSync.failedProviders && lastSync.failedProviders.length > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                Başarısız sağlayıcılar: {lastSync.failedProviders.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('mr-2 inline h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Senkronize ediliyor…' : 'Şimdi senkronize et'}
          </Button>
          <Link href={ROUTES.EVENTS}>
            <Button variant="secondary">
              <ExternalLink className="mr-2 inline h-4 w-4" />
              Etkinlikler Sayfası
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
