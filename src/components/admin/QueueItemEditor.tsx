'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Save, Send, Sparkles, Wand2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { getAdminCategoryGroups, isYerelCategoryTree, YEREL_HABER_CATEGORY_ID } from '@/constants/config'
import { getDistrictsForProvince, TURKISH_PROVINCES } from '@/constants/cities'
import { stripHtmlToNewsPlainText } from '@/lib/stripHtmlToNewsPlainText'
import { cn } from '@/lib/utils'

interface PublishReadyAiResult {
  title?: string
  spot?: string
  summary?: string
  content?: string
  categoryId?: string
  tags?: string[]
  imageOrder?: string[]
  qualityScore?: number
  gateDecision?: 'publish' | 'review'
  editorName?: string | null
  suggestedCitySlug?: string | null
  suggestedDistrictSlug?: string | null
  suggestedCountrySlug?: string | null
  error?: string
}

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
  queueDuplicateSuspect?: boolean
  queueDuplicateRole?: string | null
  queueDuplicateOf?: string | null
  queueDuplicateSimilarity?: number | null
  qualityScore?: number | null
  peerQualityScore?: number | null
}

interface QueueItemEditorProps {
  queueId: string
  onClose: () => void
  onBusyChange?: (busy: boolean) => void
  onSaved?: (data: QueueEditorData) => void
  onPublished?: (result: { newsId: string; slug: string }) => void
}

const fieldCls =
  'w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500'

