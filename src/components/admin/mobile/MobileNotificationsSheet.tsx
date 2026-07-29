'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Bell } from 'lucide-react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { useMobileAdmin } from './MobileAdminContext'

interface NotifItem {
  id: string
  title: string
  message: string
  href: string
  createdAt: number
}

function tsToMs(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof val === 'object' && 'toMillis' in val) return (val as { toMillis(): number }).toMillis()
  if (val && typeof val === 'object' && 'seconds' in val) return (val as { seconds: number }).seconds * 1000
  return Date.now()
}

export function MobileNotificationsSheet() {
  const { notifOpen, closeNotif, pendingBadge } = useMobileAdmin()
  const [items, setItems] = useState<NotifItem[]>([])

  useEffect(() => {
    if (!notifOpen) return
    return onSnapshot(
      query(
        collection(db, 'newsDrafts'),
        where('draftStatus', '==', 'pending_review'),
        orderBy('createdAt', 'desc'),
        limit(20)
      ),
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: 'Onay bekliyor',
              message: (data.title as string) || 'Başlıksız haber',
              href: `/admin/approvals/${d.id}?source=newsDrafts`,
              createdAt: tsToMs(data.createdAt),
            }
          })
        )
      },
      () => setItems([])
    )
  }, [notifOpen])

  if (!notifOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[rgb(var(--color-bg))] md:hidden">
      <div
        className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <Bell className="ml-1 h-5 w-5 text-[rgb(var(--color-brand))]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[rgb(var(--color-text))]">Bildirimler</p>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            {pendingBadge > 0 ? `${pendingBadge > 99 ? '99+' : pendingBadge} onay bekliyor` : 'Güncel durum'}
          </p>
        </div>
        <button
          type="button"
          onClick={closeNotif}
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {items.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-[rgb(var(--color-muted))]">Yeni bildirim yok.</p>
        ) : (
          <div className="divide-y divide-[rgb(var(--color-border))]">
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={closeNotif}
                className="block px-4 py-3.5 active:bg-[rgb(var(--color-surface))]"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-amber-600">{n.title}</p>
                <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">{n.message}</p>
                <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                  {formatDistanceToNow(new Date(n.createdAt), { locale: tr, addSuffix: true })}
                </p>
              </Link>
            ))}
          </div>
        )}
        <div className="px-4 py-4">
          <Link
            href="/admin/approvals"
            onClick={closeNotif}
            className="flex h-12 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white"
          >
            Onay kuyruğunu aç
          </Link>
        </div>
      </div>
    </div>
  )
}
