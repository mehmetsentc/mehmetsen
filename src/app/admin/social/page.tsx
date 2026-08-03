'use client'

import { useEffect, useState, useCallback, useMemo, useDeferredValue, type ReactNode } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  Share2, CheckCircle2, XCircle, RefreshCw, Loader2,
  Facebook, Instagram, ExternalLink, Play, Tag, Image as ImageIcon,
  Newspaper, BookImage, Search, KeyRound, Stethoscope, X, Copy,
  EyeOff, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  FALLBACK_CATEGORY_RULE,
  composerModeFromRule,
  normalizeCategoryRule,
  type SocialCategoryMode,
  type SocialCategoryRule,
  type SocialCategoryRulesDoc,
} from '@/lib/social/categoryRules'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

// ── Types ──────────────────────────────────────────────────────────────────────
type TabKey = 'post' | 'story'
type ShareMode = 'post' | 'story' | 'both'
type StatusFilter = 'all' | 'published' | 'pending'
type ComposerShareMode = ShareMode

interface SocialNewsRow {
  id: string
  title: string
  category?: string
  categoryId?: string
  citySlug?: string
  city?: string
  status?: string
  thumbnail?: string
  coverImageUrl?: string
  imageUrl?: string
  url?: string
  slug?: string
  sourceUrl?: string
  spot?: string
  summary?: string
  description?: string
  createdAt?: number | { toDate(): Date }
  publishedAt?: number | { toDate(): Date }
  socialPublished?: boolean
  socialPublishedAt?: number | { toDate(): Date }
  storyPublished?: boolean
  storyPublishedAt?: number | { toDate(): Date }
  socialImageUrl?: string
  socialHeadline?: string
  socialCaption?: string
  socialStorySummary?: string
  socialHashtags?: string[]
  facebookPostId?: string
  instagramMediaId?: string
  twitterTweetId?: string
  facebookStoryId?: string
  instagramStoryId?: string
  featured?: boolean
  isFeatured?: boolean
  hasVideo?: boolean
  isVideo?: boolean
}

interface PlatformToggles {
  facebook: boolean
  instagram: boolean
  twitter: boolean
}

interface LastShareResult {
  ok: boolean
  message: string
  post?: {
    facebook: { success: boolean; error?: string }
    instagram: { success: boolean; error?: string }
    twitter?: { success: boolean; error?: string }
  }
  story?: {
    facebook: { success: boolean; error?: string }
    instagram: { success: boolean; error?: string }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 24

const MAIN_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => !c.parentId).slice(0, 16)

function safeToDate(val: unknown): Date | null {
  if (val == null) return null
  if (typeof val === 'number') return new Date(val)
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    return (val as { toDate(): Date }).toDate()
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function getBestImage(row: SocialNewsRow): string | undefined {
  return row.socialImageUrl || row.thumbnail || row.coverImageUrl || row.imageUrl
}

function hasImage(row: SocialNewsRow): boolean {
  return !!getBestImage(row)
}

function isLikelyExternalRss(row: SocialNewsRow): boolean {
  const src = (row.sourceUrl ?? '').trim().toLowerCase()
  if (!src || !src.startsWith('http')) return false
  return !src.includes('nahaber.com') && !src.includes('onyeditivi.com')
}

function isShared(row: SocialNewsRow, tab: TabKey): boolean {
  return tab === 'post' ? !!row.socialPublished : !!row.storyPublished
}

function articleUrlOf(row: SocialNewsRow): string | null {
  if (row.url) return row.url
  if (row.slug) return ROUTES.NEWS_DETAIL(row.slug)
  return null
}

function parseHashtagInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
        ok
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-amber-500/15 text-amber-400'
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  )
}

