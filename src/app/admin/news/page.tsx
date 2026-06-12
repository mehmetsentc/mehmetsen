'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Plus, Search, RefreshCw, CheckCircle2, XCircle, Trash2,
  ExternalLink, Wand2, Eye, Loader2, ChevronDown, Filter,
  Newspaper, BarChart3, Clock, Tag, Globe, Pencil, X, Save,
} from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { adminNewsService, type AdminNewsFilter, type AdminNewsItem } from '@/services/adminNewsService'
import { auth } from '@/lib/firebase/auth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { DEFAULT_CATEGORIES } from '@/constants/config'

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
  const url = `nahaber.com/news/${post.id}`

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
  onClose,
  onSaved,
}: {
  post: AdminNewsItem
  onClose: () => void
  onSaved: (updated: Partial<AdminNewsItem>) => void
}) {
  const [title, setTitle] = useState(post.title ?? '')
  const [summary, setSummary] = useState(post.summary ?? '')
  const [content, setContent] = useState(post.content ?? '')
  const [spot, setSpot] = useState(post.spot ?? '')
  const [categoryId, setCategoryId] = useState(post.categoryId ?? '')
  const [status, setStatus] = useState<string>(post.status ?? 'draft')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Başlık boş olamaz'); return }
    setSaving(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/admin/news/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ title, summary, content, spot, categoryId, status }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Kayıt başarısız')
      }
      toast.success('Haber güncellendi')
      onSaved({ title, summary, content, spot, categoryId, status: status as AdminNewsItem['status'] })
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
              <a href={`/news/${post.id}`} target="_blank" rel="noopener noreferrer"
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

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminNewsPage() {
  const { can } = useCmsAuth()
  const [filter, setFilter] = useState<AdminNewsFilter>('all')
  const [search, setSearch] = useState('')
  const [posts, setPosts] = useState<AdminNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [editingPost, setEditingPost] = useState<AdminNewsItem | null>(null)

  const load = useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const result = await adminNewsService.list(filter, reset ? undefined : lastDoc ?? undefined)
      setPosts(prev => reset ? result.posts : [...prev, ...result.posts])
      setLastDoc(result.lastDoc)
      setHasMore(result.hasMore)
      if (reset) setSelected(new Set())
    } catch {
      toast.error('Haberler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [filter, lastDoc])

  useEffect(() => {
    setLastDoc(null)
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

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
    if (!confirm('Bu haberi kaldırmak istediğinize emin misiniz?')) return
    setActionLoading(id)
    try {
      await adminNewsService.remove(id)
      toast.success('Haber kaldırıldı')
      setPosts(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('Kaldırma başarısız') }
    finally { setActionLoading(null) }
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
    if (!selected.size || !confirm(`${selected.size} haberi kaldırmak istediğinize emin misiniz?`)) return
    setBulkLoading(true)
    for (const id of selected) {
      try { await adminNewsService.remove(id) } catch { /* skip */ }
    }
    toast.success(`${selected.size} haber kaldırıldı`)
    setPosts(prev => prev.filter(p => !selected.has(p.id)))
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

  const filtered = search.trim()
    ? posts.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
    : posts

  const pendingCount = posts.filter(p => p.status === 'pending').length

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="Haberler"
        subtitle="İçerik editörü ve onay merkezi"
        actions={
          <Link href={ROUTES.ADMIN.NEWS_CREATE}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />Yeni Haber
          </Link>
        }
      />
      <div className="p-6 space-y-4">
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
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Başlıkta ara..."
              className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2 pl-8 pr-3 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={() => load(true)}
            className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-blue-950/30">
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{selected.size} seçili</span>
            <button onClick={handleBulkApprove} disabled={bulkLoading}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Toplu Onayla
            </button>
            <button onClick={handleBulkRemove} disabled={bulkLoading}
              className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
              <Trash2 className="h-3 w-3" />Toplu Kaldır
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-600 hover:underline dark:text-blue-400">
              Seçimi temizle
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-4 py-2.5">
            <input type="checkbox" checked={selected.size === posts.length && posts.length > 0}
              onChange={toggleAll} className="h-3.5 w-3.5 accent-blue-600" />
            <span className="text-xs font-bold text-[rgb(var(--color-muted))]">
              {loading ? 'Yükleniyor…' : `${filtered.length} haber`}
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

        {hasMore && !loading && (
          <div className="text-center">
            <button onClick={() => load(false)}
              className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-6 py-2 text-sm font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]">
              Daha Fazla Yükle
            </button>
          </div>
        )}
      </div>

      {editingPost && (
        <EditDrawer
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={(updated) => { handleSaved(editingPost.id, updated) }}
        />
      )}
    </div>
  )
}
