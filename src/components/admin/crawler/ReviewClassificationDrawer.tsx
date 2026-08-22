'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { DEFAULT_CATEGORIES, getAdminCategoryGroups } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import type { RawArticleReviewMeta } from '@/services/crawler/editorial/reviewMeta'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function ReviewClassificationDrawer({
  open,
  rawArticleId,
  newsId,
  title,
  reviewMeta,
  onClose,
  onSaved,
}: {
  open: boolean
  rawArticleId: string
  newsId: string
  title: string
  reviewMeta: RawArticleReviewMeta | null
  onClose: () => void
  onSaved: () => void
}) {
  const [categoryId, setCategoryId] = useState(reviewMeta?.categoryId || '')
  const [citySlug, setCitySlug] = useState(reviewMeta?.citySlug || '')
  const [tagsText, setTagsText] = useState((reviewMeta?.tags || []).join(', '))
  const [busy, setBusy] = useState(false)

  const categoryGroups = useMemo(() => getAdminCategoryGroups(), [])

  useEffect(() => {
    if (!open) return
    setCategoryId(reviewMeta?.categoryId || '')
    setCitySlug(reviewMeta?.citySlug || '')
    setTagsText((reviewMeta?.tags || []).join(', '))
  }, [open, reviewMeta, newsId])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  async function save(completeReview: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      const res = await fetch('/api/admin/crawler/articles/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          newsId,
          categoryId: categoryId || undefined,
          citySlug,
          tags,
          completeReview,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Kaydedilemedi')
      toast.success(completeReview ? 'Sınıflandırma kaydedildi, inceleme tamamlandı' : 'Sınıflandırma kaydedildi')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  const categoryLabel = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)?.name || categoryId || '—'

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" data-drawer-backdrop="true">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Kapat" onClick={onClose} />
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-xl sm:rounded-2xl"
        data-drawer-panel="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">İnceleme — Sınıflandırma</h2>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
              Yalnızca kategori, şehir ve etiket düzeltmesi. AI yeniden çalışmaz.
            </p>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-sm underline" onClick={onClose}>
            Kapat
          </button>
        </div>

        <p className="mb-3 text-sm font-medium">{title}</p>
        <p className="mb-4 text-[11px] text-[rgb(var(--color-muted))]">
          Ham: {rawArticleId} · Haber: {newsId}
        </p>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Kategori
            </span>
            <select
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={busy}
            >
              <option value="">Seçin — mevcut: {categoryLabel}</option>
              {categoryGroups.flatMap((g) =>
                g.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {g.label} · {c.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Şehir
            </span>
            <select
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5"
              value={citySlug}
              onChange={(e) => setCitySlug(e.target.value)}
              disabled={busy}
            >
              <option value="">Ulusal / şehir yok</option>
              {TURKISH_PROVINCES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Etiketler
            </span>
            <input
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="virgülle ayırın"
              disabled={busy}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm underline" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm"
            onClick={() => void save(false)}
            disabled={busy}
          >
            Kaydet
          </button>
          <button
            type="button"
            className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-sm text-white"
            onClick={() => void save(true)}
            disabled={busy}
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet ve İncelemeyi Bitir'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
