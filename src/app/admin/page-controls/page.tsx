'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { PageLayout, PageLayoutBlock } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function PageControlsPage() {
  const [layouts, setLayouts] = useState<PageLayout[]>([])
  const [selected, setSelected] = useState('home')
  const [layout, setLayout] = useState<PageLayout | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const listRes = await fetch('/api/admin/page-layouts', { headers })
      if (!listRes.ok) throw new Error('list failed')
      const listBody = (await listRes.json()) as { layouts: PageLayout[] }
      setLayouts(listBody.layouts)
      const pageRes = await fetch(`/api/admin/page-layouts?page=${encodeURIComponent(selected)}`, { headers })
      if (pageRes.ok) {
        const pageBody = (await pageRes.json()) as { layout: PageLayout }
        setLayout(pageBody.layout)
      }
    } catch {
      setLayouts([])
      setLayout(null)
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    void load()
  }, [load])

  const moveBlock = (id: string, dir: -1 | 1) => {
    if (!layout) return
    const blocks = [...layout.blocks].sort((a, b) => a.order - b.order)
    const idx = blocks.findIndex((b) => b.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= blocks.length) return
    const tmp = blocks[idx].order
    blocks[idx] = { ...blocks[idx], order: blocks[swap].order }
    blocks[swap] = { ...blocks[swap], order: tmp }
    setLayout({ ...layout, blocks })
  }

  const toggleBlock = (id: string) => {
    if (!layout) return
    setLayout({
      ...layout,
      blocks: layout.blocks.map((b) => (b.id === id ? { ...b, active: !b.active } : b)),
    })
  }

  const save = async (action: 'save' | 'publish') => {
    if (!layout) return
    try {
      const res = await fetch('/api/admin/page-layouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          pageKey: selected,
          action,
          label: layout.label,
          blocks: layout.blocks,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      const body = (await res.json()) as { layout: PageLayout }
      setLayout(body.layout)
      toast.success(action === 'publish' ? 'Yayınlandı' : 'Taslak kaydedildi')
      void load()
    } catch {
      toast.error('İşlem başarısız')
    }
  }

  const sorted: PageLayoutBlock[] = [...(layout?.blocks ?? [])].sort((a, b) => a.order - b.order)

  return (
    <AdminOsPageShell title="Sayfa Kontrolleri" subtitle="Ana sayfa / Feed / Yerel / Reels blokları — sürümlemeli">
      <AdminOsMetricGrid
        items={[
          { label: 'Sayfa', value: String(layouts.length || '—') },
          { label: 'Blok', value: String(sorted.length) },
          { label: 'Durum', value: layout?.status ?? '—' },
          { label: 'Sürüm', value: layout ? String(layout.version) : '—' },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(layouts.length ? layouts : [{ id: 'home', pageKey: 'home', label: 'Ana Sayfa' }]).map((p) => (
          <button
            key={p.pageKey}
            type="button"
            onClick={() => setSelected(p.pageKey)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold',
              selected === p.pageKey
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
            )}
          >
            {p.label || p.pageKey}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
      ) : !layout ? (
        <AdminOsEmptyState title="Layout yok" description="API veya izin hatası." />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save('save')}
              className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
            >
              Taslak kaydet
            </button>
            <button
              type="button"
              onClick={() => void save('publish')}
              className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white"
            >
              Yayınla
            </button>
          </div>
          <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            {sorted.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{b.title}</p>
                  <p className="admin-meta">
                    {b.kind} · limit {b.limit} · {b.source}
                    {b.categoryId ? ` · ${b.categoryId}` : ''}
                  </p>
                </div>
                <button type="button" className="text-xs font-semibold" onClick={() => moveBlock(b.id, -1)}>
                  ↑
                </button>
                <button type="button" className="text-xs font-semibold" onClick={() => moveBlock(b.id, 1)}>
                  ↓
                </button>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={b.active} onChange={() => toggleBlock(b.id)} />
                  Aktif
                </label>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            Yayınlama public homepage’i otomatik değiştirmez — layout kaydı versionlanır; render bağlama sonraki adım.
          </p>
        </div>
      )}
    </AdminOsPageShell>
  )
}
