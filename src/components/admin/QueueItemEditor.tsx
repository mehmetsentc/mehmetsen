'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Save, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { getAdminCategoryGroups, YEREL_HABER_CATEGORY_ID } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'

export interface QueueEditorData {
  id: string
  title: string
  summary: string
  content: string
  imageUrl: string
  categoryId: string
  city: string
  citySlug: string
  district: string
  source: string
  sourceUrl?: string
  tags: string[]
  isBreaking: boolean
  workerId?: string
  status?: string
  createdAt?: number
}

interface QueueItemEditorProps {
  queueId: string
  onClose: () => void
  onSaved?: (data: QueueEditorData) => void
  onPublished?: (result: { newsId: string; slug: string }) => void
}

const fieldCls =
  'w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500'

export function QueueItemEditor({ queueId, onClose, onSaved, onPublished }: QueueItemEditorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [citySlug, setCitySlug] = useState('')
  const [district, setDistrict] = useState('')
  const [source, setSource] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [isBreaking, setIsBreaking] = useState(false)
  const [meta, setMeta] = useState<{ workerId?: string; status?: string; createdAt?: number }>({})

  const categoryGroups = useMemo(() => getAdminCategoryGroups(), [])
  const showCityFields = categoryId === YEREL_HABER_CATEGORY_ID || categoryId.startsWith('yerel-')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        const res = await fetch(`/api/admin/newsroom/queue/${queueId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = (await res.json()) as QueueEditorData & { error?: string }
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        if (cancelled) return
        setTitle(data.title ?? '')
        setSummary(data.summary ?? '')
        setContent(data.content ?? '')
        setImageUrl(data.imageUrl ?? '')
        setCategoryId(data.categoryId ?? '')
        setCitySlug(data.citySlug ?? '')
        setDistrict(data.district ?? '')
        setSource(data.source ?? '')
        setSourceUrl(data.sourceUrl ?? '')
        setTagsText((data.tags ?? []).join(', '))
        setIsBreaking(Boolean(data.isBreaking))
        setMeta({
          workerId: data.workerId,
          status: data.status,
          createdAt: data.createdAt,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Kuyruk öğesi yüklenemedi')
        onClose()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [queueId, onClose])

  function buildPayload() {
    const city = TURKISH_PROVINCES.find((p) => p.slug === citySlug)?.name ?? ''
    return {
      title,
      summary,
      content,
      imageUrl,
      categoryId,
      city,
      citySlug,
      district,
      source,
      tags: tagsText
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      isBreaking,
    }
  }

  async function handleSave() {
    if (saving || publishing) return
    setSaving(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/newsroom/queue/${queueId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      })
      const data = (await res.json()) as QueueEditorData & { error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success('Kuyruk kaydı güncellendi')
      onSaved?.({ ...data, id: queueId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydetme başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (saving || publishing) return
    if (!title.trim()) {
      toast.error('Başlık gerekli')
      return
    }
    const ok = window.confirm('Bu haber AI olmadan doğrudan yayınlanacak. Devam?')
    if (!ok) return

    setPublishing(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/newsroom/queue/${queueId}/publish-manual`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      })
      const data = (await res.json()) as { newsId?: string; slug?: string; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success('Haber yayına alındı (manuel)')
      onPublished?.({ newsId: data.newsId ?? '', slug: data.slug ?? '' })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yayınlama başarısız')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[rgb(var(--color-card))] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Pencil className="h-4 w-4 shrink-0 text-blue-500" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[rgb(var(--color-text))]">Kuyruk Haberini Düzenle</p>
              {meta.workerId && (
                <p className="truncate text-[10px] text-[rgb(var(--color-muted))]">
                  {meta.workerId}
                  {meta.status ? ` · ${meta.status}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-[rgb(var(--color-surface))]"
            aria-label="Kapat"
          >
            <X className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Başlık</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Özet</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  className={cn(fieldCls, 'resize-y')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">İçerik</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className={cn(fieldCls, 'resize-y font-mono text-xs')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Görsel URL</label>
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={fieldCls} />
                {imageUrl.trim() && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="mt-2 max-h-32 rounded-lg border border-[rgb(var(--color-border))] object-cover"
                  />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Kaynak</label>
                  <input value={source} onChange={(e) => setSource(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Kaynak URL</label>
                  <input value={sourceUrl} readOnly className={cn(fieldCls, 'opacity-70')} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Kategori</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Seçin</option>
                  {categoryGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {showCityFields && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Şehir</label>
                    <select
                      value={citySlug}
                      onChange={(e) => setCitySlug(e.target.value)}
                      className={fieldCls}
                    >
                      <option value="">Seçin</option>
                      {TURKISH_PROVINCES.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">İlçe</label>
                    <input value={district} onChange={(e) => setDistrict(e.target.value)} className={fieldCls} />
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Etiketler</label>
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="virgülle ayırın"
                  className={fieldCls}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[rgb(var(--color-text))]">
                <input
                  type="checkbox"
                  checked={isBreaking}
                  onChange={(e) => setIsBreaking(e.target.checked)}
                  className="rounded border-[rgb(var(--color-border))]"
                />
                Son dakika
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-[rgb(var(--color-border))] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[rgb(var(--color-border))] px-4 py-2.5 text-sm font-semibold"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={saving || publishing}
                onClick={() => void handleSave()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-900/20"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
              <button
                type="button"
                disabled={saving || publishing}
                onClick={() => void handlePublish()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Yayına al
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
