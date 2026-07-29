'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Camera, ImagePlus } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { storageService } from '@/services/storageService'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { getAdminCategoryGroups } from '@/constants/config'
import { cn } from '@/lib/utils'

export function MobileQuickComposer() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const breakingDefault = searchParams.get('mode') === 'breaking'
  const { user, can } = useCmsAuth()

  const [title, setTitle] = useState('')
  const [spot, setSpot] = useState('')
  const [categoryId, setCategoryId] = useState(breakingDefault ? 'gundem' : 'gundem')
  const [isBreaking, setIsBreaking] = useState(breakingDefault)
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catOpen, setCatOpen] = useState(false)

  const categories = useMemo(
    () => getAdminCategoryGroups().flatMap((g) => g.categories.filter((c) => !c.parentId)),
    []
  )
  const selectedLabel = categories.find((c) => c.id === categoryId)?.name ?? 'Kategori seç'

  async function onPickImage(file: File | null) {
    if (!file || !user) return
    setUploading(true)
    setError(null)
    try {
      const url = await storageService.uploadPostImage(file, user.uid, `quick-${Date.now()}`)
      setImageUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Görsel yüklenemedi')
    } finally {
      setUploading(false)
    }
  }

  async function submit(status: 'pending' | 'published' | 'draft') {
    if (!title.trim()) {
      setError('Başlık gerekli')
      return
    }
    if (status === 'published' && !can('news:publish')) {
      setError('Doğrudan yayınlama yetkiniz yok — onaya gönderin')
      return
    }
    const current = auth.currentUser
    if (!current) {
      setError('Giriş gerekli')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const token = await current.getIdToken()
      const res = await fetch('/api/admin/news', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          summary: spot.trim() || title.trim().slice(0, 160),
          content: spot.trim() || title.trim(),
          spot: spot.trim(),
          categoryId,
          status,
          isBreaking,
          thumbnail: imageUrl || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Kayıt başarısız')
      if (status === 'pending') router.replace('/admin/approvals')
      else if (data.id) router.replace(`/admin/news/${data.id}/edit`)
      else router.replace('/admin/news')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="sticky top-0 z-20 flex items-center gap-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button type="button" onClick={() => router.back()} className="flex h-11 w-11 items-center justify-center" aria-label="Kapat">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-sm font-bold text-[rgb(var(--color-text))]">
          {isBreaking ? 'Son Dakika' : 'Hızlı Haber'}
        </h1>
      </header>

      <div className="flex-1 space-y-4 px-4 py-4 pb-36">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Başlık</span>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={3}
            placeholder="Manşeti yazın veya dikte edin…"
            className="mt-1.5 w-full resize-none rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 text-[1.35rem] font-bold leading-snug text-[rgb(var(--color-text))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/30"
          />
          <span className="mt-1 block text-right text-[11px] text-[rgb(var(--color-muted))]">{title.length} / 70</span>
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Spot</span>
          <textarea
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
            rows={3}
            placeholder="Kısa özet (opsiyonel)"
            className="mt-1.5 w-full resize-none rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 text-[15px] leading-relaxed text-[rgb(var(--color-text))] outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/30"
          />
        </label>

        <button
          type="button"
          onClick={() => setCatOpen(true)}
          className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 text-left"
        >
          <span>
            <span className="block text-[11px] font-bold uppercase text-[rgb(var(--color-muted))]">Kategori</span>
            <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{selectedLabel}</span>
          </span>
          <span className="text-[rgb(var(--color-muted))]">›</span>
        </button>

        <div className="flex items-center justify-between rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
          <span className="text-sm font-semibold text-[rgb(var(--color-text))]">Son Dakika</span>
          <button
            type="button"
            role="switch"
            aria-checked={isBreaking}
            onClick={() => setIsBreaking((v) => !v)}
            className={cn(
              'relative h-7 w-12 rounded-full transition-colors',
              isBreaking ? 'bg-[rgb(var(--color-brand))]' : 'bg-[rgb(var(--color-border))]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform',
                isBreaking ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
          {imageUrl ? (
            <div className="relative overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="aspect-video w-full object-cover" />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white"
                onClick={() => setImageUrl('')}
              >
                Kaldır
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-surface))] text-sm font-semibold text-[rgb(var(--color-text))]">
                <Camera className="h-4 w-4" />
                Çek
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-surface))] text-sm font-semibold text-[rgb(var(--color-text))]">
                <ImagePlus className="h-4 w-4" />
                Galeri
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
          {uploading ? <p className="mt-2 text-center text-xs text-[rgb(var(--color-muted))]">Yükleniyor…</p> : null}
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 pt-2"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit('draft')}
            className="min-h-12 flex-1 rounded-xl border border-[rgb(var(--color-border))] text-sm font-semibold disabled:opacity-60"
          >
            Taslak
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit('pending')}
            className="min-h-12 flex-[1.3] rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white disabled:opacity-60"
          >
            Onaya Gönder
          </button>
          {can('news:publish') ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Haber şimdi yayınlanacak. Emin misiniz?')) void submit('published')
              }}
              className="min-h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
            >
              Yayınla
            </button>
          ) : null}
        </div>
      </div>

      {catOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setCatOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-[rgb(var(--color-card))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="mb-2 text-sm font-bold">Kategori seç</p>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id)
                  setCatOpen(false)
                }}
                className={cn(
                  'flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium',
                  categoryId === c.id ? 'bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]' : 'text-[rgb(var(--color-text))]'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
