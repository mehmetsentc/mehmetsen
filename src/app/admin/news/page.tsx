'use client'

import { useCallback, useEffect, useMemo, useState, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Search, RefreshCw, CheckCircle2, XCircle, Trash2,
  ExternalLink, Wand2, Loader2,
  Newspaper, BarChart3, Clock, Tag, Globe, Pencil, X,
  ChevronLeft, ChevronRight, Eye, Share2, Smartphone, Star,
  Facebook, Instagram, ChevronDown,
} from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { AdminNewsEditor } from '@/components/admin/AdminNewsEditor'
import { MobileContent } from '@/components/admin/mobile/MobileContent'
import { adminNewsService, type AdminNewsFilter, type AdminNewsItem } from '@/services/adminNewsService'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/postUtils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'
import { ROUTES } from '@/constants/routes'
import { getCityCategoryName, normalizeCitySlug } from '@/constants/cities'
import {
  getAdminCategoryGroups,
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
  isYerelCategoryTree,
  resolveYerelCategoryParts,
  composeYerelCategoryId,
  YEREL_HABER_CATEGORY_ID,
} from '@/constants/config'
import { getCategoryLabel } from '@/lib/newsMapper'

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
  { id: 'featured', label: 'Öne Çıkan', color: 'text-amber-600' },
  { id: 'pending', label: 'Onay Bekliyor', color: 'text-amber-600' },
  { id: 'duplicate', label: 'Tekrar Haber', color: 'text-orange-600' },
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

// ── Inline category changer ────────────────────────────────────────────────
function CategoryDropdownPortal({
  anchorRef,
  open,
  onClose,
  align = 'left',
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number; width: number } | null>(null)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = 208
    const margin = 8
    const panelMaxH = 256
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const top = openUp
      ? Math.max(margin, rect.top - Math.min(panelMaxH, spaceAbove))
      : rect.bottom + 4
    const left = align === 'right'
      ? Math.min(rect.right - width, window.innerWidth - width - margin)
      : Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
    setStyle({ top, left, width })
  }, [anchorRef, align])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const onScroll = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  if (!open || typeof document === 'undefined' || !style) return null

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: style.top, left: style.left, width: style.width, zIndex: 9999 }}
      className="max-h-64 overflow-y-auto rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2 shadow-xl"
    >
      {children}
    </div>,
    document.body
  )
}

function InlineCategoryChanger({
  postId,
  categoryId,
  onCategoryChange,
  disabled,
  variant = 'metadata',
}: {
  postId: string
  categoryId: string
  citySlug?: string | null
  onCategoryChange: (postId: string, categoryId: string) => Promise<void>
  disabled?: boolean
  variant?: 'metadata' | 'action'
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localCategoryId, setLocalCategoryId] = useState(categoryId)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const categoryGroups = useMemo(() => getAdminCategoryGroups(), [])
  const yerelSubcategories = useMemo(() => getYerelSubcategories(), [])
  const yerelParts = useMemo(() => resolveYerelCategoryParts(localCategoryId), [localCategoryId])
  const isYerel = isYerelCategoryTree(localCategoryId)
  const mainCategoryId = isYerel ? YEREL_HABER_CATEGORY_ID : localCategoryId

  useEffect(() => {
    setLocalCategoryId(categoryId)
  }, [categoryId, postId])

  const label = useMemo(() => {
    if (isYerel && yerelParts.subcategoryId) {
      const sub = yerelSubcategories.find((c) => c.id === yerelParts.subcategoryId)
      return sub ? `Yerel · ${getYerelSubcategoryShortLabel(sub)}` : 'Yerel Haber'
    }
    return getCategoryLabel(localCategoryId) || localCategoryId || 'Kategori'
  }, [isYerel, yerelParts.subcategoryId, yerelSubcategories, localCategoryId])

  const applyCategory = async (next: string) => {
    if (!next || next === localCategoryId || saving) return
    const prev = localCategoryId
    setLocalCategoryId(next)
    setSaving(true)
    try {
      await onCategoryChange(postId, next)
    } catch {
      setLocalCategoryId(prev)
    } finally {
      setSaving(false)
    }
  }

  const handleMainSelect = async (next: string) => {
    setOpen(false)
    if (next === YEREL_HABER_CATEGORY_ID) {
      await applyCategory(composeYerelCategoryId(yerelParts.subcategoryId))
    } else {
      await applyCategory(next)
    }
  }

  const handleYerelSubSelect = async (subId: string) => {
    await applyCategory(composeYerelCategoryId(subId || null))
  }

  const isAction = variant === 'action'
  const selectCls = cn(
    'rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[10px] font-medium text-[rgb(var(--color-text))] focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50',
    isAction ? 'px-2 py-1.5' : 'px-1.5 py-0.5'
  )

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && !saving && setOpen((v) => !v)}
        disabled={disabled || saving}
        title={isAction ? `Kategori: ${label}` : 'Kategori değiştir'}
        className={cn(
          isAction
            ? 'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40 border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
            : 'inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))] disabled:opacity-50'
        )}
      >
        <Tag className={isAction ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
        <span>{isAction ? 'Kategori' : label}</span>
        {saving ? (
          <Loader2 className={cn('animate-spin', isAction ? 'h-3 w-3' : 'h-2.5 w-2.5')} />
        ) : (
          <ChevronDown className={cn(
            'opacity-60 transition-transform',
            isAction ? 'h-2.5 w-2.5 opacity-50' : 'h-2.5 w-2.5',
            open && 'rotate-180'
          )} />
        )}
      </button>

      {isYerel && (
        <select
          value={yerelParts.subcategoryId ?? ''}
          disabled={disabled || saving}
          onChange={(e) => void handleYerelSubSelect(e.target.value)}
          className={selectCls}
          title="Yerel alt kategori"
        >
          <option value="">Genel yerel</option>
          {yerelSubcategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {getYerelSubcategoryShortLabel(cat)}
            </option>
          ))}
        </select>
      )}

      <CategoryDropdownPortal
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        align={isAction ? 'right' : 'left'}
      >
        {categoryGroups.map((group) => (
          <div key={group.label} className="mb-2 last:mb-0">
            <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              {group.label}
            </p>
            {group.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => void handleMainSelect(cat.id)}
                className={cn(
                  'block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[rgb(var(--color-surface))]',
                  cat.id === mainCategoryId &&
                    'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                )}
              >
                {cat.parentId ? `↳ ${cat.name}` : cat.name}
              </button>
            ))}
          </div>
        ))}
      </CategoryDropdownPortal>
    </div>
  )
}

