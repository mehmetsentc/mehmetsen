'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Search, RefreshCw, CheckCircle2, XCircle, Trash2,
  ExternalLink, Wand2, Loader2,
  Newspaper, BarChart3, Clock, Tag, Globe, Pencil, X, Save,
  ChevronLeft, ChevronRight, Zap, Hash, SearchIcon,
} from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { adminNewsService, type AdminNewsFilter, type AdminNewsItem } from '@/services/adminNewsService'
import type { AdditionalImageItem } from '@/components/admin/EditMediaSection'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { EditMediaSection } from '@/components/admin/EditMediaSection'

// ── Types ──────────────────────────────────────────────────────────────────
type AiMode = 'rewrite' | 'seo' | 'tags' | 'headline'

interface AiResult {
  title?: string
  seoTitle?: string
  seoDescription?: string
  tags?: string[]
  headlines?: string[]
  content?: string
  summary?: string
  spot?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-')
}

/** "NATO, CHP, Sezgin" → ['nato', 'chp', 'sezgin'] */
function parseTagInput(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map(normalizeTag)
    .filter(Boolean)
}

function mergeTags(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing.map(normalizeTag).filter(Boolean))
  for (const tag of incoming) set.add(tag)
  return [...set]
}

const FILTERS: { id: AdminNewsFilter; label: string; color: string }[] = [
  { id: 'all', label: 'Tümü', color: '' },
  { id: 'published', label: 'Yayında', color: 'text-emerald-600' },
  { id: 'pending', label: 'Onay Bekliyor', color: 'text-amber-600' },
  { id: 'draft', label: 'Taslak', color: 'text-blue-600' },
  { id: 'removed', label: 'Kaldırıldı', color: 'text-red-600' },
]

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: { label: 'Yayında', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  pending: { label: 'Bekliyor', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  draft: { label: 'Taslak', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  archived: { label: 'Arşiv', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  removed: { label: 'Kaldırıldı', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
}

// ── AI Toolbar Drawer ──────────────────────────────────────────────────────
function AiToolbar({
  post,
  onClose,
}: {
  post: AdminNewsItem
  onClose: () => void
}) {
  const [mode, setMode] = useState<AiMode>('rewrite')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AiResult | null>(null)

  const MODES: { id: AiMode; label: string }[] = [
    { id: 'rewrite', label: 'Yeniden Yaz' },
    { id: 'headline', label: 'Başlık Üret' },
    { id: 'seo', label: 'SEO Üret' },
    { id: 'tags', label: 'Etiket Üret' },
  ]

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode, input: post.title + '\n\n' + (post.summary ?? '') }),
      })
      if (!res.ok) throw new Error()
      setResult(await res.json() as AiResult)
    } catch {
      toast.error('AI servisi kullanılamıyor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-[rgb(var(--color-border))] bg-blue-50 p-4 dark:bg-blue-950/30">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1">
          {MODES.map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setResult(null) }}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                mode === m.id ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300')}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={run} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            Oluştur
          </button>
          <button onClick={onClose} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-300">
            Kapat
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          {result.title && (
            <div className="rounded-lg bg-white p-3 dark:bg-blue-900/20">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-500">Yeni Başlık</p>
              <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{result.title}</p>
            </div>
          )}
          {result.headlines && (
            <div className="rounded-lg bg-white p-3 dark:bg-blue-900/20 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Başlık Alternatifleri</p>
              {result.headlines.map((h, i) => (
                <p key={i} className="text-sm text-[rgb(var(--color-text))]">{i + 1}. {h}</p>
              ))}
            </div>
          )}
          {(result.seoTitle || result.seoDescription) && (
            <div className="rounded-lg bg-white p-3 dark:bg-blue-900/20 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">SEO</p>
              {result.seoTitle && <p className="text-xs font-bold text-blue-700">{result.seoTitle}</p>}
              {result.seoDescription && <p className="text-xs text-[rgb(var(--color-muted))]">{result.seoDescription}</p>}
            </div>
          )}
          {result.tags && (
            <div className="flex flex-wrap gap-1">
              {result.tags.map(t => (
                <span key={t} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">#{t}</span>
              ))}
            </div>
          )}
          {result.spot && (
            <div className="rounded-lg bg-white p-3 dark:bg-blue-900/20">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-500">Spot / Lider Paragraf</p>
              <p className="text-sm text-[rgb(var(--color-text))]">{result.spot}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SEO Preview Panel ──────────────────────────────────────────────────────
function SeoPreview({ post }: { post: AdminNewsItem }) {
  const title = post.seoTitle || post.title
  const desc = post.seoDescription || post.summary || ''
  const url = `nahaber.com${ROUTES.NEWS_DETAIL(post.slug || post.id)}`

  return (
    <div className="border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Google Önizlemesi</p>
      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-white p-4 dark:bg-[#1a1a2e]">
        <p className="text-xs text-green-700 dark:text-green-400">{url}</p>
        <p className="mt-0.5 line-clamp-1 text-lg font-medium text-blue-700 dark:text-blue-400">{title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--color-muted))]">{desc || 'Meta açıklama eksik.'}</p>
      </div>
      <div className="mt-2 flex gap-3 text-[10px]">
        <span className={cn('font-semibold', title.length >= 50 && title.length <= 65 ? 'text-emerald-600' : 'text-amber-600')}>
          Başlık: {title.length}/65 karakter
        </span>
        <span className={cn('font-semibold', desc.length >= 145 && desc.length <= 160 ? 'text-emerald-600' : 'text-amber-600')}>
          Açıklama: {desc.length}/160 karakter
        </span>
      </div>
    </div>
  )
}

// ── Edit Drawer ────────────────────────────────────────────────────────────
function EditDrawer({
  post,
  userId,
  username,
  onClose,
  onSaved,
}: {
  post: AdminNewsItem
  userId: string
  username: string
  onClose: () => void
  onSaved: (updated: Partial<AdminNewsItem>) => void
}) {
  const [title, setTitle] = useState(post.title ?? '')
  const [slug, setSlug] = useState((post as AdminNewsItem & { slug?: string }).slug ?? '')
  const [summary, setSummary] = useState(post.summary ?? '')
  const [content, setContent] = useState(post.content ?? '')
  const [spot, setSpot] = useState(post.spot ?? '')
  const [categoryId, setCategoryId] = useState(post.categoryId ?? '')
  const [status, setStatus] = useState<string>(post.status ?? 'draft')
  const [citySlug, setCitySlug] = useState((post as AdminNewsItem & { citySlug?: string }).citySlug ?? '')
  const [thumbnail, setThumbnail] = useState(post.coverImageUrl ?? '')
  const [videoUrl, setVideoUrl] = useState(post.mediaItems?.find((m) => m.type === 'video')?.url ?? '')
  const [additionalImages, setAdditionalImages] = useState<AdditionalImageItem[]>(
    (post as AdminNewsItem & { additionalImages?: AdditionalImageItem[] }).additionalImages ?? []
  )
  const [tags, setTags] = useState<string[]>(post.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const storedSeoTitle = post.seoTitle?.trim() ?? ''
  const storedSeoDescription = post.seoDescription?.trim() ?? ''
  const [seoTitle, setSeoTitle] = useState(
    storedSeoTitle || post.title?.trim() || ''
  )
  const [seoDescription, setSeoDescription] = useState(
    storedSeoDescription || post.summary?.trim() || post.spot?.trim() || ''
  )
  const [seoKeywords, setSeoKeywords] = useState<string[]>(
    (post as AdminNewsItem & { seoKeywords?: string[] }).seoKeywords ?? []
  )
  const [seoKeywordInput, setSeoKeywordInput] = useState('')
  const [aiKwLoading, setAiKwLoading] = useState(false)
  const seoTitleUsesFallback = !storedSeoTitle
  const seoDescriptionUsesFallback = !storedSeoDescription
  const [isBreaking, setIsBreaking] = useState<boolean>(post.isBreaking ?? false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const addTagsFromInput = () => {
    const parsed = parseTagInput(tagInput)
    if (parsed.length === 0) return
    setTags((prev) => mergeTags(prev, parsed))
    setTagInput('')
  }

  const generateAiKeywords = async () => {
    setAiKwLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const input = [post.title, post.content ?? post.summary ?? ''].filter(Boolean).join('\n\n').slice(0, 2000)
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'keywords', input }),
      })
      const data = await res.json() as { keywords?: string[] }
      if (Array.isArray(data.keywords) && data.keywords.length > 0) {
        setSeoKeywords(prev => [...new Set([...prev, ...data.keywords!.map((k: string) => k.trim().toLowerCase()).filter(Boolean)])])
        toast.success(`${data.keywords.length} anahtar kelime eklendi`)
      } else {
        toast.error('AI anahtar kelime üretemedi')
      }
    } catch {
      toast.error('AI isteği başarısız')
    } finally {
      setAiKwLoading(false)
    }
  }

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Başlık boş olamaz'); return }
    if (mediaUploading) { toast.error('Medya yüklemesi devam ediyor'); return }
    setSaving(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser) {
        toast.error('Oturumunuz sona ermiş, lütfen sayfayı yenileyip tekrar giriş yapın')
        setSaving(false)
        return
      }
      const token = await currentUser.getIdToken(true) // force refresh
      const res = await fetch(`/api/admin/news/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title, slug: slug.trim() || undefined, summary, content, spot, categoryId, status,
          thumbnail,
          videoUrl,
          additionalImages,
          tags,
          seoTitle,
          seoDescription,
          seoKeywords,
          isBreaking,
          ...(categoryId === 'yerel-haber' && citySlug
            ? {
                citySlug,
                city: TURKISH_PROVINCES.find(p => p.slug === citySlug)?.name ?? citySlug,
              }
            : {}),
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `Kayıt başarısız (${res.status})`)
      }
      toast.success('Haber güncellendi')
      onSaved({
        title,
        summary,
        content,
        spot,
        categoryId,
        status: status as AdminNewsItem['status'],
        coverImageUrl: thumbnail || post.coverImageUrl,
        tags,
        seoTitle,
        seoDescription,
        seoKeywords,
        isBreaking,
      })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[rgb(var(--color-card))] shadow-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-bold text-[rgb(var(--color-text))]">Haberi Düzenle</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[rgb(var(--color-surface))]">
            <X className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto space-y-4 p-5">
          {/* Başlık */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Başlık</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Haber başlığı..."
            />
          </div>

          {/* Slug */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                Slug (URL)
              </label>
              <span className="text-[10px] text-amber-600 dark:text-amber-400">⚠ Değiştirmek mevcut URL'yi bozabilir</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-[rgb(var(--color-muted))]">nahaber.com/haber/</span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm font-mono text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="haber-slug..."
              />
            </div>
          </div>

          {/* Spot / girizgah */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Spot (girizgah)</label>
            <textarea
              value={spot} onChange={e => setSpot(e.target.value)} rows={2}
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="2-4 cümlelik haber girişi..."
            />
          </div>

          {/* Özet */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Özet</label>
            <textarea
              value={summary} onChange={e => setSummary(e.target.value)} rows={2}
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Kısa özet..."
            />
          </div>

          {/* İçerik */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">İçerik</label>
            <textarea
              value={content} onChange={e => setContent(e.target.value)} rows={10}
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
              placeholder="Haber metni..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Görsel / Video</label>
            <EditMediaSection
              postId={post.id}
              userId={userId}
              thumbnail={thumbnail}
              videoUrl={videoUrl}
              additionalImages={additionalImages}
              onThumbnailChange={setThumbnail}
              onVideoUrlChange={setVideoUrl}
              onAdditionalImagesChange={setAdditionalImages}
              onUploadingChange={setMediaUploading}
            />
          </div>

          {/* Kategori + Durum */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Kategori</label>
              <select
                value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— seçin —</option>
                {DEFAULT_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">Durum</label>
              <select
                value={status} onChange={e => setStatus(e.target.value)}
                className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Taslak</option>
                <option value="pending">Onay Bekliyor</option>
                <option value="published">Yayında</option>
                <option value="archived">Arşiv</option>
              </select>
            </div>
          </div>

          {/* Şehir seçici — yalnızca Yerel Haber kategorisinde görünür */}
          {categoryId === 'yerel-haber' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
                Şehir
                <span className="ml-1 text-emerald-500">*</span>
              </label>
              <select
                value={citySlug} onChange={e => setCitySlug(e.target.value)}
                className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— şehir seçin —</option>
                {TURKISH_PROVINCES.map(p => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
              {!citySlug && (
                <p className="mt-1 text-[11px] text-amber-500">Yerel haber için şehir seçimi zorunludur.</p>
              )}
            </div>
          )}

          {/* Son Dakika toggle */}
          <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap className={`h-4 w-4 ${isBreaking ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`} />
              <div>
                <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Son Dakika</p>
                <p className="text-[11px] text-[rgb(var(--color-muted))]">Ana sayfada ve son dakika şeridinde öne çıkar</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsBreaking(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isBreaking ? 'bg-red-500' : 'bg-[rgb(var(--color-border))]'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isBreaking ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Etiketler (Tags) */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-muted))]">
              <Hash className="h-3.5 w-3.5" />
              Etiketler
            </label>
            {/* Tag chips */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, j) => j !== i))}
                    className="ml-0.5 rounded-full hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-[rgb(var(--color-muted))]">Henüz etiket yok</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                    e.preventDefault()
                    addTagsFromInput()
                  }
                }}
                placeholder="Etiket yaz veya virgülle ayırarak toplu ekle (NATO, CHP, ...)"
                className="flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addTagsFromInput}
                disabled={!tagInput.trim()}
                className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Ekle
              </button>
            </div>
          </div>

          {/* SEO Bölümü */}
          <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[rgb(var(--color-text))]">
              <SearchIcon className="h-3.5 w-3.5 text-emerald-500" />
              SEO Ayarları
            </p>

            {/* SEO Başlık */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">SEO Başlık</label>
                <span className={`text-[10px] font-mono ${seoTitle.length > 65 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`}>
                  {seoTitle.length}/65
                </span>
              </div>
              <input
                type="text"
                value={seoTitle}
                onChange={e => setSeoTitle(e.target.value)}
                maxLength={80}
                placeholder="Arama motorları için optimize başlık (55-65 karakter)..."
                className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {!seoTitle && (
                <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">Boş bırakılırsa haber başlığı kullanılır</p>
              )}
              {seoTitleUsesFallback && seoTitle && (
                <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                  Kayıtlı SEO başlığı yok — haber başlığı otomatik dolduruldu
                </p>
              )}
            </div>

            {/* SEO Açıklama */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">SEO Açıklama (Meta Description)</label>
                <span className={`text-[10px] font-mono ${seoDescription.length > 165 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`}>
                  {seoDescription.length}/165
                </span>
              </div>
              <textarea
                value={seoDescription}
                onChange={e => setSeoDescription(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="Google SERP snippet açıklaması (145-165 karakter)..."
                className="w-full resize-none rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {!seoDescription && (
                <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">Boş bırakılırsa özet kullanılır</p>
              )}
              {seoDescriptionUsesFallback && seoDescription && (
                <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                  Kayıtlı SEO açıklaması yok — özet/spot otomatik dolduruldu
                </p>
              )}
            </div>

            {/* SEO Anahtar Kelimeler */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                  🔑 SEO Anahtar Kelimeler
                </label>
                <button
                  type="button"
                  onClick={generateAiKeywords}
                  disabled={aiKwLoading}
                  className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {aiKwLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  {aiKwLoading ? 'Üretiliyor...' : '✨ AI Üret'}
                </button>
              </div>
              {/* Mevcut kelimeler */}
              {seoKeywords.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {seoKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => setSeoKeywords((prev) => prev.filter((k) => k !== kw))}
                        className="ml-0.5 text-emerald-600 hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Giriş */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={seoKeywordInput}
                  onChange={e => setSeoKeywordInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      const kws = seoKeywordInput.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
                      if (kws.length) {
                        setSeoKeywords(prev => [...new Set([...prev, ...kws])])
                        setSeoKeywordInput('')
                      }
                    }
                  }}
                  placeholder="kelime1, kelime2... (virgülle ayır)"
                  className="flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const kws = seoKeywordInput.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
                    if (kws.length) {
                      setSeoKeywords(prev => [...new Set([...prev, ...kws])])
                      setSeoKeywordInput('')
                    }
                  }}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Ekle
                </button>
              </div>
              <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
                Google meta keywords — virgülle ayırarak veya Enter ile ekle ({seoKeywords.length} kelime)
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[rgb(var(--color-border))] px-5 py-3">
          <button onClick={onClose} className="rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]">
            İptal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

// ── News Row ───────────────────────────────────────────────────────────────
function NewsRow({
  post,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onRemove,
  onEdit,
  actionLoading,
}: {
  post: AdminNewsItem
  selected: boolean
  onToggleSelect: () => void
  onApprove: (p: AdminNewsItem) => void
  onReject: (p: AdminNewsItem) => void
  onRemove: (id: string) => void
  onEdit: (p: AdminNewsItem) => void
  actionLoading: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showSeo, setShowSeo] = useState(false)
  const busy = actionLoading === post.id
  const badge = STATUS_BADGE[post.status ?? 'draft'] ?? STATUS_BADGE.draft

  const publishedAtStr = post.publishedAt ?? post.createdAt
  const publishedAt = publishedAtStr
    ? formatDistanceToNow(new Date(publishedAtStr), { locale: tr, addSuffix: true })
    : '—'

  return (
    <div className={cn('border-b border-[rgb(var(--color-border))] transition-colors', selected && 'bg-blue-50/50 dark:bg-blue-950/10')}>
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-[rgb(var(--color-surface))]">
        <input type="checkbox" checked={selected} onChange={onToggleSelect}
          className="mt-1 h-3.5 w-3.5 shrink-0 accent-blue-600" />

        {post.coverImageUrl && (
          <img src={post.coverImageUrl} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))] flex-1">{post.title}</p>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', badge.cls)}>{badge.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[rgb(var(--color-muted))]">
            {post.categoryId && <span className="flex items-center gap-1"><Tag className="h-2.5 w-2.5" />{post.categoryId}</span>}
            {post.readingTimeMinutes && <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{post.readingTimeMinutes} dk okuma</span>}
            {(post as AdminNewsItem & { citySlug?: string }).citySlug && <span className="flex items-center gap-1"><Globe className="h-2.5 w-2.5" />{(post as AdminNewsItem & { citySlug?: string }).citySlug}</span>}
            <span>{publishedAt}</span>
          </div>
          {post.spot && (
            <p className="mt-1 line-clamp-1 text-[11px] italic text-[rgb(var(--color-muted))]">{post.spot}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-1 items-end">
          <div className="flex gap-1">
            {post.status === 'pending' && (
              <>
                <button onClick={() => onApprove(post)} disabled={busy}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Onayla
                </button>
                <button onClick={() => onReject(post)} disabled={busy}
                  className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  <XCircle className="h-3 w-3" />Reddet
                </button>
              </>
            )}
            {post.status === 'published' && (
              <a href={ROUTES.NEWS_DETAIL(post.slug || post.id)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-[11px] font-bold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]">
                <ExternalLink className="h-3 w-3" />Görüntüle
              </a>
            )}
            <button onClick={() => { setShowAi(v => !v); setShowSeo(false); setExpanded(false) }}
              className={cn('flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all',
                showAi ? 'border-blue-500 bg-blue-600 text-white' : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]')}>
              <Wand2 className="h-3 w-3" />AI
            </button>
            <button onClick={() => { setShowSeo(v => !v); setShowAi(false); setExpanded(false) }}
              className={cn('flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold',
                showSeo ? 'border-blue-500 bg-blue-600 text-white' : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]')}>
              <BarChart3 className="h-3 w-3" />SEO
            </button>
            <button onClick={() => onEdit(post)}
              className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-[11px] font-bold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
              title="Düzenle">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={() => onRemove(post.id)} disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/20">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* AI Toolbar */}
      {showAi && <AiToolbar post={post} onClose={() => setShowAi(false)} />}
      {/* SEO Preview */}
      {showSeo && <SeoPreview post={post} />}
    </div>
  )
}

// ── Pagination Bar ─────────────────────────────────────────────────────────
function PaginationBar({
  currentPage,
  knownPages,
  hasNext,
  loading,
  onPage,
}: {
  currentPage: number
  knownPages: number
  hasNext: boolean
  loading: boolean
  onPage: (p: number) => void
}) {
  const totalKnown = knownPages
  // Build visible page numbers around currentPage
  const pages: (number | '…')[] = []
  if (totalKnown <= 7) {
    for (let i = 0; i < totalKnown; i++) pages.push(i)
  } else {
    pages.push(0)
    if (currentPage > 2) pages.push('…')
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalKnown - 2, currentPage + 1); i++) {
      pages.push(i)
    }
    if (currentPage < totalKnown - 3) pages.push('…')
    pages.push(totalKnown - 1)
  }
  if (hasNext) pages.push('…')

  return (
    <div className="flex items-center justify-center gap-1 py-2">
      <button
        onClick={() => onPage(currentPage - 1)}
        disabled={currentPage === 0 || loading}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-sm text-[rgb(var(--color-muted))]">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            disabled={loading}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition-all',
              p === currentPage
                ? 'bg-blue-600 text-white shadow'
                : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
            )}
          >
            {(p as number) + 1}
          </button>
        )
      )}

      <button
        onClick={() => onPage(currentPage + 1)}
        disabled={!hasNext || loading}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminNewsPage() {
  const { can, user, loading: authLoading } = useCmsAuth()
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') ?? ''
  const filterParam = searchParams.get('filter') ?? ''
  const initialFilter: AdminNewsFilter =
    filterParam === 'published' ||
    filterParam === 'pending' ||
    filterParam === 'draft' ||
    filterParam === 'removed'
      ? filterParam
      : 'all'
  const [filter, setFilter] = useState<AdminNewsFilter>(initialFilter)

  useEffect(() => {
    const fp = searchParams.get('filter') ?? ''
    if (fp === 'published' || fp === 'pending' || fp === 'draft' || fp === 'removed') {
      setFilter(fp)
    } else if (!fp) {
      setFilter('all')
    }
  }, [searchParams])
  const [search, setSearch] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [posts, setPosts] = useState<AdminNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false)
  const [editingPost, setEditingPost] = useState<AdminNewsItem | null>(null)

  // Pagination — cursor per page stored in a ref (no re-render on update)
  const pageCursorsRef = useRef<(QueryDocumentSnapshot | null)[]>([null])
  const [currentPage, setCurrentPage] = useState(0)
  const [knownPages, setKnownPages] = useState(1)
  const [hasNext, setHasNext] = useState(false)

  // Keep a ref so `load` always reads the latest categoryParam without being recreated
  const categoryParamRef = useRef(categoryParam)
  categoryParamRef.current = categoryParam

  const load = useCallback(async (page: number, searchOverride?: string) => {
    setLoading(true)
    const searchTerm = searchOverride !== undefined ? searchOverride : search
    try {
      const cursor = pageCursorsRef.current[page] ?? undefined
      // Arama aktifken kategori filtresi kaldırılır — tüm haberlerde arar
      const catFilter = searchTerm.trim() ? undefined : categoryParamRef.current || undefined
      const [result, tagResults] = await Promise.all([
        adminNewsService.list(filter, cursor, catFilter, searchTerm.trim() ? 500 : undefined),
        searchTerm.trim() ? adminNewsService.searchByTag(searchTerm) : Promise.resolve([]),
      ])
      // Tag sorgusu sonuçlarını merge et — 500 limitinin dışındaki eski haberler de görünsün
      const seen = new Set(result.posts.map(p => p.id))
      const merged = [...result.posts]
      for (const p of tagResults) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p) }
      }
      setPosts(merged)
      setCurrentPage(page)
      setHasNext(result.hasMore)
      if (result.hasMore && result.lastDoc && !pageCursorsRef.current[page + 1]) {
        pageCursorsRef.current[page + 1] = result.lastDoc
        setKnownPages(prev => Math.max(prev, page + 2))
      }
      setSelected(new Set())
    } catch (err) {
      console.error('[admin/news] load error:', err)
      toast.error('Haberler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    if (authLoading) return
    // Reset pagination on filter or category change.
    pageCursorsRef.current = [null]
    setCurrentPage(0)
    setKnownPages(1)
    setHasNext(false)
    const tid = setTimeout(() => { void load(0) }, 0)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, categoryParam, authLoading])

  const handleApprove = async (post: AdminNewsItem) => {
    setActionLoading(post.id)
    try {
      await adminNewsService.approve(post.id, post.adminSource)
      toast.success('Haber onaylandı')
      setPosts(prev => prev.filter(p => p.id !== post.id))
    } catch { toast.error('Onaylama başarısız') }
    finally { setActionLoading(null) }
  }

  const handleReject = async (post: AdminNewsItem) => {
    setActionLoading(post.id)
    try {
      await adminNewsService.reject(post.id, post.adminSource)
      toast.success('Haber reddedildi')
      setPosts(prev => prev.filter(p => p.id !== post.id))
    } catch { toast.error('Reddetme başarısız') }
    finally { setActionLoading(null) }
  }

  const handleRemove = async (id: string) => {
    setActionLoading(id)
    try {
      const post = posts.find(p => p.id === id)
      // Taslak veya zaten arşivlenmiş → kalıcı sil. Diğerleri arşivlenir.
      if (post?.status === 'draft' || post?.status === 'archived') {
        await adminNewsService.permanentDelete(id)
        toast.success('Kalıcı olarak silindi')
      } else {
        await adminNewsService.remove(id)
        toast.success('Haber kaldırıldı')
      }
      setPosts(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('Kaldırma başarısız') }
    finally { setActionLoading(null) }
  }

  const handlePurgeAllArchived = async () => {
    const archived = posts.filter(p => p.status === 'archived' || p.status === 'banned')
    if (!archived.length) { toast('Silinecek arşiv yok'); return }
    if (!confirmBulkRemove) {
      setSelected(new Set(archived.map(p => p.id)))
      setConfirmBulkRemove(true)
      return
    }
    setConfirmBulkRemove(false)
    setBulkLoading(true)
    await Promise.allSettled(archived.map(p => adminNewsService.permanentDelete(p.id)))
    toast.success(`${archived.length} arşiv kalıcı olarak silindi`)
    setPosts(prev => prev.filter(p => p.status !== 'archived' && p.status !== 'banned'))
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleBulkApprove = async () => {
    const pending = posts.filter(p => selected.has(p.id) && p.status === 'pending')
    if (!pending.length) { toast('Seçili bekleyen haber yok'); return }
    setBulkLoading(true)
    let done = 0
    for (const p of pending) {
      try { await adminNewsService.approve(p.id, p.adminSource); done++ } catch { /* skip */ }
    }
    toast.success(`${done} haber onaylandı`)
    setPosts(prev => prev.filter(p => !selected.has(p.id) || p.status !== 'pending'))
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleBulkRemove = async () => {
    if (!selected.size) return
    if (!confirmBulkRemove) { setConfirmBulkRemove(true); return }
    setConfirmBulkRemove(false)
    setBulkLoading(true)
    const ids = [...selected]
    const selectedPosts = posts.filter(p => selected.has(p.id))
    // Taslak ve arşivler kalıcı silinir; yayındaki/bekleyenler arşivlenir
    await Promise.allSettled(selectedPosts.map(p =>
      (p.status === 'draft' || p.status === 'archived')
        ? adminNewsService.permanentDelete(p.id)
        : adminNewsService.remove(p.id)
    ))
    toast.success(`${ids.length} haber silindi`)
    setPosts(prev => prev.filter(p => !selected.has(p.id)))
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleBulkRemoveAllDrafts = async () => {
    const drafts = posts.filter(p => p.status === 'draft')
    if (!drafts.length) { toast('Silinecek taslak yok'); return }
    if (!confirmBulkRemove) {
      setSelected(new Set(drafts.map(p => p.id)))
      setConfirmBulkRemove(true)
      return
    }
    setConfirmBulkRemove(false)
    setBulkLoading(true)
    // Taslaklar kalıcı olarak silinir (arşivlenmez)
    await Promise.allSettled(drafts.map(p => adminNewsService.permanentDelete(p.id)))
    toast.success(`${drafts.length} taslak kalıcı olarak silindi`)
    setPosts(prev => prev.filter(p => p.status !== 'draft'))
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleEdit = (post: AdminNewsItem) => setEditingPost(post)

  const handleSaved = (id: string, updated: Partial<AdminNewsItem>) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === posts.length) setSelected(new Set())
    else setSelected(new Set(posts.map(p => p.id)))
  }

  const filtered = posts.filter(p => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    const haystack = [
      p.title,
      p.content,
      p.summary,
      p.city ?? '',
      p.citySlug ?? '',
      p.categoryId ?? '',
      ...(p.tags ?? []),
    ].join(' ').toLowerCase()
    return haystack.includes(term)
  })

  const pendingCount = posts.filter(p => p.status === 'pending').length

  return (
    <div className="flex flex-col">
      <CMSHeader
        title={categoryParam ? `Haberler — ${categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1).replace('-', ' ')}` : 'Haberler'}
        subtitle={categoryParam ? `${categoryParam} kategorisi filtresi aktif` : 'İçerik editörü ve onay merkezi'}
      />
      <div className="p-6 space-y-4">
        {/* Category quick-filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <Link
            href={ROUTES.ADMIN.NEWS}
            className={cn(
              'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
              !categoryParam
                ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-surface))] shadow-sm'
                : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            Tüm Kategoriler
          </Link>
          {[
            { id: 'son-dakika', label: '🔴 Son Dakika' },
            { id: 'gundem',     label: 'Gündem' },
            { id: 'siyaset',    label: 'Siyaset' },
            { id: 'dunya',      label: 'Dünya' },
            { id: 'spor',       label: 'Spor' },
            { id: 'ekonomi',    label: 'Ekonomi' },
            { id: 'teknoloji',  label: 'Teknoloji' },
            { id: 'saglik',     label: 'Sağlık' },
            { id: 'yerel-haber', label: 'Yerel' },
          ].map(cat => (
            <Link
              key={cat.id}
              href={`${ROUTES.ADMIN.NEWS}?category=${cat.id}`}
              className={cn(
                'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                categoryParam === cat.id
                  ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                  : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {cat.label}
            </Link>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all',
                  filter === f.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}>
                {f.label}
                {f.id === 'pending' && pendingCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative ml-auto max-w-64 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input type="text" value={search} onChange={e => {
              const val = e.target.value
              setSearch(val)
              // Debounce — arama değişince kategori filtresi olmadan yeniden yükle
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
              searchDebounceRef.current = setTimeout(() => {
                pageCursorsRef.current = [null]
                setCurrentPage(0)
                setKnownPages(1)
                setHasNext(false)
                void load(0, val)
              }, 350)
            }}
              placeholder="Başlıkta ara..."
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2 pl-8 pr-3 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={() => load(currentPage)}
            className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {/* Bulk actions */}
        {(selected.size > 0 || filter === 'draft') && (
          <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 ${confirmBulkRemove ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30' : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'}`}>
            {selected.size > 0 && <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{selected.size} seçili</span>}
            {selected.size > 0 && (
              <button onClick={handleBulkApprove} disabled={bulkLoading}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Toplu Onayla
              </button>
            )}
            {selected.size > 0 && !confirmBulkRemove && (
              <button onClick={handleBulkRemove} disabled={bulkLoading}
                className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="h-3 w-3" />Toplu Kaldır
              </button>
            )}
            {confirmBulkRemove && (
              <>
                <span className="text-sm font-bold text-red-700 dark:text-red-300">{selected.size} haber silinecek. Emin misiniz?</span>
                <button onClick={handleBulkRemove} disabled={bulkLoading}
                  className="flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50">
                  {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Evet, Sil
                </button>
                <button onClick={() => setConfirmBulkRemove(false)} className="text-xs text-slate-600 hover:underline dark:text-slate-400">
                  Vazgeç
                </button>
              </>
            )}
            {filter === 'draft' && !confirmBulkRemove && (
              <button onClick={handleBulkRemoveAllDrafts} disabled={bulkLoading}
                className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                <Trash2 className="h-3 w-3" />Tüm Taslakları Sil
              </button>
            )}
            {filter === 'removed' && !confirmBulkRemove && (
              <button onClick={handlePurgeAllArchived} disabled={bulkLoading}
                className="flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50">
                <Trash2 className="h-3 w-3" />Tümünü Kalıcı Sil
              </button>
            )}
            {selected.size > 0 && !confirmBulkRemove && (
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-600 hover:underline dark:text-blue-400">
                Seçimi temizle
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-4 py-2.5">
            <input type="checkbox" checked={selected.size === posts.length && posts.length > 0}
              onChange={toggleAll} className="h-3.5 w-3.5 accent-blue-600" />
            <span className="text-xs font-bold text-[rgb(var(--color-muted))]">
              {loading ? 'Yükleniyor…' : `${filtered.length} haber · Sayfa ${currentPage + 1}`}
            </span>
            <Newspaper className="ml-auto h-4 w-4 text-[rgb(var(--color-muted))]" />
          </div>

          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Newspaper className="mx-auto h-10 w-10 text-[rgb(var(--color-muted))]" />
              <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">Bu filtrede haber bulunamadı</p>
            </div>
          ) : (
            filtered.map(post => (
              <NewsRow
                key={post.id}
                post={post}
                selected={selected.has(post.id)}
                onToggleSelect={() => toggleSelect(post.id)}
                onApprove={handleApprove}
                onReject={handleReject}
                onRemove={handleRemove}
                onEdit={handleEdit}
                actionLoading={actionLoading}
              />
            ))
          )}
        </div>

        {!search.trim() && (knownPages > 1 || hasNext) && (
          <PaginationBar
            currentPage={currentPage}
            knownPages={knownPages}
            hasNext={hasNext}
            loading={loading}
            onPage={(p) => { void load(p) }}
          />
        )}
      </div>

      {editingPost && (
        <EditDrawer
          post={editingPost}
          userId={user?.uid ?? ''}
          username={user?.username ?? ''}
          onClose={() => setEditingPost(null)}
          onSaved={(updated) => { handleSaved(editingPost.id, updated) }}
        />
      )}
    </div>
  )
}