export function QueueItemEditor({ queueId, onClose, onBusyChange, onSaved, onPublished }: QueueItemEditorProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [aiPreparing, setAiPreparing] = useState(false)
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
  const [dupMeta, setDupMeta] = useState<{
    suspect: boolean
    role: string | null
    peerId: string | null
    similarity: number | null
    qualityScore: number | null
    peerQualityScore: number | null
    peerTitle?: string | null
    decisionReason?: string | null
  }>({
    suspect: false,
    role: null,
    peerId: null,
    similarity: null,
    qualityScore: null,
    peerQualityScore: null,
  })
  const [comparingDup, setComparingDup] = useState(false)
  const [deletingPeer, setDeletingPeer] = useState(false)

  const categoryGroups = useMemo(() => getAdminCategoryGroups(), [])
  const showCityFields = categoryId === YEREL_HABER_CATEGORY_ID || categoryId.startsWith('yerel-')

  useEffect(() => {
    onBusyChange?.(loading || saving || publishing || aiPreparing || comparingDup || deletingPeer)
  }, [loading, saving, publishing, aiPreparing, comparingDup, deletingPeer, onBusyChange])

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
        setDupMeta({
          suspect: data.queueDuplicateSuspect === true,
          role: data.queueDuplicateRole ?? null,
          peerId: data.queueDuplicateOf ?? null,
          similarity: data.queueDuplicateSimilarity ?? null,
          qualityScore: data.qualityScore ?? null,
          peerQualityScore: data.peerQualityScore ?? null,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Kuyruk öğesi yüklenemedi')
        onCloseRef.current()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [queueId])

type QueuePayload = {
  title: string
  summary: string
  content: string
  imageUrl: string
  categoryId: string
  city: string
  citySlug: string
  district: string
  source: string
  tags: string[]
  isBreaking: boolean
}

  function buildPayload(overrides?: Partial<QueuePayload>): QueuePayload {
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
      ...overrides,
    }
  }

  async function persistToQueue(
    overrides?: Partial<QueuePayload>,
    options?: { silent?: boolean },
  ): Promise<QueueEditorData | null> {
    const token = (await auth.currentUser?.getIdToken()) ?? ''
    const res = await fetch(`/api/admin/newsroom/queue/${queueId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPayload(overrides)),
    })
    const data = (await res.json()) as QueueEditorData & { error?: string }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    if (!options?.silent) toast.success('Kuyruk kaydı güncellendi')
    onSaved?.({ ...data, id: queueId })
    return { ...data, id: queueId }
  }

  async function handleSave() {
    if (saving || publishing || aiPreparing) return
    setSaving(true)
    try {
      await persistToQueue()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydetme başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function runAiPrepare() {
    if (aiPreparing || saving || publishing) return
    const rawInput = stripHtmlToNewsPlainText(
      [title, summary, content].filter(Boolean).join('\n\n').trim()
    )
    if (rawInput.length < 80) {
      toast.error('AI editör için en az 80 karakter ham haber metni girin')
      return
    }

    setAiPreparing(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error('Giriş gerekli')
      const token = await currentUser.getIdToken()
      const imageUrls = imageUrl.trim() ? [imageUrl.trim()] : []
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: 'publish-ready',
          input: rawInput,
          imageUrls,
          articleFormat: 'standard',
          autoRoute: true,
          ...(categoryId ? { categoryId } : {}),
          ...(citySlug ? { citySlug } : {}),
          isBreaking,
        }),
      })
      const data = (await res.json()) as PublishReadyAiResult
      if (!res.ok) throw new Error(data.error || 'AI editör haberi hazırlayamadı')

      const nextTitle = stripHtmlToNewsPlainText(data.title?.trim() || title)
      const nextSpot = stripHtmlToNewsPlainText(data.spot?.trim() || '')
      const nextSummary = stripHtmlToNewsPlainText(data.summary?.trim() || summary || nextSpot)
      const nextContent = stripHtmlToNewsPlainText(data.content?.trim() || content)
      const nextImage = data.imageOrder?.[0]?.trim() || imageUrl

      let nextCategoryId = categoryId
      let nextCitySlug = citySlug
      let nextDistrict = district
      let nextTags = tagsText
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean)

      setTitle(nextTitle)
      setSummary(nextSummary)
      setContent(nextContent)
      if (nextImage) setImageUrl(nextImage)

      if (data.suggestedCountrySlug?.trim()) {
        if (!data.categoryId?.trim() || data.categoryId === 'gundem') {
          nextCategoryId = 'dunya'
          setCategoryId('dunya')
        } else if (data.categoryId?.trim()) {
          nextCategoryId = data.categoryId.trim()
          setCategoryId(nextCategoryId)
        }
        nextCitySlug = ''
        nextDistrict = ''
        setCitySlug('')
        setDistrict('')
      } else {
        if (data.categoryId?.trim()) {
          nextCategoryId = data.categoryId.trim()
          setCategoryId(nextCategoryId)
        }
        if (data.suggestedCitySlug?.trim()) {
          nextCitySlug = data.suggestedCitySlug.trim()
          setCitySlug(nextCitySlug)
        }
        if (data.suggestedDistrictSlug?.trim()) {
          const provinceSlug = data.suggestedCitySlug?.trim() || citySlug
          const districts = getDistrictsForProvince(provinceSlug)
          const found = districts.find((d) => d.slug === data.suggestedDistrictSlug?.trim())
          nextDistrict = found?.name || data.suggestedDistrictSlug.trim()
          setDistrict(nextDistrict)
        }
      }

      if (Array.isArray(data.tags) && data.tags.length > 0) {
        nextTags = data.tags
        setTagsText(data.tags.join(', '))
      }

      const cityName = TURKISH_PROVINCES.find((p) => p.slug === nextCitySlug)?.name ?? ''
      try {
        await persistToQueue(
          {
            title: nextTitle,
            summary: nextSummary,
            content: nextContent,
            imageUrl: nextImage,
            categoryId: nextCategoryId,
            city: cityName,
            citySlug: nextCitySlug,
            district: nextDistrict,
            tags: nextTags,
          },
          { silent: true },
        )
      } catch (saveErr) {
        console.warn('[QueueItemEditor] AI sonrası otomatik kayıt başarısız:', saveErr)
      }

      const editorLabel = data.editorName?.trim()
      toast.success(
        editorLabel
          ? data.gateDecision === 'publish'
            ? `${editorLabel} ile yayıma hazırlandı — kaydedildi`
            : `${editorLabel} ile hazırlandı; incelemeye alındı — kaydedildi`
          : data.gateDecision === 'publish'
            ? 'Haber yayıma hazırlandı — kaydedildi'
            : data.qualityScore != null
              ? `Haber hazırlandı (kalite: %${data.qualityScore}) — kaydedildi`
              : 'Haber AI ile hazırlandı — kaydedildi, inceleyin'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI editör isteği başarısız')
    } finally {
      setAiPreparing(false)
    }
  }

  async function handlePublish() {
    if (saving || publishing || aiPreparing || comparingDup || deletingPeer) return
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

  async function runAiDuplicateCompare() {
    if (comparingDup || saving || publishing || aiPreparing) return
    setComparingDup(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/queue', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compare-duplicates', id: queueId, useAi: true }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        isDuplicate?: boolean
        message?: string
        peerQueueId?: string
        peerTitle?: string
        similarity?: number
        qualityScore?: number
        peerQualityScore?: number
        keepSelf?: boolean
        decisionReason?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.isDuplicate) {
        toast.success(data.message || 'Kuyrukta benzer haber yok')
        setDupMeta((prev) => ({ ...prev, suspect: false }))
        return
      }
      setDupMeta({
        suspect: true,
        role: data.keepSelf ? 'keeper' : 'weaker',
        peerId: data.peerQueueId ?? null,
        similarity: data.similarity ?? null,
        qualityScore: data.qualityScore ?? null,
        peerQualityScore: data.peerQualityScore ?? null,
        peerTitle: data.peerTitle ?? null,
        decisionReason: data.decisionReason ?? null,
      })
      toast.success(
        data.keepSelf
          ? `Bu kayıt daha kaliteli (Q${Math.round(data.qualityScore ?? 0)} > Q${Math.round(data.peerQualityScore ?? 0)})`
          : `Bu kayıt daha zayıf — tekrar silinebilir (Q${Math.round(data.qualityScore ?? 0)} < Q${Math.round(data.peerQualityScore ?? 0)})`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI karşılaştırma başarısız')
    } finally {
      setComparingDup(false)
    }
  }

  async function deleteWeakerDuplicate() {
    if (deletingPeer || !dupMeta.peerId) return
    const targetId = dupMeta.role === 'weaker' ? queueId : dupMeta.peerId
    const label = dupMeta.role === 'weaker' ? 'bu zayıf kayıt' : 'eşleşen zayıf tekrar'
    const ok = window.confirm(`Düşük kaliteli tekrar silinecek (${label}). Devam?`)
    if (!ok) return
    setDeletingPeer(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/queue?id=${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success('Zayıf tekrar kuyruktan silindi')
      if (targetId === queueId) {
        onClose()
        return
      }
      setDupMeta((prev) => ({
        ...prev,
        suspect: false,
        peerId: null,
        role: 'keeper',
      }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme başarısız')
    } finally {
      setDeletingPeer(false)
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
            <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
              {(dupMeta.suspect || comparingDup) && (
                <div
                  className={cn(
                    'mb-3 rounded-xl border px-3 py-2.5 text-xs',
                    dupMeta.role === 'weaker'
                      ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
                      : 'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100'
                  )}
                >
                  <p className="font-bold">
                    {dupMeta.role === 'weaker'
                      ? 'Kuyruk tekrarı — bu kayıt daha zayıf görünüyor'
                      : dupMeta.role === 'keeper'
                        ? 'Kuyruk tekrarı — bu kayıt tutuluyor'
                        : 'Olası kuyruk tekrarı — AI incelemesi'}
                  </p>
                  <p className="mt-1 opacity-90">
                    {dupMeta.peerTitle ? `Eşleşen: ${dupMeta.peerTitle}` : null}
                    {typeof dupMeta.similarity === 'number'
                      ? ` · benzerlik ${(dupMeta.similarity * 100).toFixed(0)}%`
                      : ''}
                    {typeof dupMeta.qualityScore === 'number'
                      ? ` · kalite ${Math.round(dupMeta.qualityScore)}`
                      : ''}
                    {typeof dupMeta.peerQualityScore === 'number'
                      ? ` vs ${Math.round(dupMeta.peerQualityScore)}`
                      : ''}
                  </p>
                  {dupMeta.decisionReason && (
                    <p className="mt-1 text-[11px] opacity-80">{dupMeta.decisionReason}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={comparingDup || deletingPeer}
                      onClick={() => void runAiDuplicateCompare()}
                      className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {comparingDup ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      AI ile kalite karşılaştır
                    </button>
                    {dupMeta.peerId && (
                      <button
                        type="button"
                        disabled={deletingPeer || comparingDup}
                        onClick={() => void deleteWeakerDuplicate()}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {deletingPeer ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Zayıf tekrarı sil
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!dupMeta.suspect && (
                <button
                  type="button"
                  disabled={comparingDup || aiPreparing || saving || publishing}
                  onClick={() => void runAiDuplicateCompare()}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100"
                >
                  {comparingDup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Kuyruk tekrarı / AI kalite kontrolü
                </button>
              )}
              <button
                type="button"
                onClick={() => void runAiPrepare()}
                disabled={aiPreparing || saving || publishing || comparingDup}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 px-4 py-3 text-sm font-black text-white shadow-md transition hover:from-amber-400 hover:to-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiPreparing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                ✨ Uzman AI Editörle Haberi Hazırla
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
                Otomatik masa yönlendirme ile başlık, özet, içerik
                {isYerelCategoryTree(categoryId) ? ', yerel kategori' : ', kategori'}
                ve etiketleri doldurur. Kaydet veya yayına almadan önce inceleyin.
              </p>
            </div>

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

            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void runAiPrepare()}
                disabled={aiPreparing || saving || publishing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 sm:order-first"
              >
                {aiPreparing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Uzman AI ile hazırla
              </button>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={aiPreparing}
                  className="rounded-xl border border-[rgb(var(--color-border))] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  disabled={saving || publishing || aiPreparing}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-900/20"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Kaydet
                </button>
                <button
                  type="button"
                  disabled={saving || publishing || aiPreparing}
                  onClick={() => void handlePublish()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Yayına al
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
