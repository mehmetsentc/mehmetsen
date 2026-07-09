'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { AD_SLOT_MAP, getAdminAdSlotGroups } from '@/constants/adSlots'
import type { AdBanner, AdBannerFormat } from '@/types/adBanner'
import {
  Plus, Loader2, Pencil, Trash2, Megaphone, Image as ImageIcon, Video, Code,
  ToggleLeft, ToggleRight, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

const EMPTY_FORM = {
  name: '',
  slotId: 'leaderboard-top',
  format: 'image' as AdBannerFormat,
  imageUrl: '',
  videoUrl: '',
  htmlContent: '',
  clickUrl: '',
  altText: '',
  active: true,
  priority: 0,
  startsAt: '',
  endsAt: '',
}

export default function AdminAdsPage() {
  const { can } = useCmsAuth()
  const { user } = useAuth()
  const [banners, setBanners] = useState<AdBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdBanner | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filterSlot, setFilterSlot] = useState('')

  const slotGroups = useMemo(() => getAdminAdSlotGroups(), [])

  const authHeaders = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('Oturum gerekli')
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/ads', { headers })
      if (!res.ok) throw new Error('Liste alınamadı')
      const json = await res.json()
      setBanners(json.banners ?? [])
    } catch {
      toast.error('Reklamlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [user, authHeaders])

  useEffect(() => {
    if (can('seo:edit') && user) load()
  }, [can, user, load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (banner: AdBanner) => {
    setEditing(banner)
    setForm({
      name: banner.name,
      slotId: banner.slotId,
      format: banner.format,
      imageUrl: banner.imageUrl ?? '',
      videoUrl: banner.videoUrl ?? '',
      htmlContent: banner.htmlContent ?? '',
      clickUrl: banner.clickUrl ?? '',
      altText: banner.altText ?? '',
      active: banner.active,
      priority: banner.priority,
      startsAt: banner.startsAt ? banner.startsAt.slice(0, 16) : '',
      endsAt: banner.endsAt ? banner.endsAt.slice(0, 16) : '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const headers = await authHeaders()
      const payload = {
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      }
      const url = editing ? `/api/admin/ads/${editing.id}` : '/api/admin/ads'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kayıt başarısız')
      toast.success(editing ? 'Reklam güncellendi' : 'Reklam oluşturuldu')
      setShowForm(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu reklamı silmek istediğinize emin misiniz?')) return
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ads/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error()
      toast.success('Silindi')
      setBanners((prev) => prev.filter((b) => b.id !== id))
    } catch {
      toast.error('Silinemedi')
    }
  }

  const handleToggle = async (banner: AdBanner) => {
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/ads/${banner.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !banner.active }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? json.banner : b)))
    } catch {
      toast.error('Durum güncellenemedi')
    }
  }

  const filtered = filterSlot ? banners.filter((b) => b.slotId === filterSlot) : banners

  if (!can('seo:edit')) {
    return (
      <div className="p-8 text-center text-[rgb(var(--color-muted))]">
        Bu sayfaya erişim yetkiniz yok.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--color-surface))]">
      <CMSHeader
        title="Reklam Yönetimi"
        subtitle="Sayfa ve slot bazlı banner, görsel veya video reklamları"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Yeni Reklam
          </button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-[rgb(var(--color-muted))]">Slot filtresi:</label>
          <select
            value={filterSlot}
            onChange={(e) => setFilterSlot(e.target.value)}
            className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm"
          >
            <option value="">Tümü</option>
            {slotGroups.flatMap((g) =>
              g.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {g.label} — {s.label}
                </option>
              ))
            )}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-muted))]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
            <Megaphone className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-muted))]" />
            <p className="font-semibold text-[rgb(var(--color-text))]">Henüz reklam yok</p>
            <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Ana sayfa veya kategori slotlarına banner ekleyin.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <table className="w-full text-sm">
              <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-left text-xs uppercase tracking-wide text-[rgb(var(--color-muted))]">
                <tr>
                  <th className="px-4 py-3">Reklam</th>
                  <th className="hidden px-4 py-3 md:table-cell">Slot</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Format</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((banner) => (
                  <tr key={banner.id} className="border-b border-[rgb(var(--color-border))] last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[rgb(var(--color-text))]">{banner.name}</p>
                      <p className="text-xs text-[rgb(var(--color-muted))]">Öncelik: {banner.priority}</p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="text-[rgb(var(--color-text))]">{AD_SLOT_MAP[banner.slotId]?.label ?? banner.slotId}</p>
                    </td>
                    <td className="hidden px-4 py-3 capitalize sm:table-cell">{banner.format}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => handleToggle(banner)} aria-label="Durum değiştir">
                        {banner.active ? (
                          <ToggleRight className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-[rgb(var(--color-muted))]" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {banner.clickUrl ? (
                          <a href={banner.clickUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 hover:bg-[rgb(var(--color-surface))]">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                        <button type="button" onClick={() => openEdit(banner)} className="rounded-lg p-2 hover:bg-[rgb(var(--color-surface))]">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(banner.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[rgb(var(--color-card))] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold">{editing ? 'Reklamı Düzenle' : 'Yeni Reklam'}</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Reklam adı</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                  placeholder="Örn: Sinpaş Otomobil Kampanyası"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Sayfa / Slot</label>
                <select
                  value={form.slotId}
                  onChange={(e) => setForm((f) => ({ ...f, slotId: e.target.value }))}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                >
                  {slotGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-[rgb(var(--color-muted))]">Format</label>
                <div className="flex gap-2">
                  {([
                    ['image', ImageIcon, 'Görsel'],
                    ['video', Video, 'Video'],
                    ['html', Code, 'HTML'],
                  ] as const).map(([key, Icon, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, format: key }))}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold',
                        form.format === key
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                          : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {form.format === 'image' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Görsel URL</label>
                  <input
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>
              ) : null}

              {form.format === 'video' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Video URL (MP4/WebM)</label>
                  <input
                    value={form.videoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>
              ) : null}

              {form.format === 'html' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">HTML / Embed kodu</label>
                  <textarea
                    value={form.htmlContent}
                    onChange={(e) => setForm((f) => ({ ...f, htmlContent: e.target.value }))}
                    rows={4}
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 font-mono text-xs"
                    placeholder="<iframe ...></iframe>"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Tıklama linki (isteğe bağlı)</label>
                <input
                  value={form.clickUrl}
                  onChange={(e) => setForm((f) => ({ ...f, clickUrl: e.target.value }))}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Alt metin (erişilebilirlik)</label>
                <input
                  value={form.altText}
                  onChange={(e) => setForm((f) => ({ ...f, altText: e.target.value }))}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Öncelik</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    />
                    Aktif
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Başlangıç</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Bitiş</label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                    className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
