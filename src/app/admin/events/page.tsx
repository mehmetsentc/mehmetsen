'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { StatsCard } from '@/components/admin/StatsCard'
import { Button } from '@/components/ui/Button'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { EVENT_CATEGORIES, getEventCategoryLabel } from '@/lib/eventUtils'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { adminService } from '@/services/adminService'
import type { EventCategory, EventStatus, NaEvent } from '@/types/event'

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

function formatEventTime(iso?: string): string {
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

function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function adminFetch(path: string, init?: RequestInit) {
  const user = auth.currentUser
  if (!user) throw new Error('Giriş yapmalısınız.')
  const token = await user.getIdToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'İstek başarısız')
  return data
}

const EMPTY_FORM = {
  title: '',
  citySlug: 'istanbul',
  venue: '',
  startsAt: '',
  endsAt: '',
  category: 'other' as EventCategory,
  description: '',
  ticketUrl: '',
  coverImageUrl: '',
  address: '',
  organizer: '',
}

export default function AdminEventsPage() {
  const [count, setCount] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<SyncStats | null>(null)
  const [items, setItems] = useState<NaEvent[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [q, setQ] = useState('')
  const [citySlug, setCitySlug] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formStatus, setFormStatus] = useState<EventStatus>('published')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refreshCount = useCallback(() => {
    adminService.getEventsCount().then(setCount).catch(console.error)
  }, [])

  const refreshMeta = useCallback(() => {
    adminService
      .getEventSyncMeta()
      .then((meta) => {
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
      })
      .catch(console.error)
  }, [])

  const loadItems = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (citySlug) params.set('citySlug', citySlug)
      if (status) params.set('status', status)
      if (source) params.set('source', source)
      const data = (await adminFetch(`/api/admin/events?${params.toString()}`)) as { items?: NaEvent[] }
      setItems(data.items ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Liste alınamadı')
    } finally {
      setLoadingList(false)
    }
  }, [q, citySlug, status, source])

  useEffect(() => {
    refreshCount()
    refreshMeta()
  }, [refreshCount, refreshMeta])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

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
      if (!res.ok) throw new Error(data.error ?? 'Senkronizasyon başarısız')
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
      await loadItems()
      toast.success('Etkinlik senkronizasyonu tamamlandı.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Senkronizasyon başarısız')
    } finally {
      setSyncing(false)
    }
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormStatus('published')
  }

  const startCreate = () => {
    if (showForm && !editingId) {
      closeForm()
      return
    }
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormStatus('published')
    setShowForm(true)
  }

  const startEdit = (item: NaEvent) => {
    setEditingId(item.id)
    setFormStatus(item.status)
    setForm({
      title: item.title,
      citySlug: item.citySlug || 'istanbul',
      venue: item.venue || '',
      startsAt: toLocalInput(item.startsAt),
      endsAt: toLocalInput(item.endsAt),
      category: item.category || 'other',
      description: item.description || '',
      ticketUrl: item.ticketUrl || '',
      coverImageUrl: item.coverImageUrl || '',
      address: item.address || '',
      organizer: item.organizer || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        status: formStatus,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
      }
      if (editingId) {
        await adminFetch(`/api/admin/events/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        toast.success('Etkinlik güncellendi.')
      } else {
        await adminFetch('/api/admin/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Etkinlik eklendi.')
      }
      closeForm()
      refreshCount()
      await loadItems()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : editingId ? 'Güncellenemedi' : 'Eklenemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: NaEvent) => {
    const providerSourced = item.source && !['firestore', 'init-script', 'admin'].includes(item.source)
    const ok = window.confirm(
      providerSourced
        ? `"${item.title}" sağlayıcı kaydı iptal edilecek (cancelled). Devam?`
        : `"${item.title}" kalıcı silinecek. Devam?`
    )
    if (!ok) return
    setDeletingId(item.id)
    try {
      await adminFetch(`/api/admin/events/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      toast.success(providerSourced ? 'Etkinlik iptal edildi.' : 'Etkinlik silindi.')
      refreshCount()
      await loadItems()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Silinemedi')
    } finally {
      setDeletingId(null)
    }
  }

  const statusLabel = useMemo(
    () =>
      ({
        published: 'Yayında',
        draft: 'Taslak',
        cancelled: 'İptal',
      }) satisfies Record<EventStatus, string>,
    []
  )

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Event Yönetimi</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Etkinlik ekle, düzenle, listele ve sil. Sağlayıcı kayıtları iptal edilir; manuel kayıtlar
          silinir.
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

      <div className="mb-6 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6">
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Biletix occurrence senkronu gece 00:00 (İstanbul) çalışır. Bu sayfa manuel yönetim içindir;
          cron delete yapmaz.
        </p>
        {lastSync && (
          <div className="mt-3 space-y-1 text-xs text-[rgb(var(--color-muted))]">
            <p>
              Son senkron: <strong>{formatSyncTime(lastSync.completedAt)}</strong> (TR)
            </p>
            <p>
              {lastSync.scraped} çekildi · {lastSync.inserted} yeni · {lastSync.updated} güncellendi ·{' '}
              {lastSync.skipped} atlandı
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('mr-2 inline h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Senkronize ediliyor…' : 'Şimdi senkronize et'}
          </Button>
          <Link href={ROUTES.EVENTS} target="_blank">
            <Button variant="secondary">
              <ExternalLink className="mr-2 inline h-4 w-4" />
              Etkinlikler sayfası
            </Button>
          </Link>
          <Button variant="secondary" onClick={startCreate}>
            <Plus className="mr-2 inline h-4 w-4" />
            {showForm && !editingId ? 'Formu kapat' : 'Event ekle'}
          </Button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="mb-6 grid gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 md:grid-cols-2"
        >
          <div className="md:col-span-2 text-sm font-medium">
            {editingId ? 'Etkinliği düzenle' : 'Yeni etkinlik'}
          </div>
          <label className="text-sm">
            Başlık
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            İl
            <select
              value={form.citySlug}
              onChange={(e) => setForm((f) => ({ ...f, citySlug: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            >
              {TURKISH_PROVINCES.map((province) => (
                <option key={province.slug} value={province.slug}>
                  {province.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Mekan
            <input
              required
              value={form.venue}
              onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Kategori
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as EventCategory }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            >
              {EVENT_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Başlangıç
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Bitiş (opsiyonel)
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm md:col-span-2">
            Açıklama
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Bilet URL
            <input
              value={form.ticketUrl}
              onChange={(e) => setForm((f) => ({ ...f, ticketUrl: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Görsel URL
            <input
              value={form.coverImageUrl}
              onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Adres
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Organizatör
            <input
              value={form.organizer}
              onChange={(e) => setForm((f) => ({ ...f, organizer: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
            />
          </label>
          {editingId && (
            <label className="text-sm">
              Durum
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as EventStatus)}
                className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
              >
                <option value="published">Yayında</option>
                <option value="draft">Taslak</option>
                <option value="cancelled">İptal</option>
              </select>
            </label>
          )}
          <div className="md:col-span-2 flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Kaydediliyor…' : editingId ? 'Değişiklikleri kaydet' : 'Event kaydet'}
            </Button>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Vazgeç
            </Button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Başlık / mekan ara"
          className="min-w-[200px] flex-1 rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={citySlug}
          onChange={(e) => setCitySlug(e.target.value)}
          className="rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Tüm iller</option>
          {TURKISH_PROVINCES.map((province) => (
            <option key={province.slug} value={province.slug}>
              {province.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Tüm durumlar</option>
          <option value="published">Yayında</option>
          <option value="cancelled">İptal</option>
          <option value="draft">Taslak</option>
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-md border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Tüm kaynaklar</option>
          <option value="biletix">Biletix</option>
          <option value="firestore">Manuel</option>
          <option value="bubilet">Bubilet</option>
          <option value="ticketmaster">Ticketmaster</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-card))] text-xs uppercase text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">İl / Mekan</th>
              <th className="px-3 py-2">Zaman</th>
              <th className="px-3 py-2">Kaynak</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loadingList ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-[rgb(var(--color-muted))]">
                  Yükleniyor…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-[rgb(var(--color-muted))]">
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-[rgb(var(--color-border))]">
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-[rgb(var(--color-muted))]">
                      {getEventCategoryLabel(item.category)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {item.city || item.citySlug}
                    <div className="text-xs text-[rgb(var(--color-muted))]">{item.venue}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatEventTime(item.startsAt)}</td>
                  <td className="px-3 py-2">{item.source || 'firestore'}</td>
                  <td className="px-3 py-2">{statusLabel[item.status] || item.status}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="mr-3 inline-flex items-center gap-1 text-[rgb(var(--color-text))]"
                    >
                      <Pencil className="h-4 w-4" />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => void handleDelete(item)}
                      className="inline-flex items-center gap-1 text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Sil
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