// ── News Row ───────────────────────────────────────────────────────────────
function newsHasShareImage(post: AdminNewsItem): boolean {
  if (post.coverImageUrl?.trim()) return true
  return (post.mediaItems ?? []).some((m) => m.type === 'image' && !!m.url?.trim())
}

type SocialShareMode = 'story' | 'post'

interface PlatformFlags {
  facebook: boolean
  instagram: boolean
  twitter: boolean
  threads: boolean
}

const ThreadsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.186 24h-.007C5.461 23.956.057 18.51 0 11.735c.057-6.775 5.461-12.22 12.179-12.264h.007C18.539.015 23.943 5.46 24 12.235c-.057 6.776-5.461 12.221-12.179 12.265h-.007zm0-22.53h-.006C6.566 1.513 1.988 6.127 1.942 12.008v.019c.046 5.881 4.624 10.495 10.238 10.538h.006c5.614-.043 10.192-4.657 10.238-10.538v-.019c-.046-5.881-4.624-10.495-10.238-10.538zm3.234 14.588a3.82 3.82 0 0 1-1.12 1.605c-1.468 1.2-3.568 1.452-5.282.576a4.26 4.26 0 0 1-2.028-2.424 6.26 6.26 0 0 1-.378-2.112c-.024-.792.06-1.584.252-2.352.36-1.44 1.2-2.592 2.472-3.168 1.344-.612 2.832-.54 4.104.168.564.312 1.032.768 1.38 1.308l-1.284.876a2.64 2.64 0 0 0-.84-.888c-.78-.48-1.74-.468-2.508.036-.792.516-1.272 1.404-1.476 2.436a5.3 5.3 0 0 0-.096 1.668c.048.564.18 1.116.42 1.62.36.768 1.008 1.272 1.824 1.404.816.132 1.596-.108 2.124-.672.336-.36.54-.816.6-1.308h-2.172v-1.344h3.636v.612c.024.72-.108 1.404-.384 2.04l-.264.108z" />
  </svg>
)

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const STORY_PLATFORMS: { key: keyof PlatformFlags; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
]

const POST_PLATFORMS: { key: keyof PlatformFlags; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'twitter', label: 'X (Twitter)', Icon: XIcon },
  { key: 'threads', label: 'Threads', Icon: ThreadsIcon },
]