function PlatformToggle({
  active,
  onChange,
  label,
  disabled,
  children,
}: {
  active: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
        active
          ? 'border-[rgb(var(--color-brand))]/50 bg-[rgb(var(--color-brand))]/15 text-white'
          : 'border-white/10 bg-white/5 text-[rgb(var(--color-muted))] hover:bg-white/10'
      )}
    >
      {children}
      {label}
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SocialPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('post')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [hideRss, setHideRss] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rows, setRows] = useState<SocialNewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)

  // Composer
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shareMode, setShareMode] = useState<ShareMode>('post')
  const [headline, setHeadline] = useState('')
  const [caption, setCaption] = useState('')
  const [storySummary, setStorySummary] = useState('')
  const [hashtagsRaw, setHashtagsRaw] = useState('')
  const [platforms, setPlatforms] = useState<PlatformToggles>({
    facebook: true,
    instagram: true,
    twitter: false,
  })
  const [forceReshare, setForceReshare] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [lastResult, setLastResult] = useState<LastShareResult | null>(null)
  const [previewTick, setPreviewTick] = useState(0)

  // Tools
  const [triggeringCron, setTriggeringCron] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagResult, setDiagResult] = useState<{ summary: string; steps: Array<{ name: string; ok: boolean; detail: string }> } | null>(null)
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showCategoryRules, setShowCategoryRules] = useState(false)
  const [categoryRules, setCategoryRules] = useState<SocialCategoryRulesDoc>({
    categories: {},
    default: { ...FALLBACK_CATEGORY_RULE },
  })
  const [categoryRulesDraft, setCategoryRulesDraft] = useState<Record<string, SocialCategoryRule>>({})
  const [defaultRuleDraft, setDefaultRuleDraft] = useState<SocialCategoryRule>({ ...FALLBACK_CATEGORY_RULE })
  const [loadingCategoryRules, setLoadingCategoryRules] = useState(false)
  const [savingCategoryRules, setSavingCategoryRules] = useState(false)
  const [newFbToken, setNewFbToken] = useState('')
  const [newIgToken, setNewIgToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [tokenResult, setTokenResult] = useState<{ ok: boolean; message: string; permissions?: string[]; note?: string } | null>(null)

  const deferredHeadline = useDeferredValue(headline)
  const deferredSpot = useDeferredValue(
    shareMode === 'post' ? (storySummary || caption.slice(0, 320)) : storySummary
  )

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  )

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const col = collection(db, 'news')
        const cursor = reset ? null : lastDoc

        const runQuery = async () => {
          if (tab === 'post' && statusFilter === 'published') {
            return getDocs(query(
              col,
              where('socialPublished', '==', true),
              orderBy('socialPublishedAt', 'desc'),
              limit(PAGE_SIZE),
              ...(cursor ? [startAfter(cursor)] : []),
            ))
          }
          if (tab === 'story' && statusFilter === 'published') {
            try {
              return await getDocs(query(
                col,
                where('storyPublished', '==', true),
                orderBy('storyPublishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            } catch {
              return getDocs(query(
                col,
                where('status', '==', 'published'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE * 2),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            }
          }
          if (tab === 'post' && statusFilter === 'pending') {
            return getDocs(query(
              col,
              where('citySlug', '==', 'canakkale'),
              where('status', '==', 'published'),
              orderBy('publishedAt', 'desc'),
              limit(PAGE_SIZE),
              ...(cursor ? [startAfter(cursor)] : []),
            ))
          }
          if (tab === 'story' && statusFilter === 'pending') {
            try {
              return await getDocs(query(
                col,
                where('status', '==', 'published'),
                where('categoryId', '==', 'gundem'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            } catch {
              return getDocs(query(
                col,
                where('status', '==', 'published'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            }
          }
          return getDocs(query(
            col,
            where('status', '==', 'published'),
            orderBy('publishedAt', 'desc'),
            limit(PAGE_SIZE),
            ...(cursor ? [startAfter(cursor)] : []),
          ))
        }

        const snap = await runQuery()

        let newRows: SocialNewsRow[] = snap.docs.map((doc) => {
          const d = doc.data() as Omit<SocialNewsRow, 'id'>
          return { id: doc.id, ...d }
        })

        if (statusFilter === 'pending') {
          newRows = newRows.filter((r) => !isShared(r, tab) && !r.hasVideo && !r.isVideo)
        }
        if (tab === 'story' && statusFilter === 'published') {
          newRows = newRows.filter((r) => !!r.storyPublished)
        }

        if (reset) setRows(newRows)
        else setRows((prev) => [...prev, ...newRows])

        setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
        setHasMore(snap.docs.length >= PAGE_SIZE)
      } catch (err) {
        console.error('[social admin] fetch error:', err)
        toast.error('Veriler yüklenemedi')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, statusFilter]
  )

  useEffect(() => {
    setLastDoc(null)
    setRows([])
    void fetchRows(true)
  }, [tab, statusFilter, fetchRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (hideRss && isLikelyExternalRss(r)) return false
      if (categoryFilter && r.categoryId !== categoryFilter && r.category !== categoryFilter) return false
      if (!q) return true
      return (
        r.title?.toLowerCase().includes(q) ||
        r.slug?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.citySlug?.toLowerCase().includes(q) ||
        r.categoryId?.toLowerCase().includes(q)
      )
    })
  }, [rows, search, hideRss, categoryFilter])

  // ── Open composer ──────────────────────────────────────────────────────────
  const openComposer = (row: SocialNewsRow) => {
    setSelectedId(row.id)
    const catId = (row.categoryId || row.category || '').trim().toLowerCase()
    const rule = catId && categoryRules.categories[catId]
      ? categoryRules.categories[catId]
      : categoryRules.default
    const mode = composerModeFromRule(rule, tab) as ComposerShareMode
    setShareMode(mode)
    setHeadline(row.socialHeadline || row.title || '')
    const spot = row.spot || row.summary || row.description || ''
    setCaption(row.socialCaption || (spot ? `📰 ${spot}` : `📰 ${row.title || ''}`))
    setStorySummary(row.socialStorySummary || spot || '')
    setHashtagsRaw(
      (row.socialHashtags?.length
        ? row.socialHashtags
        : ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye']
      ).join(' ')
    )
    const plat = rule.platforms
    setPlatforms({
      facebook: plat?.facebook !== false,
      instagram: plat?.instagram !== false,
      twitter: plat?.twitter === true,
    })
    const already = isShared(row, tab)
    setForceReshare(already)
    setLastResult(null)
    setPreviewTick((n) => n + 1)
  }

  const closeComposer = () => {
    setSelectedId(null)
    setLastResult(null)
  }

  // Sekme değişince: seçili haberin kategori varsayılanını yeniden uygula
  useEffect(() => {
    if (!selectedId) return
    const row = rows.find((r) => r.id === selectedId)
    if (!row) {
      setShareMode(tab)
      return
    }
    const catId = (row.categoryId || row.category || '').trim().toLowerCase()
    const rule = catId && categoryRules.categories[catId]
      ? categoryRules.categories[catId]
      : categoryRules.default
    setShareMode(composerModeFromRule(rule, tab))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca sekme değişiminde
  }, [tab, selectedId])

  const loadCategoryRules = useCallback(async () => {
    if (!user) return
    setLoadingCategoryRules(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/category-rules', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Yüklenemedi')
      const data = await res.json() as {
        categories?: Record<string, SocialCategoryRule>
        default?: SocialCategoryRule
      }
      const doc: SocialCategoryRulesDoc = {
        categories: data.categories ?? {},
        default: normalizeCategoryRule(data.default, FALLBACK_CATEGORY_RULE),
      }
      setCategoryRules(doc)
      const draft: Record<string, SocialCategoryRule> = {}
      for (const c of MAIN_CATEGORIES) {
        draft[c.id] = normalizeCategoryRule(doc.categories[c.id], doc.default)
      }
      for (const [id, rule] of Object.entries(doc.categories)) {
        if (!draft[id]) draft[id] = normalizeCategoryRule(rule, doc.default)
      }
      setCategoryRulesDraft(draft)
      setDefaultRuleDraft(doc.default)
    } catch (err) {
      console.error('[social admin] category rules:', err)
      toast.error('Kategori kuralları yüklenemedi')
    } finally {
      setLoadingCategoryRules(false)
    }
  }, [user])

  useEffect(() => {
    void loadCategoryRules()
  }, [loadCategoryRules])

  const saveCategoryRules = async () => {
    if (!user || savingCategoryRules) return
    setSavingCategoryRules(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/category-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          default: defaultRuleDraft,
          categories: categoryRulesDraft,
        }),
      })
      const data = await res.json() as {
        ok?: boolean
        message?: string
        error?: string
        categories?: Record<string, SocialCategoryRule>
        default?: SocialCategoryRule
      }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Kayıt başarısız')
        return
      }
      setCategoryRules({
        categories: data.categories ?? categoryRulesDraft,
        default: data.default ?? defaultRuleDraft,
      })
      toast.success(data.message ?? 'Kategori kuralları kaydedildi')
    } catch (err) {
      console.error(err)
      toast.error('Bağlantı hatası')
    } finally {
      setSavingCategoryRules(false)
    }
  }

  const updateDraftRule = (catId: string, patch: Partial<SocialCategoryRule>) => {
    setCategoryRulesDraft((prev) => ({
      ...prev,
      [catId]: normalizeCategoryRule({ ...prev[catId], ...patch }, defaultRuleDraft),
    }))
  }

  // ── Share ──────────────────────────────────────────────────────────────────
  const shareSelected = async () => {
    if (!user || !selected || sharing) return

    if (!hasImage(selected)) {
      toast.error('Görsel yok — paylaşım için kapak görseli gerekli')
      return
    }
    if (!platforms.facebook && !platforms.instagram && !(shareMode !== 'story' && platforms.twitter)) {
      toast.error('En az bir platform seçin')
      return
    }
    if (!headline.trim()) {
      toast.error('Manşet gerekli')
      return
    }

    const alreadyPost = !!selected.socialPublished
    const alreadyStory = !!selected.storyPublished
    const needsForce =
      (shareMode === 'post' && alreadyPost) ||
      (shareMode === 'story' && alreadyStory) ||
      (shareMode === 'both' && (alreadyPost || alreadyStory))

    if (needsForce && !forceReshare) {
      toast.error('Bu haber zaten paylaşılmış — «Yeniden paylaş»ı açın')
      return
    }

    setSharing(true)
    const toastId = toast.loading(
      shareMode === 'story' ? 'Hikâye paylaşılıyor…' :
      shareMode === 'both' ? 'Post + hikâye paylaşılıyor…' :
      'Feed post paylaşılıyor…'
    )

    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const body: Record<string, unknown> = {
        ids: [selected.id],
        mode: shareMode,
        force: needsForce || forceReshare,
        manual: true,
        headline: headline.trim(),
        hashtags: parseHashtagInput(hashtagsRaw),
        platforms: {
          facebook: platforms.facebook,
          instagram: platforms.instagram,
          twitter: shareMode !== 'story' && platforms.twitter,
        },
      }
      if (shareMode === 'post' || shareMode === 'both') {
        body.caption = caption.trim()
      }
      if (shareMode === 'story' || shareMode === 'both') {
        body.storySummary = storySummary.trim() || caption.trim()
      } else if (shareMode === 'post') {
        // OG görsel özeti — composer önizlemesiyle aynı kaynak
        body.storySummary = storySummary.trim() || caption.trim().slice(0, 320)
      }
      if (shareMode === 'story' && !body.caption) {
        body.caption = storySummary.trim()
      }

      const res = await fetch('/api/admin/social/force-reshare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json() as {
        error?: string
        results?: Array<{
          ok: boolean
          reason?: string
          post?: LastShareResult['post']
          story?: LastShareResult['story']
        }>
      }

      const r0 = data.results?.[0]
      if (!res.ok) {
        const msg = data.error ?? r0?.reason ?? 'Paylaşım başarısız'
        toast.error(msg, { id: toastId })
        setLastResult({ ok: false, message: msg, post: r0?.post, story: r0?.story })
        return
      }

      const parts: string[] = []
      if (r0?.post) {
        parts.push(
          `Post FB:${r0.post.facebook.success ? '✓' : '✗'} IG:${r0.post.instagram.success ? '✓' : '✗'}` +
          (r0.post.twitter ? ` X:${r0.post.twitter.success ? '✓' : '✗'}` : '')
        )
      }
      if (r0?.story) {
        parts.push(`Hikâye FB:${r0.story.facebook.success ? '✓' : '✗'} IG:${r0.story.instagram.success ? '✓' : '✗'}`)
      }
      const msg = parts.join(' · ') || 'Paylaşıldı'
      toast.success(msg, { id: toastId })
      setLastResult({ ok: true, message: msg, post: r0?.post, story: r0?.story })

      setRows((prev) => prev.map((r) => {
        if (r.id !== selected.id) return r
        const next = { ...r, socialHeadline: headline.trim(), socialCaption: caption.trim(), socialStorySummary: storySummary.trim(), socialHashtags: parseHashtagInput(hashtagsRaw) }
        if (shareMode === 'post' || shareMode === 'both') {
          next.socialPublished = true
          next.socialPublishedAt = Date.now()
        }
        if (shareMode === 'story' || shareMode === 'both') {
          next.storyPublished = true
          next.storyPublishedAt = Date.now()
        }
        return next
      }))
      setForceReshare(true)
      setPreviewTick((n) => n + 1)
    } catch (err) {
      console.error('[social admin] share error:', err)
      toast.error('Bağlantı hatası', { id: toastId })
      setLastResult({ ok: false, message: 'Bağlantı hatası' })
    } finally {
      setSharing(false)
    }
  }

  // ── Cron / Token / Diagnose ────────────────────────────────────────────────
  const triggerCron = async () => {
    if (!user || triggeringCron) return
    setTriggeringCron(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/cron/social', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as {
        processed?: number
        succeeded?: number
        failed?: number
        error?: string
      }
      if (res.ok) {
        toast.success(
          `Cron çalıştı — ${data.processed ?? 0} haber işlendi, ${data.succeeded ?? 0} paylaşıldı`
        )
        setLastDoc(null)
        await fetchRows(true)
      } else {
        toast.error(data.error ?? 'Cron hatası')
      }
    } catch (err) {
      console.error('[social admin] cron trigger error:', err)
      toast.error('Cron çalıştırılamadı')
    } finally {
      setTriggeringCron(false)
    }
  }

  const saveToken = async () => {
    if (!user || savingToken || !newFbToken.trim()) return
    setSavingToken(true)
    setTokenResult(null)
    try {
      const idToken = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ facebookPageToken: newFbToken.trim(), instagramToken: newIgToken.trim() || undefined }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; permissions?: string[]; note?: string; error?: string }
      if (res.ok && data.ok) {
        setTokenResult({ ok: true, message: data.message ?? 'Token kaydedildi', permissions: data.permissions, note: data.note })
        setNewFbToken('')
        setNewIgToken('')
        toast.success('Token başarıyla güncellendi!')
      } else {
        setTokenResult({ ok: false, message: data.error ?? 'Hata oluştu' })
        toast.error(data.error ?? 'Token kaydedilemedi')
      }
    } catch (err) {
      toast.error('Bağlantı hatası')
      console.error(err)
    } finally {
      setSavingToken(false)
    }
  }

  const runDiagnose = async () => {
    if (!user || diagnosing) return
    setDiagnosing(true)
    setDiagResult(null)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/diagnose', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as typeof diagResult
      setDiagResult(data)
    } catch (err) {
      toast.error('Teşhis başarısız')
      console.error(err)
    } finally {
      setDiagnosing(false)
    }
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url.startsWith('http') ? url : `https://www.nahaber.com${url}`)
      toast.success('URL kopyalandı')
    } catch {
      toast.error('Kopyalanamadı')
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const publishedCount = filteredRows.filter((r) => isShared(r, tab)).length
  const pendingCount = filteredRows.filter((r) => !isShared(r, tab)).length

  const previewMode = shareMode === 'story' ? 'story' : 'social'
  const ogPreviewSrc = selected
    ? `/api/og/${previewMode}/${selected.id}?title=${encodeURIComponent(deferredHeadline)}&spot=${encodeURIComponent(deferredSpot)}&v=${previewTick}`
    : ''

  const composerBlocked = selected && !hasImage(selected)
    ? 'Görsel yok — paylaşım için kapak görseli gerekli'
    : null

  return (
    <div className="min-h-screen bg-[rgb(var(--color-bg))]">
      <CMSHeader title="Sosyal Medya" />

      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 lg:px-6">

        {/* Tabs + stats */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {([
              { key: 'post' as const, label: 'Post', icon: Newspaper, hint: 'FB / IG / X' },
              { key: 'story' as const, label: 'Hikâye', icon: BookImage, hint: 'FB / IG story' },
            ]).map(({ key, label, icon: Icon, hint }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setStatusFilter('all'); setSearch('') }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition-colors',
                  tab === key
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'text-[rgb(var(--color-muted))] hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span className={cn('hidden text-[10px] font-medium sm:inline', tab === key ? 'text-white/70' : '')}>
                  {hint}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded bg-white/5 px-2.5 py-1 text-[rgb(var(--color-muted))]">
              Listelenen <strong className="text-white">{filteredRows.length}</strong>
            </span>
            <span className="rounded bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
              Paylaşıldı <strong>{publishedCount}</strong>
            </span>
            <span className="rounded bg-amber-500/10 px-2.5 py-1 text-amber-400">
              Paylaşılmadı <strong>{pendingCount}</strong>
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'all' as const, label: 'Tümü' },
              { key: 'pending' as const, label: 'Paylaşılmadı' },
              { key: 'published' as const, label: 'Paylaşıldı' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-semibold transition-colors',
                  statusFilter === key
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-[rgb(var(--color-muted))] hover:bg-white/10 hover:text-white'
                )}
              >
                {label}
              </button>
            ))}

            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Başlık / slug ara…"
                className="w-40 rounded border border-white/10 bg-white/5 py-1.5 pl-7 pr-2 text-xs text-white placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-brand))] sm:w-52"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="">Tüm kategoriler</option>
              {MAIN_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setHideRss((p) => !p)}
              className={cn(
                'inline-flex items-center gap-1 rounded border px-2 py-1.5 text-xs font-semibold',
                hideRss
                  ? 'border-white/20 bg-white/10 text-white'
                  : 'border-white/10 bg-transparent text-[rgb(var(--color-muted))]'
              )}
              title="Harici RSS haberlerini gizle"
            >
              <EyeOff className="h-3 w-3" />
              RSS gizle
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setLastDoc(null); void fetchRows(true) }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Yenile
            </button>
            <button
              onClick={() => setShowTools((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
            >
              Araçlar
            </button>
          </div>
        </div>

        {showTools && (
          <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <button
              onClick={() => { setShowTokenPanel((p) => !p); setTokenResult(null) }}
              className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
            >
              <KeyRound className="h-3 w-3" />
              Token Güncelle
            </button>
            <button
              onClick={() => void runDiagnose()}
              disabled={diagnosing}
              className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
            >
              {diagnosing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Stethoscope className="h-3 w-3" />}
              Teşhis
            </button>
            <button
              onClick={() => void triggerCron()}
              disabled={triggeringCron}
              className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
            >
              {triggeringCron ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Cron Çalıştır
            </button>
            <button
              onClick={() => {
                setShowCategoryRules((p) => !p)
                if (!showCategoryRules) void loadCategoryRules()
              }}
              className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
            >
              <Layers className="h-3 w-3" />
              Kategori ayarları
            </button>
            <p className="w-full text-[11px] text-[rgb(var(--color-muted))]">
              Habere tıklayın → sağdaki composer’da manşet, özet, platform ve mod seçin → Paylaş.
              Kategori varsayılanları composer modunu ön-seçer; cron auto bayraklarına uyar.
            </p>
          </div>
        )}

        {showCategoryRules && (
          <div className="rounded-lg border border-white/15 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">Kategori sosyal ayarları</h3>
                <p className="mt-0.5 text-[11px] text-[rgb(var(--color-muted))]">
                  Varsayılan paylaşım modu (composer) + otomatik cron bayrakları. Firestore:{' '}
                  <code className="text-slate-300">config/socialCategoryRules</code>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadCategoryRules()}
                  disabled={loadingCategoryRules}
                  className="rounded bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {loadingCategoryRules ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <RefreshCw className="inline h-3 w-3" />} Yenile
                </button>
                <button
                  type="button"
                  onClick={() => void saveCategoryRules()}
                  disabled={savingCategoryRules}
                  className="rounded bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingCategoryRules ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null} Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryRules(false)}
                  className="text-xs text-[rgb(var(--color-muted))] hover:text-white"
                >
                  Kapat
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-white/10 bg-black/20 px-3 py-2 text-xs">
              <span className="font-semibold text-white">Varsayılan (diğer kategoriler)</span>
              <select
                value={defaultRuleDraft.defaultMode}
                onChange={(e) =>
                  setDefaultRuleDraft((p) => ({
                    ...p,
                    defaultMode: e.target.value as SocialCategoryMode,
                  }))
                }
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
              >
                <option value="post">Post</option>
                <option value="story">Hikâye</option>
                <option value="both">İkisi</option>
                <option value="none">Yok</option>
              </select>
              <label className="inline-flex items-center gap-1.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={defaultRuleDraft.autoPost !== false}
                  onChange={(e) =>
                    setDefaultRuleDraft((p) => ({ ...p, autoPost: e.target.checked }))
                  }
                />
                Auto post
              </label>
              <label className="inline-flex items-center gap-1.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={defaultRuleDraft.autoStory === true}
                  onChange={(e) =>
                    setDefaultRuleDraft((p) => ({ ...p, autoStory: e.target.checked }))
                  }
                />
                Auto hikâye
              </label>
            </div>

            <div className="max-h-72 overflow-auto rounded border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Kategori</th>
                    <th className="px-3 py-2 font-semibold">Varsayılan mod</th>
                    <th className="px-3 py-2 font-semibold">Auto post</th>
                    <th className="px-3 py-2 font-semibold">Auto hikâye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {MAIN_CATEGORIES.map((c) => {
                    const rule = categoryRulesDraft[c.id] ?? defaultRuleDraft
                    return (
                      <tr key={c.id} className="hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <span className="font-medium text-white">{c.name}</span>
                          <span className="ml-1.5 text-[10px] text-slate-500">{c.id}</span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={rule.defaultMode}
                            onChange={(e) =>
                              updateDraftRule(c.id, {
                                defaultMode: e.target.value as SocialCategoryMode,
                              })
                            }
                            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
                          >
                            <option value="post">Post</option>
                            <option value="story">Hikâye</option>
                            <option value="both">İkisi</option>
                            <option value="none">Yok</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={rule.autoPost !== false}
                            onChange={(e) => updateDraftRule(c.id, { autoPost: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={rule.autoStory === true}
                            onChange={(e) => updateDraftRule(c.id, { autoStory: e.target.checked })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showTokenPanel && (
          <div className="rounded-lg border border-white/15 bg-white/5 p-4">
            <h3 className="mb-1 text-sm font-bold text-white">Facebook / Instagram Token</h3>
            <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">
              Graph API Explorer&apos;dan Page Token alın; eksik izinlerde paylaşım başarısız olur.
            </p>
            <div className="space-y-2">
              <textarea
                value={newFbToken}
                onChange={(e) => setNewFbToken(e.target.value)}
                rows={2}
                placeholder="Facebook Page Access Token *"
                className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white focus:outline-none"
              />
              <textarea
                value={newIgToken}
                onChange={(e) => setNewIgToken(e.target.value)}
                rows={2}
                placeholder="Instagram Access Token (opsiyonel)"
                className="w-full rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white focus:outline-none"
              />
              {tokenResult && (
                <p className={cn('text-xs', tokenResult.ok ? 'text-emerald-400' : 'text-red-400')}>
                  {tokenResult.message}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => void saveToken()}
                  disabled={savingToken || !newFbToken.trim()}
                  className="rounded bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingToken ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null} Doğrula & Kaydet
                </button>
                <button onClick={() => setShowTokenPanel(false)} className="text-xs text-[rgb(var(--color-muted))] hover:text-white">
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {diagResult && (
          <div className={cn(
            'rounded-lg border p-3 text-sm',
            diagResult.steps.some((s) => !s.ok)
              ? 'border-red-500/30 bg-red-950/20'
              : 'border-emerald-500/30 bg-emerald-950/20'
          )}>
            <p className="mb-2 font-bold text-white">{diagResult.summary}</p>
            {diagResult.steps.map((step, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className={step.ok ? 'text-emerald-400' : 'text-red-400'}>{step.ok ? '✓' : '✗'}</span>
                <span className="font-semibold text-white">{step.name}:</span>
                <span className="text-[rgb(var(--color-muted))]">{step.detail}</span>
              </div>
            ))}
            <button onClick={() => setDiagResult(null)} className="mt-2 text-xs text-[rgb(var(--color-muted))] hover:text-white">Kapat</button>
          </div>
        )}

        {/* Main split layout */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
          {/* News list */}
          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="divide-y divide-white/5">
              {loading && (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
                </div>
              )}

              {!loading && filteredRows.length === 0 && (
                <div className="py-16 text-center text-[rgb(var(--color-muted))]">
                  <Share2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">Haber bulunamadı</p>
                </div>
              )}

              {!loading && filteredRows.map((row) => {
                const img = getBestImage(row)
                const shared = isShared(row, tab)
                const external = isLikelyExternalRss(row)
                const noImg = !hasImage(row)
                const active = selectedId === row.id
                const fbOk = tab === 'post' ? !!row.facebookPostId : !!row.facebookStoryId
                const igOk = tab === 'post' ? !!row.instagramMediaId : !!row.instagramStoryId

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openComposer(row)}
                    className={cn(
                      'flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.04]',
                      active && 'bg-[rgb(var(--color-brand))]/10 ring-1 ring-inset ring-[rgb(var(--color-brand))]/40'
                    )}
                  >
                    {img ? (
                      <img src={img} alt="" className="h-14 w-[72px] shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-14 w-[72px] shrink-0 items-center justify-center rounded bg-white/10">
                        <ImageIcon className="h-4 w-4 opacity-30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{row.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {row.categoryId && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{row.categoryId}</span>
                        )}
                        {row.citySlug && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{row.citySlug}</span>
                        )}
                        {external && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300" title="Harici kaynak — manuel paylaşım">
                            RSS
                          </span>
                        )}
                        {noImg && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Görsel yok</span>
                        )}
                        <StatusBadge ok={shared} label={shared ? 'Paylaşıldı' : 'Paylaşılmadı'} />
                        {fbOk && <Facebook className="h-3 w-3 text-emerald-400" />}
                        {igOk && <Instagram className="h-3 w-3 text-emerald-400" />}
                        {tab === 'post' && row.twitterTweetId && (
                          <span className="text-[10px] font-bold text-emerald-400">X</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-[rgb(var(--color-muted))]">
                        {(() => {
                          const d = safeToDate(row.publishedAt ?? row.createdAt)
                          return d ? formatDistanceToNow(d, { addSuffix: true, locale: tr }) : '—'
                        })()}
                        {shared && (() => {
                          const d = safeToDate(tab === 'post' ? row.socialPublishedAt : row.storyPublishedAt)
                          return d ? ` · paylaşıldı ${formatDistanceToNow(d, { addSuffix: true, locale: tr })}` : ''
                        })()}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {hasMore && !loading && (
              <div className="border-t border-white/10 p-3 text-center">
                <button
                  onClick={() => void fetchRows(false)}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded bg-white/10 px-4 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Daha fazla yükle
                </button>
              </div>
            )}
          </div>

          {/* Composer — desktop sticky / mobile drawer */}
          <div
            className={cn(
              'lg:sticky lg:top-4 lg:self-start',
              selected
                ? 'fixed inset-0 z-40 flex flex-col bg-[rgb(var(--color-bg))] lg:static lg:z-auto lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:rounded-lg lg:border lg:border-white/10'
                : 'hidden lg:block lg:rounded-lg lg:border lg:border-white/10 lg:bg-white/[0.02]'
            )}
          >
            {!selected ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <Layers className="mb-3 h-10 w-10 text-white/20" />
                <p className="text-sm font-semibold text-white">Paylaşım editörü</p>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                  Soldan bir haber seçin. Manşet, özet, platform ve modu ayarlayıp paylaşın.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Paylaşım</p>
                    <p className="truncate text-sm font-semibold text-white">{selected.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeComposer}
                    className="rounded p-1.5 text-[rgb(var(--color-muted))] hover:bg-white/10 hover:text-white"
                    aria-label="Kapat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {isLikelyExternalRss(selected) && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                      Harici kaynak — manuel paylaşım. Otomatik cron bu haberi paylaşmaz.
                    </div>
                  )}

                  {/* Live OG preview */}
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
                    <div className="flex items-center justify-between border-b border-white/10 px-2 py-1.5">
                      <span className="text-[10px] font-semibold uppercase text-[rgb(var(--color-muted))]">
                        {previewMode === 'story' ? 'Hikâye önizleme' : 'Post önizleme'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewTick((n) => n + 1)}
                        className="text-[10px] text-[rgb(var(--color-muted))] hover:text-white"
                      >
                        Yenile
                      </button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={ogPreviewSrc}
                      src={ogPreviewSrc}
                      alt="OG önizleme"
                      className={cn(
                        'w-full bg-slate-900 object-contain',
                        previewMode === 'story' ? 'max-h-[360px]' : 'aspect-square max-h-[320px]'
                      )}
                    />
                  </div>

                  {/* Mode */}
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      Mod
                    </label>
                    <div className="flex gap-1 rounded-lg bg-white/5 p-1">
                      {([
                        { key: 'post' as const, label: 'Post' },
                        { key: 'story' as const, label: 'Hikâye' },
                        { key: 'both' as const, label: 'İkisi' },
                      ]).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setShareMode(key)}
                          className={cn(
                            'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
                            shareMode === key
                              ? 'bg-[rgb(var(--color-brand))] text-white'
                              : 'text-[rgb(var(--color-muted))] hover:text-white'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Platforms */}
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      Platformlar
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <PlatformToggle
                        active={platforms.facebook}
                        onChange={(v) => setPlatforms((p) => ({ ...p, facebook: v }))}
                        label="Facebook"
                      >
                        <Facebook className="h-3.5 w-3.5" />
                      </PlatformToggle>
                      <PlatformToggle
                        active={platforms.instagram}
                        onChange={(v) => setPlatforms((p) => ({ ...p, instagram: v }))}
                        label="Instagram"
                      >
                        <Instagram className="h-3.5 w-3.5" />
                      </PlatformToggle>
                      {shareMode !== 'story' && (
                        <PlatformToggle
                          active={platforms.twitter}
                          onChange={(v) => setPlatforms((p) => ({ ...p, twitter: v }))}
                          label="X"
                        >
                          <span className="text-[11px] font-black leading-none">𝕏</span>
                        </PlatformToggle>
                      )}
                    </div>
                  </div>

                  {/* Headline */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      Manşet
                    </label>
                    <textarea
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      rows={2}
                      className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-brand))]"
                      placeholder="Sosyal medya manşeti…"
                    />
                    <p className="mt-0.5 text-right text-[10px] text-[rgb(var(--color-muted))]">{headline.length} karakter</p>
                  </div>

                  {/* Caption / story summary */}
                  {(shareMode === 'post' || shareMode === 'both') && (
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                        Özet / Caption
                      </label>
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        rows={5}
                        className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-brand))]"
                        placeholder="FB / IG / X gönderi metni (URL ve hashtag sistem ekler)…"
                      />
                      <p className="mt-0.5 text-right text-[10px] text-[rgb(var(--color-muted))]">{caption.length} karakter</p>
                    </div>
                  )}

                  {(shareMode === 'story' || shareMode === 'both') && (
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                        Hikâye özeti
                      </label>
                      <textarea
                        value={storySummary}
                        onChange={(e) => setStorySummary(e.target.value)}
                        rows={3}
                        className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-brand))]"
                        placeholder="Hikâye görselindeki özet metin…"
                      />
                      <p className="mt-0.5 text-right text-[10px] text-[rgb(var(--color-muted))]">{storySummary.length} karakter</p>
                    </div>
                  )}

                  {/* Hashtags */}
                  {(shareMode === 'post' || shareMode === 'both') && (
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                        <Tag className="h-3 w-3" /> Hashtagler
                      </label>
                      <input
                        value={hashtagsRaw}
                        onChange={(e) => setHashtagsRaw(e.target.value)}
                        className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-brand))]"
                        placeholder="#NaHaber #Çanakkale …"
                      />
                    </div>
                  )}

                  {/* Article URL */}
                  {(() => {
                    const url = articleUrlOf(selected)
                    if (!url) return null
                    const full = url.startsWith('http') ? url : `https://www.nahaber.com${url}`
                    return (
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                          Haber URL
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            readOnly
                            value={full}
                            className="min-w-0 flex-1 truncate rounded border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-[10px] text-slate-300"
                          />
                          <button
                            type="button"
                            onClick={() => void copyUrl(full)}
                            className="rounded border border-white/10 p-1.5 text-[rgb(var(--color-muted))] hover:text-white"
                            title="Kopyala"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={full}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border border-white/10 p-1.5 text-[rgb(var(--color-muted))] hover:text-white"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Force + status */}
                  <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge
                        ok={
                          shareMode === 'story'
                            ? !!selected.storyPublished
                            : shareMode === 'both'
                              ? !!(selected.socialPublished && selected.storyPublished)
                              : !!selected.socialPublished
                        }
                        label={
                          shareMode === 'story'
                            ? (selected.storyPublished ? 'Hikâye paylaşıldı' : 'Paylaşılmadı')
                            : shareMode === 'both'
                              ? (selected.socialPublished && selected.storyPublished
                                ? 'Post + hikâye paylaşıldı'
                                : selected.socialPublished
                                  ? 'Post paylaşıldı'
                                  : selected.storyPublished
                                    ? 'Hikâye paylaşıldı'
                                    : 'Paylaşılmadı')
                              : (selected.socialPublished ? 'Post paylaşıldı' : 'Paylaşılmadı')
                        }
                      />
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[rgb(var(--color-muted))]">
                        <input
                          type="checkbox"
                          checked={forceReshare}
                          onChange={(e) => setForceReshare(e.target.checked)}
                          className="rounded border-white/20"
                        />
                        Yeniden paylaş
                      </label>
                    </div>
                    {lastResult && (
                      <div className={cn(
                        'rounded px-2 py-1.5 text-[11px]',
                        lastResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                      )}>
                        {lastResult.message}
                      </div>
                    )}
                  </div>
                </div>

                {/* CTA */}
                <div className="border-t border-white/10 p-4">
                  {composerBlocked ? (
                    <div className="rounded bg-white/5 py-2.5 text-center text-xs font-semibold text-amber-400">
                      {composerBlocked}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void shareSelected()}
                      disabled={sharing}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--color-brand))] py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                      Paylaş
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-[rgb(var(--color-muted))]">
          Manuel paylaşımda RSS serbest · Görselsiz haber paylaşılamaz · Yeniden paylaş için onay kutusu gerekir
        </p>
      </div>
    </div>
  )
}
