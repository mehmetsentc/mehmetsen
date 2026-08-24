'use client'

import { auth } from '@/lib/firebase/auth'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import {
  Clock, Play, CheckCircle2, XCircle, Loader2, AlertTriangle, Activity, Timer, RefreshCw,
  Search, List, ChevronLeft, ChevronRight, Trash2, Zap, Pencil, Copy,
} from 'lucide-react'
import { QueueItemEditor } from '@/components/admin/QueueItemEditor'
import { CrawlerCronPanel } from '@/components/admin/crawler/CrawlerCronPanel'
import { cn } from '@/lib/utils'
import { parseApiResponse } from '@/lib/parseApiResponse'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'

interface CronRun {
  id: string
  jobName: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  startedAt: number | string
  finishedAt?: number | string | null
  durationMs?: number | null
  itemsProcessed?: number | null
  error?: string | null
  triggeredBy?: 'schedule' | 'manual' | string
}

interface PendingQueueItem {
  id: string
  title: string
  source: string
  workerId: string
  category: string | null
  createdAt: number
  attempts: number
  queueDuplicateSuspect?: boolean
  queueDuplicateRole?: string | null
  queueDuplicateOf?: string | null
  queueDuplicateSimilarity?: number | null
  qualityScore?: number | null
  peerQualityScore?: number | null
}

const PAGE_SIZE = 100
type CronTab = 'queue' | 'jobs'

const JOBS = [
  { id: 'news-fetch', label: 'Haber Çekme', desc: 'Breaking + gündem RSS → kuyruk işle', schedule: 'Manuel / 15 dk', icon: '📰' },
  { id: 'process-queue', label: 'Kuyruk İşle', desc: 'Bekleyen haberleri AI ile yazıp yayınla', schedule: 'Her 2 dk + ingest sonrası', icon: '⚙️' },
  { id: 'draft-reprocess', label: 'Taslak AI Yeniden', desc: 'Onay kuyruğundaki taslakları yeniden yaz/yayınla', schedule: 'Her 10 dk', icon: '✍️' },
  { id: 'breaking', label: 'Son Dakika RSS', desc: 'Breaking kaynaklarını çeker', schedule: 'Her 15 dk', icon: '⚡' },
  { id: 'gundem', label: 'Gündem RSS', desc: 'Ulusal gündem kaynakları', schedule: 'Her 20 dk', icon: '🗞️' },
  { id: 'local', label: 'Yerel RSS', desc: 'Yerel haber kaynakları', schedule: 'Saatte 1', icon: '📍' },
  { id: 'ai-rewrite', label: 'AI Yeniden Yazma', desc: 'Kuyruktaki bekleyenleri işle', schedule: 'Her 5 dk', icon: '🤖' },
  { id: 'trending-update', label: 'Trend Güncelleme', desc: 'Trend haber skorları', schedule: 'Cron', icon: '📈' },
  { id: 'seo-generate', label: 'SEO Üretimi', desc: 'SEO eksik haberlere meta', schedule: 'Cron', icon: '🔍' },
  { id: 'video-sync', label: 'Video Senkron', desc: 'Video kuyruğu', schedule: 'Cron', icon: '🎬' },
  { id: 'cleanup', label: 'Breaking Expire', desc: 'Eski breaking bayraklarını temizle', schedule: 'Cron', icon: '🗑️' },
  { id: 'magazine', label: 'Magazin RSS', desc: 'Magazin kaynakları (Gecce, Milliyet, Sabah vb.)', schedule: 'Her 30 dk', icon: '🎭' },
  { id: 'sports', label: 'Spor RSS', desc: 'Spor kaynakları', schedule: 'Her 30 dk', icon: '⚽' },
  { id: 'world', label: 'Dünya RSS', desc: 'Dünya haberleri', schedule: 'Her 30 dk', icon: '🌍' },
  { id: 'technology', label: 'Teknoloji RSS', desc: 'Teknoloji kaynakları', schedule: 'Her 30 dk', icon: '💻' },
  { id: 'finans', label: 'Finans RSS', desc: 'Finans kaynakları', schedule: 'Her 30 dk', icon: '📊' },
  { id: 'health', label: 'Sağlık RSS', desc: 'Sağlık kaynakları', schedule: 'Her 30 dk', icon: '🏥' },
  { id: 'politics', label: 'Politika RSS', desc: 'Politika kaynakları', schedule: 'Her 30 dk', icon: '🏛️' },
  { id: 'national', label: 'Ulusal RSS', desc: 'Ulusal kaynaklar', schedule: 'Her 30 dk', icon: '🇹🇷' },
  { id: 'kibris', label: 'Kıbrıs RSS', desc: 'Kıbrıs haberleri', schedule: 'Her 30 dk', icon: '🏝️' },
  { id: 'freenews', label: 'Freenews RSS', desc: 'Freenews kaynağı', schedule: 'Her 30 dk', icon: '📡' },
  { id: 'canakkale-nobetci-eczane', label: 'Nöbetçi Eczane (Çanakkale)', desc: 'Çanakkale Eczacı Odası günlük nöbetçi eczane listesi', schedule: 'Her gün 10:00', icon: '💊' },
  { id: 'antalya-nobetci-eczane', label: 'Nöbetçi Eczane (Antalya)', desc: 'Antalya Eczacı Odası günlük nöbetçi eczane listesi', schedule: 'Her gün 09:30', icon: '💊' },
]