function SocialSharePopover({
  mode,
  onShare,
  onClose,
  isAlreadyPublished,
}: {
  mode: SocialShareMode
  onShare: (platforms: PlatformFlags) => void
  onClose: () => void
  isAlreadyPublished: boolean
}) {
  const platforms = mode === 'story' ? STORY_PLATFORMS : POST_PLATFORMS
  const [flags, setFlags] = useState<PlatformFlags>({
    facebook: true,
    instagram: true,
    twitter: mode === 'post',
    threads: mode === 'post',
  })
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const anySelected = platforms.some(p => flags[p.key])

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2 shadow-xl"
    >
      <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        {mode === 'story' ? 'Hikâye Platformları' : 'Post Platformları'}
      </p>
      <div className="space-y-0.5">
        {platforms.map(({ key, label, Icon }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[rgb(var(--color-surface))] transition-colors"
          >
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={() => setFlags(prev => ({ ...prev, [key]: !prev[key] }))}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <Icon className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
            <span className="text-xs font-medium text-[rgb(var(--color-text))]">{label}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onShare(flags)}
          disabled={!anySelected}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {mode === 'story' ? <Smartphone className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
          {isAlreadyPublished ? 'Yeniden Paylaş' : 'Paylaş'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1.5 text-[11px] font-bold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function NewsRow({
  post,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onRemove,
  onEdit,
  onCategoryChange,
  actionLoading,
}: {
  post: AdminNewsItem
  selected: boolean
  onToggleSelect: () => void
  onApprove: (p: AdminNewsItem) => void
  onReject: (p: AdminNewsItem) => void
  onRemove: (id: string) => void
  onEdit: (p: AdminNewsItem) => void
  onCategoryChange: (postId: string, categoryId: string) => Promise<void>
  actionLoading: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showSeo, setShowSeo] = useState(false)
  const [sharingMode, setSharingMode] = useState<SocialShareMode | null>(null)
  const [socialPublished, setSocialPublished] = useState(!!post.socialPublished)
  const [storyPublished, setStoryPublished] = useState(!!post.storyPublished)
  const [popoverMode, setPopoverMode] = useState<SocialShareMode | null>(null)
  const busy = actionLoading === post.id || sharingMode !== null
  const badge = STATUS_BADGE[post.status ?? 'draft'] ?? STATUS_BADGE.draft
  const canShare = newsHasShareImage(post)

  useEffect(() => {
    setSocialPublished(!!post.socialPublished)
    setStoryPublished(!!post.storyPublished)
  }, [post.id, post.socialPublished, post.storyPublished])

  const publishedAtStr = post.publishedAt ?? post.createdAt
  const publishedAt = publishedAtStr
    ? formatDistanceToNow(new Date(publishedAtStr), { locale: tr, addSuffix: true })
    : '—'

  const shareSocial = async (mode: SocialShareMode, platforms: PlatformFlags) => {
    if (!canShare || sharingMode) return

    const alreadyKnown = mode === 'post' ? socialPublished : storyPublished
    let force = alreadyKnown
    if (alreadyKnown) {
      const ok = window.confirm(
        mode === 'story'
          ? 'Bu haber zaten hikâye olarak paylaşılmış. Yeniden paylaş?'
          : 'Bu haber zaten feed post olarak paylaşılmış. Yeniden paylaş?'
      )
      if (!ok) return
    }

    const platformNames: string[] = []
    if (platforms.facebook) platformNames.push('FB')
    if (platforms.instagram) platformNames.push('IG')
    if (mode === 'post' && platforms.twitter) platformNames.push('X')
    if (mode === 'post' && platforms.threads) platformNames.push('Th')

    const run = async (useForce: boolean) => {
      setSharingMode(mode)
      const toastId = toast.loading(
        mode === 'story'
          ? `Hikâye paylaşılıyor (${platformNames.join(', ')})…`
          : `Post paylaşılıyor (${platformNames.join(', ')})…`
      )

      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        const res = await fetch('/api/admin/social/force-reshare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ids: [post.id],
            mode,
            manual: true,
            force: useForce,
            platforms: {
              facebook: platforms.facebook,
              instagram: platforms.instagram,
              twitter: mode === 'post' ? platforms.twitter : false,
              threads: mode === 'post' ? platforms.threads : false,
            },
          }),
        })
        const data = await res.json() as {
          error?: string
          results?: Array<{
            ok: boolean
            reason?: string
            post?: {
              facebook: { success: boolean }
              instagram: { success: boolean }
              twitter?: { success: boolean }
              threads?: { success: boolean }
            }
            story?: {
              facebook: { success: boolean }
              instagram: { success: boolean }
            }
          }>
        }

        const r0 = data.results?.[0]
        if (!res.ok) {
          const msg = data.error ?? r0?.reason ?? 'Paylaşım başarısız'
          if (!useForce && /zaten|force/i.test(msg)) {
            toast.dismiss(toastId)
            if (mode === 'post') setSocialPublished(true)
            if (mode === 'story') setStoryPublished(true)
            const ok = window.confirm(
              mode === 'story'
                ? 'Bu haber zaten hikâye olarak paylaşılmış. Yeniden paylaş?'
                : 'Bu haber zaten feed post olarak paylaşılmış. Yeniden paylaş?'
            )
            if (ok) {
              setSharingMode(null)
              return run(true)
            }
            return
          }
          toast.error(msg, { id: toastId })
          return
        }

        const parts: string[] = []
        if (r0?.post) {
          const items: string[] = []
          if (platforms.facebook) items.push(`FB:${r0.post.facebook.success ? '✓' : '✗'}`)
          if (platforms.instagram) items.push(`IG:${r0.post.instagram.success ? '✓' : '✗'}`)
          if (platforms.twitter && r0.post.twitter) items.push(`X:${r0.post.twitter.success ? '✓' : '✗'}`)
          if (platforms.threads && r0.post.threads) items.push(`Th:${r0.post.threads.success ? '✓' : '✗'}`)
          parts.push(`Post ${items.join(' ')}`)
        }
        if (r0?.story) {
          const items: string[] = []
          if (platforms.facebook) items.push(`FB:${r0.story.facebook.success ? '✓' : '✗'}`)
          if (platforms.instagram) items.push(`IG:${r0.story.instagram.success ? '✓' : '✗'}`)
          parts.push(`Hikâye ${items.join(' ')}`)
        }
        toast.success(parts.join(' · ') || 'Paylaşıldı', { id: toastId })

        if (mode === 'post') setSocialPublished(true)
        if (mode === 'story') setStoryPublished(true)
      } catch (err) {
        console.error('[admin/news] social share error:', err)
        toast.error('Bağlantı hatası', { id: toastId })
      } finally {
        setSharingMode(null)
      }
    }

    await run(force)
  }

  const handlePopoverShare = (mode: SocialShareMode) => (platforms: PlatformFlags) => {
    setPopoverMode(null)
    void shareSocial(mode, platforms)
  }

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
            {post.featured && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <Star className="h-2.5 w-2.5 fill-current" />Öne Çıkan
              </span>
            )}
            {post.isDuplicate && (
              <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                🔁 TEKRAR
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[rgb(var(--color-muted))]">
            <InlineCategoryChanger
              postId={post.id}
              categoryId={post.categoryId ?? ''}
              citySlug={post.citySlug}
              onCategoryChange={onCategoryChange}
              disabled={busy}
            />
            {post.readingTimeMinutes && <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{post.readingTimeMinutes} dk okuma</span>}
            {(post as AdminNewsItem & { citySlug?: string }).citySlug && <span className="flex items-center gap-1"><Globe className="h-2.5 w-2.5" />{(post as AdminNewsItem & { citySlug?: string }).citySlug}</span>}
            <span className="flex items-center gap-1 font-semibold tabular-nums text-[rgb(var(--color-text))]" title="Oturum başına en fazla 1 sayım">
              <Eye className="h-2.5 w-2.5" />
              {formatCount(post.viewsCount ?? 0)} görüntülenme
            </span>
            <span>{publishedAt}</span>
          </div>
          {post.isDuplicate && post.duplicateReason && (
            <p className="mt-1 line-clamp-1 text-[11px] text-orange-600 dark:text-orange-400">
              ⚠️ {post.duplicateReason}
            </p>
          )}
          {!post.isDuplicate && post.spot && (
            <p className="mt-1 line-clamp-1 text-[11px] italic text-[rgb(var(--color-muted))]">{post.spot}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-1 items-end">
          <div className="flex flex-wrap justify-end gap-1">
            {(post.status === 'pending' || post.status === 'draft') && (
              <button onClick={() => onApprove(post)} disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy && !sharingMode ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Onayla
              </button>
            )}
            {post.status === 'pending' && (
              <button onClick={() => onReject(post)} disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50">
                <XCircle className="h-3 w-3" />Reddet
              </button>
            )}
            {post.status === 'published' && (
              <a href={ROUTES.NEWS_DETAIL(post.slug || post.id)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-[11px] font-bold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]">
                <ExternalLink className="h-3 w-3" />Görüntüle
              </a>
            )}

            {/* Hikâye — popover ile platform seçimi */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPopoverMode(popoverMode === 'story' ? null : 'story')}
                disabled={!canShare || busy}
                title={canShare ? (storyPublished ? 'Hikâye yeniden paylaş (IG/FB)' : 'Hikâye paylaş (IG/FB)') : 'Görsel yok — paylaşım için kapak gerekli'}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40',
                  storyPublished
                    ? 'border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/30'
                    : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                )}
              >
                {sharingMode === 'story' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smartphone className="h-3 w-3" />}
                Hikâye
                <ChevronDown className="h-2.5 w-2.5 opacity-50" />
              </button>
              {popoverMode === 'story' && (
                <SocialSharePopover
                  mode="story"
                  onShare={handlePopoverShare('story')}
                  onClose={() => setPopoverMode(null)}
                  isAlreadyPublished={storyPublished}
                />
              )}
            </div>

            {/* Post — popover ile platform seçimi */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPopoverMode(popoverMode === 'post' ? null : 'post')}
                disabled={!canShare || busy}
                title={canShare ? (socialPublished ? 'Post yeniden paylaş (FB/IG/Th/X)' : 'Post paylaş (FB/IG/Th/X)') : 'Görsel yok — paylaşım için kapak gerekli'}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40',
                  socialPublished
                    ? 'border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/30'
                    : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                )}
              >
                {sharingMode === 'post' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                Post
                <ChevronDown className="h-2.5 w-2.5 opacity-50" />
              </button>
              {popoverMode === 'post' && (
                <SocialSharePopover
                  mode="post"
                  onShare={handlePopoverShare('post')}
                  onClose={() => setPopoverMode(null)}
                  isAlreadyPublished={socialPublished}
                />
              )}
            </div>

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
            <InlineCategoryChanger
              postId={post.id}
              categoryId={post.categoryId ?? ''}
              citySlug={post.citySlug}
              onCategoryChange={onCategoryChange}
              disabled={busy}
              variant="action"
            />
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
  const isMobile = useIsMobileAdminViewport()

  if (isMobile === null) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  if (isMobile) {
    return (
      <Suspense fallback={<div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>}>
        <MobileContent />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>}>
      <AdminNewsDesktopPage />
    </Suspense>
  )
}

const CATEGORY_CHIPS: { id: string; label: string }[] = [
  { id: 'son-dakika', label: '🔴 Son Dakika' },
  { id: 'gundem', label: 'Gündem' },
  { id: 'siyaset', label: 'Siyaset' },
  { id: 'dunya', label: 'Dünya' },
  { id: 'spor', label: 'Spor' },
  { id: 'ekonomi', label: 'Ekonomi' },
  { id: 'teknoloji', label: 'Teknoloji' },
  { id: 'saglik', label: 'Sağlık' },
  { id: 'yerel-haber', label: 'Yerel' },
]

const YEREL_CATEGORY_ID = 'yerel-haber'

/** Resolve a post's city/citySlug to a canonical province slug (ilçe → il). */
function postProvinceSlug(post: AdminNewsItem): string | null {
  const raw = post.citySlug?.trim() || post.city?.trim() || ''
  if (!raw) return null
  const slug = normalizeCitySlug(raw)
  return slug || null
}

function AdminNewsDesktopPage() {
  const { can, user, loading: authLoading } = useCmsAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') ?? ''
  const filterParam = searchParams.get('filter') ?? ''
  const qParam = searchParams.get('q') ?? ''
  const initialFilter: AdminNewsFilter =
    filterParam === 'published' ||
    filterParam === 'pending' ||
    filterParam === 'duplicate' ||
    filterParam === 'draft' ||
    filterParam === 'removed' ||
    filterParam === 'featured'
      ? filterParam
      : 'all'
  const [filter, setFilter] = useState<AdminNewsFilter>(initialFilter)
  // Local category state — Link soft-nav was freezing pills after the first click.
  // Drive the UI like status filters; keep the URL in sync via replace.
  const [categoryFilter, setCategoryFilter] = useState(categoryParam)
  const [cityFilter, setCityFilter] = useState('')
  const pendingCategoryRef = useRef<string | null>(null)
  const cachedCitiesRef = useRef<{ slug: string; name: string; count: number }[]>([])

  useEffect(() => {
    // Ignore out-of-order URL updates while a user-driven category change is in flight.
    if (pendingCategoryRef.current !== null) {
      if (categoryParam === pendingCategoryRef.current) {
        pendingCategoryRef.current = null
      }
      return
    }
    setCategoryFilter(categoryParam)
  }, [categoryParam])

  // İl filtresi yalnızca Yerel kategorisinde anlamlı; çıkınca temizle
  useEffect(() => {
    if (categoryFilter !== YEREL_CATEGORY_ID) {
      if (cityFilter) setCityFilter('')
      cachedCitiesRef.current = []
    }
  }, [categoryFilter, cityFilter])

  useEffect(() => {
    const fp = searchParams.get('filter') ?? ''
    if (fp === 'published' || fp === 'pending' || fp === 'duplicate' || fp === 'draft' || fp === 'removed' || fp === 'featured') {
      setFilter(fp)
    } else if (!fp) {
      setFilter('all')
    }
  }, [searchParams])
  const [search, setSearch] = useState(qParam)

  useEffect(() => {
    const q = searchParams.get('q') ?? ''
    if (q && q !== search) setSearch(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate from URL only when q changes
  }, [searchParams])
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

  // Keep a ref so `load` always reads the latest category without being recreated
  const categoryFilterRef = useRef(categoryFilter)
  categoryFilterRef.current = categoryFilter

  const cityFilterRef = useRef(cityFilter)
  cityFilterRef.current = cityFilter

  // Generation counter — discard stale in-flight loads when category/filter changes mid-fetch
  const loadGenRef = useRef(0)

  const syncCategoryToUrl = useCallback((nextCategory: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (nextCategory) params.set('category', nextCategory)
    else params.delete('category')
    const qs = params.toString()
    router.replace(qs ? `${ROUTES.ADMIN.NEWS}?${qs}` : ROUTES.ADMIN.NEWS, { scroll: false })
  }, [router, searchParams])

  const selectCategory = useCallback((nextCategory: string) => {
    if (nextCategory === categoryFilterRef.current) return
    pendingCategoryRef.current = nextCategory
    if (nextCategory !== YEREL_CATEGORY_ID) setCityFilter('')
    setCategoryFilter(nextCategory)
    syncCategoryToUrl(nextCategory)
  }, [syncCategoryToUrl])

  const load = useCallback(async (page: number, searchOverride?: string) => {
    const myGen = ++loadGenRef.current
    setLoading(true)
    const searchTerm = searchOverride !== undefined ? searchOverride : search
    try {
      const cursor = pageCursorsRef.current[page] ?? undefined
      // Arama aktifken kategori filtresi kaldırılır — tüm haberlerde arar
      const catFilter = searchTerm.trim() ? undefined : categoryFilterRef.current || undefined
      // İl filtresi — Firestore'a doğrudan geçirilir (server-side)
      const citySlugFilter = searchTerm.trim() ? undefined : cityFilterRef.current || undefined
      // 'duplicate' filtresi: Firestore'dan pending'leri çek, client-side isDuplicate filtrele
      const fsFilter: AdminNewsFilter = filter === 'duplicate' ? 'pending' : filter
      const [result, tagResults] = await Promise.all([
        adminNewsService.list(fsFilter, cursor, catFilter, filter === 'duplicate' ? 500 : (searchTerm.trim() ? 500 : undefined), citySlugFilter),
        searchTerm.trim() ? adminNewsService.searchByTag(searchTerm) : Promise.resolve([]),
      ])
      if (myGen !== loadGenRef.current) return
      // Tag sorgusu sonuçlarını merge et — 500 limitinin dışındaki eski haberler de görünsün
      const seen = new Set(result.posts.map(p => p.id))
      const merged = [...result.posts]
      for (const p of tagResults) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p) }
      }
      // Tekrar haber filtresi → client-side isDuplicate === true
      const filtered = filter === 'duplicate' ? merged.filter(p => p.isDuplicate === true) : merged
      setPosts(filtered)
      setCurrentPage(page)
      const effectiveHasMore = result.hasMore && filtered.length > 0
      setHasNext(effectiveHasMore)
      if (effectiveHasMore && result.lastDoc && !pageCursorsRef.current[page + 1]) {
        pageCursorsRef.current[page + 1] = result.lastDoc
        setKnownPages(prev => Math.max(prev, page + 2))
      }
      if (filtered.length === 0) {
        setKnownPages(page + 1)
      }
      setSelected(new Set())
    } catch (err) {
      if (myGen !== loadGenRef.current) return
      console.error('[admin/news] load error:', err)
      toast.error('Haberler yüklenemedi')
    } finally {
      if (myGen === loadGenRef.current) setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    if (authLoading) return
    // Reset pagination on filter, category, or city change.
    pageCursorsRef.current = [null]
    setCurrentPage(0)
    setKnownPages(1)
    setHasNext(false)
    const tid = setTimeout(() => { void load(0) }, 0)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, categoryFilter, cityFilter, authLoading])

  const handleApprove = async (post: AdminNewsItem) => {
    setActionLoading(post.id)
    try {
      await adminNewsService.approve(post.id, post.adminSource)
      toast.success('Haber onaylandı')
      setPosts(prev => prev.filter(p => p.id !== post.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Onaylama başarısız')
    } finally {
      setActionLoading(null)
    }
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
      const source = post?.adminSource
      if (source === 'newsQueue') {
        await adminNewsService.remove(id, undefined, 'newsQueue')
        toast.success('Kuyruktan kaldırıldı')
      } else if (post?.status === 'draft' || post?.status === 'archived') {
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
    // Taslak + onay bekleyen: tekil "Onayla" ile aynı approve akışı
    const eligible = posts.filter(
      p => selected.has(p.id) && (p.status === 'pending' || p.status === 'draft')
    )
    if (!eligible.length) { toast('Seçili onaylanacak haber yok'); return }
    setBulkLoading(true)
    let done = 0
    const approvedIds = new Set<string>()
    for (const p of eligible) {
      try {
        await adminNewsService.approve(p.id, p.adminSource)
        done++
        approvedIds.add(p.id)
      } catch { /* skip */ }
    }
    toast.success(`${done} haber onaylandı`)
    setPosts(prev => prev.filter(p => !approvedIds.has(p.id)))
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

  const [editorialLoading, setEditorialLoading] = useState(false)
  const [purgeLoading, setPurgeLoading] = useState(false)
  const [requeueLoading, setRequeueLoading] = useState(false)

  const handleRunEditorialReview = async () => {
    if (!confirm('AI Genel Yayın Editörü tüm pending haberleri inceleyecek. Benzersiz olanlar otomatik yayınlanacak. Devam edilsin mi?')) return
    setEditorialLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/editorial-review/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ limit: 500 }),
      })
      const data = await res.json() as { processed?: number; published?: number; duplicate?: number; errors?: number }
      if (!res.ok) throw new Error('API hatası')
      toast.success(`✅ ${data.processed ?? 0} haber incelendi — ${data.published ?? 0} yayınlandı, ${data.duplicate ?? 0} tekrar olarak işaretlendi`)
      void load(0)
    } catch {
      toast.error('AI editör incelemesi başarısız')
    } finally {
      setEditorialLoading(false)
    }
  }

  const handlePurgeQueue = async () => {
    if (!confirm('Kuyruktaki 24 saatten eski bekleyen haberleri silmek istediğinize emin misiniz? (Bugünkü haberler korunur)')) return
    setPurgeLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/newsroom/purge-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ olderThanHours: 24, keepToday: true }),
      })
      const result = await res.json() as { deleted?: number; message?: string }
      if (!res.ok) throw new Error('API hatası')
      toast.success(`🗑️ ${result.deleted ?? 0} eski kuyruk öğesi silindi`)
    } catch {
      toast.error('Kuyruk temizleme başarısız')
    } finally {
      setPurgeLoading(false)
    }
  }

  const handleRequeueSkipped = async () => {
    if (!confirm('Atlanan (skipped) kuyruk öğelerini yeniden kuyruğa almak istiyor musunuz? Cron bir sonraki çalışmada bunları işleyecek.')) return
    setRequeueLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/newsroom/requeue-skipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resetCreatedAt: true, includeDeadLetter: true }),
      })
      const result = await res.json() as { requeued?: number; message?: string }
      if (!res.ok) throw new Error('API hatası')
      toast.success(`♻️ ${result.requeued ?? 0} öğe yeniden kuyruğa alındı`)
      void load(0)
    } catch {
      toast.error('Yeniden kuyruğa alma başarısız')
    } finally {
      setRequeueLoading(false)
    }
  }

  const handleEdit = (post: AdminNewsItem) => setEditingPost(post)

  const handleSaved = (id: string, updated: Partial<AdminNewsItem>) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
  }

  const handleCategoryChange = useCallback(async (postId: string, categoryId: string) => {
    const prevPost = posts.find((p) => p.id === postId)
    if (!prevPost) return

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, categoryId, isBreaking: categoryId === 'son-dakika' }
          : p
      )
    )

    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/news/${postId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          categoryId,
          isBreaking: categoryId === 'son-dakika',
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Kategori güncellenemedi')
      }
      toast.success('Kategori güncellendi')
    } catch (e) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? prevPost : p)))
      toast.error(e instanceof Error ? e.message : 'Kategori güncellenemedi')
      throw e
    }
  }, [posts])

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

  // Yerel listesindeki iller — il filtresi yokken mevcut sayfadaki haberlerden hesaplanır.
  // Bir il seçildiğinde sunucu yalnızca o ilin haberlerini döner, bu yüzden listeyi cache'leriz.
  const availableCities = useMemo(() => {
    if (cityFilter) return cachedCitiesRef.current
    const counts = new Map<string, number>()
    for (const p of posts) {
      const slug = postProvinceSlug(p)
      if (!slug) continue
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
    const list = [...counts.entries()]
      .map(([slug, count]) => ({ slug, name: getCityCategoryName(slug), count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    if (list.length > 0) cachedCitiesRef.current = list
    return list
  }, [posts, cityFilter])

  const filtered = posts.filter(p => {
    if (cityFilter) {
      const slug = postProvinceSlug(p)
      if (slug !== cityFilter) return false
    }
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
  const isYerel = categoryFilter === YEREL_CATEGORY_ID

  return (
    <div className="flex flex-col">
      <CMSHeader
        title={categoryFilter ? `Haberler — ${categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1).replace('-', ' ')}` : 'Haberler'}
        subtitle={categoryFilter ? `${categoryFilter} kategorisi filtresi aktif` : 'İçerik editörü ve onay merkezi'}
      />
      <div className="p-6 space-y-4">
        {/* Category quick-filter chips — buttons (not Links) so soft-nav cannot freeze the row */}
        <div className="relative z-10 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            type="button"
            onClick={() => selectCategory('')}
            className={cn(
              'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
              !categoryFilter
                ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-surface))] shadow-sm'
                : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            Tüm Kategoriler
          </button>
          {CATEGORY_CHIPS.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCategory(cat.id)}
              className={cn(
                'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                categoryFilter === cat.id
                  ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                  : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Yerel → il (province) filter chips */}
        {isYerel && (
          <div className="relative z-10 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => setCityFilter('')}
              className={cn(
                'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                !cityFilter
                  ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                  : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              Tüm iller
            </button>
            {availableCities.map(city => (
              <button
                key={city.slug}
                type="button"
                onClick={() => setCityFilter(city.slug === cityFilter ? '' : city.slug)}
                className={cn(
                  'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                  cityFilter === city.slug
                    ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                    : 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}
                title={`${city.count} haber`}
              >
                {city.name}
              </button>
            ))}
          </div>
        )}

        {/* Filter tabs + search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => {
                setFilter(f.id)
                const params = new URLSearchParams(searchParams.toString())
                if (f.id === 'all') params.delete('filter')
                else params.set('filter', f.id)
                params.delete('category')
                const qs = params.toString()
                router.replace(qs ? `${ROUTES.ADMIN.NEWS}?${qs}` : ROUTES.ADMIN.NEWS, { scroll: false })
              }}
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
        {(selected.size > 0 || filter === 'draft' || filter === 'pending') && (
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
            {filter === 'pending' && !confirmBulkRemove && (
              <button onClick={handleRunEditorialReview} disabled={editorialLoading || bulkLoading}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50 ml-auto">
                {editorialLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                AI Editör İncele
              </button>
            )}
            {filter === 'pending' && !confirmBulkRemove && (
              <button onClick={handleRequeueSkipped} disabled={requeueLoading || bulkLoading}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {requeueLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Kuyruğu Yeniden İşle
              </button>
            )}
            {filter === 'pending' && !confirmBulkRemove && (
              <button onClick={handlePurgeQueue} disabled={purgeLoading || bulkLoading}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                {purgeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Eski Kuyruğu Temizle
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
                onCategoryChange={handleCategoryChange}
                actionLoading={actionLoading}
              />
            ))
          )}
        </div>

        {!search.trim() && filtered.length > 0 && (hasNext || knownPages > 1 || currentPage > 0) && (
          <PaginationBar
            currentPage={currentPage}
            knownPages={knownPages}
            hasNext={hasNext}
            loading={loading}
            onPage={(p) => { void load(p) }}
          />
        )}
      </div>

      {editingPost && user && (
        <AdminNewsEditor
          mode="edit"
          variant="drawer"
          post={editingPost}
          userId={user.uid}
          username={user.username}
          onClose={() => setEditingPost(null)}
          onSaved={(updated) => { handleSaved(editingPost.id, updated) }}
        />
      )}
    </div>
  )
}