const STATUS_CONFIG = {
  running: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: Loader2, label: 'Çalışıyor', spin: true },
  success: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle2, label: 'Başarılı', spin: false },
  failed: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: XCircle, label: 'Hata', spin: false },
  skipped: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: AlertTriangle, label: 'Atlandı', spin: false },
}

function toMs(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : null
}

function queueSourceLabel(item: PendingQueueItem): string {
  const label = item.source?.trim()
  return label || 'Kaynaksız'
}

export default function CronMonitorPage() {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [queuePending, setQueuePending] = useState<number | null>(null)
  const [pendingItems, setPendingItems] = useState<PendingQueueItem[]>([])
  const [tab, setTab] = useState<CronTab>('queue')
  const [pendingPage, setPendingPage] = useState(0)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [flushing, setFlushing] = useState(false)
  const [fastProcessing, setFastProcessing] = useState(false)
  const [purgingHours, setPurgingHours] = useState<number | null>(null)
  const [purgingDuplicates, setPurgingDuplicates] = useState(false)
  const [dupFilterOnly, setDupFilterOnly] = useState(false)
  const [selectedQueueSource, setSelectedQueueSource] = useState<string | null>(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [sourceCounts, setSourceCounts] = useState<Array<{ label: string; count: number }>>([])
  const [pendingFilteredCount, setPendingFilteredCount] = useState<number | null>(null)
  const [dupCount, setDupCount] = useState(0)
  const [publishingItemId, setPublishingItemId] = useState<string | null>(null)
  const [publishingSource, setPublishingSource] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const pauseAutoRefresh = editingItemId !== null || editorBusy

  const load = useCallback(async (withPendingDetails = tab === 'queue') => {
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      if (!token) {
        setLoading(false)
        return
      }
      if (withPendingDetails) setPendingLoading(true)
      const params = new URLSearchParams()
      if (withPendingDetails) {
        params.set('pendingDetails', '1')
        params.set('pendingLimit', String(PAGE_SIZE))
        params.set('pendingOffset', String(pendingPage * PAGE_SIZE))
        if (selectedQueueSource) params.set('pendingSource', selectedQueueSource)
        if (dupFilterOnly) params.set('pendingDupOnly', '1')
      }
      const qs = params.toString()
      const res = await fetch(`/api/admin/cron/runs${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await parseApiResponse<{
        runs?: CronRun[]
        queuePending?: number
        pendingItems?: PendingQueueItem[]
        pendingError?: string
        sourceCounts?: Array<{ label: string; count: number }>
        pendingFilteredCount?: number
        dupCount?: number
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRuns(data.runs ?? [])
      setQueuePending(typeof data.queuePending === 'number' ? data.queuePending : null)
      if (data.pendingItems) {
        setPendingItems(data.pendingItems)
      }
      if (data.sourceCounts) setSourceCounts(data.sourceCounts)
      if (typeof data.pendingFilteredCount === 'number') {
        setPendingFilteredCount(data.pendingFilteredCount)
      }
      if (typeof data.dupCount === 'number') setDupCount(data.dupCount)
      if (data.pendingError) {
        toast.error(`Kuyruk listesi: ${data.pendingError}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cron kayıtları yüklenemedi')
    } finally {
      setLoading(false)
      setPendingLoading(false)
    }
  }, [tab, pendingPage, selectedQueueSource, dupFilterOnly])

  useEffect(() => {
    if (pauseAutoRefresh) return
    void load(tab === 'queue')
    const t = setInterval(() => void load(tab === 'queue'), 20_000)
    return () => clearInterval(t)
  }, [load, tab, pauseAutoRefresh])

  useEffect(() => {
    if (pendingFilteredCount == null) return
    const maxPage = Math.max(0, Math.ceil(pendingFilteredCount / PAGE_SIZE) - 1)
    if (pendingPage > maxPage) setPendingPage(maxPage)
  }, [pendingFilteredCount, pendingPage])

  const closeQueueEditor = useCallback(() => {
    setEditingItemId(null)
    setEditorBusy(false)
  }, [])

  const handleEditorSaved = useCallback((data: { title?: string; source?: string; categoryId?: string }) => {
    setPendingItems((prev) =>
      prev.map((item) =>
        item.id === editingItemId
          ? {
              ...item,
              title: data.title || item.title,
              source: data.source || item.source,
              category: data.categoryId || item.category,
            }
          : item
      )
    )
  }, [editingItemId])

  const handleEditorPublished = useCallback(() => {
    const id = editingItemId
    if (!id) return
    const publishedItem = pendingItems.find((i) => i.id === id)
    const publishedSource = publishedItem ? queueSourceLabel(publishedItem) : null
    setPendingItems((prev) => prev.filter((i) => i.id !== id))
    setQueuePending((prev) => (prev != null ? prev - 1 : prev))
    setPendingFilteredCount((prev) => (prev != null ? Math.max(0, prev - 1) : prev))
    if (publishedSource) {
      setSourceCounts((prev) =>
        prev
          .map((chip) => (chip.label === publishedSource ? { ...chip, count: chip.count - 1 } : chip))
          .filter((chip) => chip.count > 0)
      )
    }
    setEditingItemId(null)
    setEditorBusy(false)
    void load(tab === 'queue')
  }, [editingItemId, load, pendingItems, tab])

  const goToPendingPage = useCallback((page: number) => {
    setPendingPage(Math.max(0, page))
    setPendingLoading(true)
  }, [])

  const selectQueueSource = useCallback((label: string | null) => {
    setSelectedQueueSource(label)
    setPendingPage(0)
    setPendingLoading(true)
  }, [])

  const cleanupStuck = async () => {
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/cron/runs?cleanupStuck=1', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await parseApiResponse<{ cleaned?: number; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Temizlik başarısız')
      toast.success(`${data.cleaned ?? 0} takılı çalışma temizlendi`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Temizlik hatası')
    }
  }

  const flushAllPending = async () => {
    if (flushing) return
    const ok = window.confirm(
      'En yeni haberler şimdi kaynaklardan çekilecek, AI ile yazılıp yayına alınacak.\n\nEski kuyruk (bekleyen yüzlerce haber) boşaltılmaz — yalnızca taze haberler yayınlanır.\n\nDevam?'
    )
    if (!ok) return
    setFlushing(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/newsroom/flush-pending', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approveDrafts: true,
          maxRounds: 8,
        }),
      })
      const data = await parseApiResponse<{ ok?: boolean; message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(data.message || 'En yeni haberler yayınlandı')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplu işlem başarısız')
    } finally {
      setFlushing(false)
    }
  }

  const fastProcessQueue = async () => {
    if (fastProcessing) return
    setFastProcessing(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/newsroom/process-now', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 80, maxRounds: 5, skipFreshness: true }),
      })
      const data = await parseApiResponse<{
        ok?: boolean
        message?: string
        error?: string
        hasMore?: boolean
      }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(data.message || 'Kuyruk işlendi')
      if (data.hasMore) toast('Kuyrukta hâlâ bekleyen var, tekrar çalıştırabilirsiniz', { icon: 'ℹ️' })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hızlı işlem başarısız')
    } finally {
      setFastProcessing(false)
    }
  }

  const purgeOlderThan = async (hours: number) => {
    if (purgingHours !== null) return
    const ok = window.confirm(`${hours} saatten eski tüm bekleyen haberler silinecek. Devam?`)
    if (!ok) return
    setPurgingHours(hours)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/queue?purgeOlderThan=${hours}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await parseApiResponse<{ ok?: boolean; deleted?: number; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(`${data.deleted ?? 0} haber silindi (${hours}s+)`)
      await load(tab === 'queue')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme hatası')
    } finally {
      setPurgingHours(null)
    }
  }

  const purgeLowQualityDuplicates = async () => {
    if (purgingDuplicates) return
    const ok = window.confirm(
      'Kuyruktaki benzer haberler taranacak; düşük kaliteli tekrarlar atlanacak/silinecek.\n' +
        'Benzersiz iyi haberler korunur. Devam?'
    )
    if (!ok) return
    setPurgingDuplicates(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/queue?purgeDuplicates=1&hard=1&limit=400', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await parseApiResponse<{
        ok?: boolean
        deleted?: number
        skipped?: number
        flagged?: number
        clusters?: number
        scanned?: number
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(
        `Tarama: ${data.scanned ?? 0} · küme: ${data.clusters ?? 0} · ` +
          `silinen: ${(data.deleted ?? 0) + (data.skipped ?? 0)} · inceleme: ${data.flagged ?? 0}`
      )
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tekrar silme hatası')
    } finally {
      setPurgingDuplicates(false)
    }
  }

  const deleteQueueItem = async (id: string) => {
    if (deletingItemId) return
    const removed = pendingItems.find((i) => i.id === id)
    const sourceLabel = removed ? queueSourceLabel(removed) : null
    setDeletingItemId(id)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/queue?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await parseApiResponse<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setPendingItems((prev) => prev.filter((i) => i.id !== id))
      setQueuePending((prev) => (prev != null ? prev - 1 : prev))
      setPendingFilteredCount((prev) => (prev != null ? Math.max(0, prev - 1) : prev))
      if (sourceLabel) {
        setSourceCounts((prev) =>
          prev
            .map((chip) => (chip.label === sourceLabel ? { ...chip, count: chip.count - 1 } : chip))
            .filter((chip) => chip.count > 0)
        )
      }
      toast.success('Haber kuyruktan silindi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme hatası')
    } finally {
      setDeletingItemId(null)
    }
  }

  const publishQueueItem = async (id: string, opts?: { silent?: boolean }) => {
    if (publishingItemId && !opts?.silent) return false
    if (!opts?.silent) setPublishingItemId(id)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/queue', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process-one', id }),
      })
      const data = await parseApiResponse<{
        ok?: boolean
        published?: number
        drafted?: number
        failed?: number
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (data.published || data.drafted) {
        if (!opts?.silent) {
          toast.success(data.published ? 'Haber yayınlandı!' : 'Haber taslak olarak oluşturuldu — onay kuyruğunda')
        }
        setPendingItems((prev) => prev.filter((i) => i.id !== id))
        setQueuePending((prev) => (prev != null ? prev - 1 : prev))
        setPendingFilteredCount((prev) => (prev != null ? Math.max(0, prev - 1) : prev))
        const publishedItem = pendingItems.find((i) => i.id === id)
        const publishedSource = publishedItem ? queueSourceLabel(publishedItem) : null
        if (publishedSource) {
          setSourceCounts((prev) =>
            prev
              .map((chip) => (chip.label === publishedSource ? { ...chip, count: chip.count - 1 } : chip))
              .filter((chip) => chip.count > 0)
          )
        }
        return data.published ? 'published' : 'drafted'
      }
      if (data.failed) {
        if (!opts?.silent) toast.error('İşlem başarısız — haber kuyruğa geri döndü')
        return 'failed'
      }
      if (!opts?.silent) toast('İşlendi ama sonuç belirsiz', { icon: 'ℹ️' })
      return 'unknown'
    } catch (e) {
      if (!opts?.silent) toast.error(e instanceof Error ? e.message : 'Yayınlama hatası')
      return 'error'
    } finally {
      if (!opts?.silent) {
        setPublishingItemId(null)
        await load(tab === 'queue')
      }
    }
  }

  const publishSelectedSource = async () => {
    if (!selectedQueueSource || publishingSource || publishingItemId) return
    const ids = pendingItems.map((i) => i.id)
    if (ids.length === 0) return
    const ok = window.confirm(
      `"${selectedQueueSource}" kaynağındaki bu sayfadaki ${ids.length} haber sırayla yayınlanacak.\n\nDevam?`
    )
    if (!ok) return
    setPublishingSource(true)
    let published = 0
    let drafted = 0
    let failed = 0
    try {
      for (const id of ids) {
        setPublishingItemId(id)
        const result = await publishQueueItem(id, { silent: true })
        if (result === 'published') published += 1
        else if (result === 'drafted') drafted += 1
        else failed += 1
      }
      toast.success(
        `${selectedQueueSource}: ${published} yayınlandı` +
          (drafted ? `, ${drafted} taslak` : '') +
          (failed ? `, ${failed} başarısız` : '')
      )
      await load(true)
    } finally {
      setPublishingItemId(null)
      setPublishingSource(false)
    }
  }

  const triggerJob = async (jobId: string) => {
    if (triggering) return
    setTriggering(jobId)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/cron/trigger?job=${jobId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await parseApiResponse<{
        success?: boolean
        error?: string
        durationMs?: number
      }>(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(
        data.success
          ? `Tamamlandı (${data.durationMs ?? 0}ms)`
          : `Bitti ama hata var: ${data.error || 'bak log'}`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cron tetiklenemedi')
      await load()
    } finally {
      setTriggering(null)
    }
  }

  const jobRuns = (jobId: string) =>
    runs.filter((r) => r.jobName === jobId || (jobId === 'news-fetch' && ['breaking', 'gundem', 'ingest'].includes(r.jobName)))
  const lastRun = (jobId: string) => jobRuns(jobId)[0]
  const filteredRuns = selectedJob
    ? runs.filter(
        (r) =>
          r.jobName === selectedJob ||
          (selectedJob === 'news-fetch' && ['breaking', 'gundem', 'ingest', 'news-fetch'].includes(r.jobName))
      )
    : runs

  const stats = {
    total: runs.length,
    success: runs.filter((r) => r.status === 'success').length,
    failed: runs.filter((r) => r.status === 'failed').length,
    running: runs.filter((r) => r.status === 'running').length,
  }

  const visiblePendingItems = pendingItems
  const sourceChips = useMemo(() => {
    const q = sourceSearch.trim().toLocaleLowerCase('tr')
    const chips = q
      ? sourceCounts.filter((chip) => chip.label.toLocaleLowerCase('tr').includes(q))
      : sourceCounts
    return chips
  }, [sourceCounts, sourceSearch])

  const listCount = pendingFilteredCount ?? pendingItems.length
  const totalPages = Math.max(1, Math.ceil(listCount / PAGE_SIZE))
  const pageStart = listCount ? pendingPage * PAGE_SIZE + 1 : 0
  const pageEnd = pendingPage * PAGE_SIZE + pendingItems.length
  const runningRuns = useMemo(
    () => runs.filter((r) => r.status === 'running'),
    [runs],
  )

  return (
    <div className="flex min-w-0 flex-col overflow-x-hidden">
      <CMSHeader title="Cron İzleme" subtitle="Zamanlanmış görev monitörü" />
      <div className="min-w-0 space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold sm:w-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
          <button
            type="button"
            onClick={() => void cleanupStuck()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold sm:w-auto"
          >
            Takılıları temizle
          </button>
          <button
            type="button"
            disabled={fastProcessing || triggering != null}
            onClick={() => void fastProcessQueue()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
          >
            {fastProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            Kuyruğu hızlı işle
          </button>
          <button
            type="button"
            disabled={flushing || triggering != null}
            onClick={() => void flushAllPending()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
          >
            {flushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Tek tuş: En yeni haberleri yayınla
          </button>
          {queuePending != null && (
            <span className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 sm:w-auto">
              <List className="h-3 w-3" />
              Kuyruk bekleyen: {queuePending}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {([
            { id: 'queue' as const, label: 'Kuyruk' },
            { id: 'jobs' as const, label: 'Görevler' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-full px-4 py-2 text-xs font-bold transition-colors',
                tab === t.id
                  ? 'bg-[rgb(var(--color-brand))] text-white'
                  : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {t.label}
              {t.id === 'queue' && queuePending != null ? (
                <span className="ml-1.5 opacity-80">{queuePending}</span>
              ) : null}
              {t.id === 'jobs' && stats.running > 0 ? (
                <span className="ml-1.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] text-white">
                  {stats.running}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <CrawlerCronPanel />

        {tab === 'queue' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Toplam Çalışma', value: stats.total, color: 'text-[rgb(var(--color-text))]' },
                { label: 'Başarılı', value: stats.success, color: 'text-emerald-600' },
                { label: 'Hatalı', value: stats.failed, color: 'text-red-600' },
                { label: 'Şu An Çalışan', value: stats.running, color: 'text-blue-600' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                    {s.label}
                  </p>
                  <p className={cn('mt-1 text-2xl font-black tabular-nums', s.color)}>
                    {loading ? '–' : s.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-blue-300 bg-[rgb(var(--color-card))] dark:border-blue-800">
              <div className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-5 py-3 dark:border-blue-900 dark:bg-blue-950/40">
                <Loader2 className={cn('h-4 w-4 text-blue-600', stats.running > 0 && 'animate-spin')} />
                <h2 className="text-sm font-bold text-blue-900 dark:text-blue-100">Şu an çalışan</h2>
                <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                  {stats.running}
                </span>
              </div>
              {runningRuns.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[rgb(var(--color-muted))]">
                  Şu anda çalışan cron yok.
                </p>
              ) : (
                <div className="divide-y divide-[rgb(var(--color-border))]">
                  {runningRuns.map((run) => {
                    const jobLabel = JOBS.find((j) => j.id === run.jobName)?.label ?? run.jobName
                    const started = toMs(run.startedAt)
                    return (
                      <div key={run.id} className="flex items-start gap-3 px-5 py-3">
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[rgb(var(--color-text))]">{jobLabel}</p>
                          <p className="text-[10px] text-[rgb(var(--color-muted))]">
                            {started
                              ? formatDistanceToNow(new Date(started), { locale: tr, addSuffix: true })
                              : 'başladı'}
                            {run.triggeredBy === 'manual' ? ' · manuel' : ''}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          <div className="overflow-hidden rounded-2xl border border-amber-300 bg-[rgb(var(--color-card))] dark:border-amber-700">
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    Kuyrukta bekleyen haberler
                  </h2>
                  {queuePending != null && (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                      {queuePending} adet
                    </span>
                  )}
                  {listCount > 0 ? (
                    <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                      {selectedQueueSource ? `${selectedQueueSource} · ` : ''}
                      {listCount} kayıt · Sayfa {pendingPage + 1}/{totalPages}
                      {pendingItems.length > 0 ? ` · ${pageStart}–${pageEnd}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[6, 12, 24].map((h) => (
                  <button
                    key={h}
                    type="button"
                    disabled={purgingHours !== null || purgingDuplicates}
                    onClick={() => void purgeOlderThan(h)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300"
                  >
                    {purgingHours === h ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-2.5 w-2.5" />
                    )}
                    {h} saat öncesini sil
                  </button>
                ))}
                <button
                  type="button"
                  disabled={purgingDuplicates || purgingHours !== null}
                  onClick={() => void purgeLowQualityDuplicates()}
                  className="inline-flex items-center gap-1 rounded-md border border-orange-400 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-200"
                >
                  {purgingDuplicates ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                  Düşük kaliteli tekrarları sil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDupFilterOnly((v) => !v)
                    setPendingPage(0)
                    setPendingLoading(true)
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-bold',
                    dupFilterOnly
                      ? 'border-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
                      : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]'
                  )}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Tekrarlar{dupCount > 0 ? ` (${dupCount})` : ''}
                </button>
                {selectedQueueSource ? (
                  <button
                    type="button"
                    disabled={
                      publishingSource ||
                      publishingItemId !== null ||
                      visiblePendingItems.length === 0
                    }
                    onClick={() => void publishSelectedSource()}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-400 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                  >
                    {publishingSource ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    )}
                    Bu sayfadakileri onayla ({visiblePendingItems.length})
                  </button>
                ) : null}
              </div>
              {sourceCounts.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
                    <input
                      type="search"
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                      placeholder="Kaynak ara…"
                      className="h-8 w-full rounded-lg border border-amber-200 bg-white pl-8 pr-3 text-[11px] font-medium text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))] focus:border-amber-400 dark:border-amber-800 dark:bg-[rgb(var(--color-card))]"
                    />
                  </div>
                  <p className="text-[10px] font-medium text-amber-800/80 dark:text-amber-200/80">
                    Sayılar tüm kuyruk içindir (yalnızca bu sayfa değil)
                  </p>
                  <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                      <button
                        type="button"
                        onClick={() => selectQueueSource(null)}
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
                          selectedQueueSource == null
                            ? 'bg-amber-600 text-white'
                            : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] ring-1 ring-[rgb(var(--color-border))] hover:bg-amber-100 dark:hover:bg-amber-900/40'
                        )}
                      >
                        Tümü
                        <span className="ml-1 opacity-80">
                          {dupFilterOnly ? dupCount : (queuePending ?? sourceCounts.reduce((n, c) => n + c.count, 0))}
                        </span>
                      </button>
                      {sourceChips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() =>
                            selectQueueSource(selectedQueueSource === chip.label ? null : chip.label)
                          }
                          className={cn(
                            'max-w-[220px] shrink-0 truncate rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
                            selectedQueueSource === chip.label
                              ? 'bg-amber-600 text-white'
                              : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] ring-1 ring-[rgb(var(--color-border))] hover:bg-amber-100 dark:hover:bg-amber-900/40'
                          )}
                          title={`${chip.label} — kuyrukta ${chip.count} haber`}
                        >
                          {chip.label}
                          <span className="ml-1 opacity-80">{chip.count}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className={cn('divide-y divide-[rgb(var(--color-border))]', pendingLoading && pendingItems.length > 0 && 'opacity-60')}>
              {pendingLoading && pendingItems.length === 0 ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-[rgb(var(--color-surface))]" />
                  ))}
                </div>
              ) : visiblePendingItems.length === 0 ? (
                <div className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
                  {dupFilterOnly
                    ? 'İşaretli tekrar yok — önce tarama çalıştırın'
                    : selectedQueueSource
                      ? `"${selectedQueueSource}" kaynağında bekleyen haber yok`
                      : 'Kuyruk temiz — yeni haber gelince AI hemen işler'}
                </div>
              ) : (
                <>
                  <div className="hidden items-center gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))] sm:flex sm:px-5">
                    <div className="min-w-0 flex-1">Haber</div>
                    <div className="w-[7.75rem] shrink-0 text-right">İşlem</div>
                  </div>
                  {visiblePendingItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))] sm:px-5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold leading-snug text-[rgb(var(--color-text))]">
                            {item.title}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[rgb(var(--color-muted))]">
                            {selectedQueueSource == null && item.source ? (
                              <span className="font-medium">{item.source}</span>
                            ) : null}
                            {item.category && (
                              <span className="rounded bg-[rgb(var(--color-surface))] px-1.5 py-0.5 font-medium">
                                {item.category}
                              </span>
                            )}
                            {item.queueDuplicateSuspect && (
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 font-bold',
                                  item.queueDuplicateRole === 'weaker'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : item.queueDuplicateRole === 'keeper'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                      : 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                                )}
                              >
                                {item.queueDuplicateRole === 'weaker'
                                  ? 'Tekrar (zayıf)'
                                  : item.queueDuplicateRole === 'keeper'
                                    ? 'Tekrar (tutulan)'
                                    : 'Tekrar?'}
                                {typeof item.qualityScore === 'number'
                                  ? ` · Q${Math.round(item.qualityScore)}`
                                  : ''}
                              </span>
                            )}
                            {item.createdAt > 0 && (
                              <span className="tabular-nums">
                                {format(new Date(item.createdAt), 'd MMM yyyy HH:mm', { locale: tr })}
                              </span>
                            )}
                            {item.attempts > 0 && (
                              <span className="text-red-500">{item.attempts} deneme</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex w-[7.75rem] shrink-0 items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Düzenle"
                          disabled={
                            editingItemId === item.id ||
                            publishingItemId === item.id ||
                            deletingItemId === item.id
                          }
                          onClick={() => setEditingItemId(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Hemen Yayınla (AI)"
                          disabled={
                            publishingItemId === item.id ||
                            deletingItemId === item.id ||
                            editingItemId === item.id ||
                            publishingSource
                          }
                          onClick={() => void publishQueueItem(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {publishingItemId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Kuyruktan Sil"
                          disabled={
                            deletingItemId === item.id ||
                            publishingItemId === item.id ||
                            editingItemId === item.id
                          }
                          onClick={() => void deleteQueueItem(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingItemId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  {totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 px-5 py-4">
                      <button
                        type="button"
                        disabled={pendingPage <= 0 || pendingLoading}
                        onClick={() => goToPendingPage(pendingPage - 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold hover:bg-[rgb(var(--color-surface))] disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Önceki
                      </button>
                      <span className="text-xs font-bold tabular-nums text-[rgb(var(--color-text))]">
                        {pendingPage + 1} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={pendingPage + 1 >= totalPages || pendingLoading}
                        onClick={() => goToPendingPage(pendingPage + 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold hover:bg-[rgb(var(--color-surface))] disabled:opacity-40"
                      >
                        Sonraki
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          </div>
        )}

        {editingItemId && (
          <QueueItemEditor
            queueId={editingItemId}
            onClose={closeQueueEditor}
            onBusyChange={setEditorBusy}
            onSaved={handleEditorSaved}
            onPublished={handleEditorPublished}
          />
        )}

        {tab === 'jobs' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-1">
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Görevler</h2>
            {JOBS.map((job) => {
              const last = lastRun(job.id)
              const cfg = last ? STATUS_CONFIG[last.status] : null
              const Icon = cfg?.icon ?? Clock
              const finished = toMs(last?.finishedAt)
              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                  className={cn(
                    'cursor-pointer rounded-xl border bg-[rgb(var(--color-card))] p-4 transition-all hover:shadow-md',
                    selectedJob === job.id
                      ? 'border-blue-500 ring-1 ring-blue-500'
                      : 'border-[rgb(var(--color-border))]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{job.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[rgb(var(--color-text))]">{job.label}</p>
                        {cfg && (
                          <span
                            className={cn(
                              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                              cfg.bg,
                              cfg.color
                            )}
                          >
                            <Icon className={cn('h-2.5 w-2.5', cfg.spin && 'animate-spin')} />
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[rgb(var(--color-muted))]">{job.schedule}</p>
                      {finished && (
                        <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
                          Son:{' '}
                          {formatDistanceToNow(new Date(finished), { locale: tr, addSuffix: true })}
                          {last?.durationMs ? ` · ${last.durationMs}ms` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void triggerJob(job.id)
                      }}
                      disabled={triggering === job.id || last?.status === 'running'}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      title="Manuel Tetikle"
                    >
                      {triggering === job.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] xl:col-span-2">
            <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
                  {selectedJob ? JOBS.find((j) => j.id === selectedJob)?.label : 'Tüm'} Çalışmaları
                </h2>
              </div>
              {selectedJob && (
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Tümünü Göster
                </button>
              )}
            </div>
            <div className="max-h-[600px] divide-y divide-[rgb(var(--color-border))] overflow-y-auto">
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />
                  ))}
                </div>
              ) : filteredRuns.length === 0 ? (
                <div className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">
                  Henüz kayıt yok. Cronları tetiklemek için ▶ düğmesine tıklayın.
                </div>
              ) : (
                filteredRuns.map((run) => {
                  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.failed
                  const Icon = cfg.icon
                  const jobLabel = JOBS.find((j) => j.id === run.jobName)?.label ?? run.jobName
                  const started = toMs(run.startedAt)
                  return (
                    <div
                      key={run.id}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          cfg.bg
                        )}
                      >
                        <Icon className={cn('h-3 w-3', cfg.color, cfg.spin && 'animate-spin')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold text-[rgb(var(--color-text))]">{jobLabel}</p>
                          {run.triggeredBy === 'manual' && (
                            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                              MANUEL
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex gap-3 text-[10px] text-[rgb(var(--color-muted))]">
                          {started && (
                            <span>{format(new Date(started), 'dd MMM HH:mm:ss', { locale: tr })}</span>
                          )}
                          {run.durationMs != null && (
                            <span className="flex items-center gap-0.5">
                              <Timer className="h-2.5 w-2.5" />
                              {run.durationMs}ms
                            </span>
                          )}
                        </div>
                        {run.error && (
                          <p className="mt-1 font-mono text-[10px] text-red-500">{run.error}</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
