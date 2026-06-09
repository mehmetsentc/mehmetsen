'use client'

import { auth } from '@/lib/firebase/auth'

import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db, Collections } from '@/lib/firebase/firestore'
import { collection, query, where, limit, getDocs, orderBy, doc, updateDoc, getCountFromServer } from 'firebase/firestore'
import { Search, AlertTriangle, CheckCircle2, RefreshCw, ExternalLink, Wand2, Loader2, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

interface SeoIssue {
  id: string
  title: string
  seoTitle?: string
  seoDescription?: string
  slug?: string
  categoryId?: string
  publishedAt?: string
  issue: 'missing_seo_title' | 'missing_seo_desc' | 'missing_slug' | 'short_seo_title' | 'short_seo_desc'
}

interface SeoStats {
  total: number
  withSeoTitle: number
  withSeoDesc: number
  withSlug: number
  missingAny: number
}

const ISSUE_LABELS: Record<SeoIssue['issue'], string> = {
  missing_seo_title: 'SEO başlığı eksik',
  missing_seo_desc: 'Meta açıklama eksik',
  missing_slug: 'URL slug eksik',
  short_seo_title: 'SEO başlığı çok kısa (<30 karakter)',
  short_seo_desc: 'Meta açıklama çok kısa (<100 karakter)',
}

export default function SeoManagementPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<SeoStats>({ total: 0, withSeoTitle: 0, withSeoDesc: 0, withSlug: 0, missingAny: 0 })
  const [issues, setIssues] = useState<SeoIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [fixing, setFixing] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [totalSnap, noSeoTitleSnap, noSeoDescSnap, noSlugSnap] = await Promise.all([
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'))).catch(() => null),
        getDocs(query(collection(db, Collections.NEWS), where('status', '==', 'published'), where('seoTitle', '==', ''), orderBy('publishedAt', 'desc'), limit(50))).catch(() => null),
        getDocs(query(collection(db, Collections.NEWS), where('status', '==', 'published'), where('seoDescription', '==', ''), orderBy('publishedAt', 'desc'), limit(50))).catch(() => null),
        getDocs(query(collection(db, Collections.NEWS), where('status', '==', 'published'), where('slug', '==', ''), orderBy('publishedAt', 'desc'), limit(50))).catch(() => null),
      ])

      const issueList: SeoIssue[] = []
      const seen = new Set<string>()

      const addIssues = (snap: typeof noSeoTitleSnap, issue: SeoIssue['issue']) => {
        snap?.docs.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id)
            const data = d.data()
            issueList.push({
              id: d.id,
              title: (data.title as string) ?? '',
              seoTitle: data.seoTitle as string | undefined,
              seoDescription: data.seoDescription as string | undefined,
              slug: data.slug as string | undefined,
              categoryId: data.categoryId as string | undefined,
              publishedAt: data.publishedAt as string | undefined,
              issue,
            })
          }
        })
      }

      addIssues(noSeoTitleSnap, 'missing_seo_title')
      addIssues(noSeoDescSnap, 'missing_seo_desc')
      addIssues(noSlugSnap, 'missing_slug')

      setIssues(issueList)
      setStats({
        total: totalSnap?.data().count ?? 0,
        withSeoTitle: (totalSnap?.data().count ?? 0) - (noSeoTitleSnap?.size ?? 0),
        withSeoDesc: (totalSnap?.data().count ?? 0) - (noSeoDescSnap?.size ?? 0),
        withSlug: (totalSnap?.data().count ?? 0) - (noSlugSnap?.size ?? 0),
        missingAny: seen.size,
      })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAiFix = async (issue: SeoIssue) => {
    if (!user) return
    setFixing(issue.id)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'seo', input: issue.title }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json() as { seoTitle?: string; seoDescription?: string }
      const updates: Record<string, string> = {}
      if (data.seoTitle) updates.seoTitle = data.seoTitle
      if (data.seoDescription) updates.seoDescription = data.seoDescription
      if (!issue.slug && issue.title) {
        updates.slug = issue.title.toLowerCase()
          .replace(/[ğ]/g,'g').replace(/[üü]/g,'u').replace(/[şş]/g,'s').replace(/[ıi]/g,'i').replace(/[öo]/g,'o').replace(/[çc]/g,'c')
          .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)
      }
      await updateDoc(doc(db, Collections.NEWS, issue.id), updates)
      setIssues(prev => prev.filter(i => i.id !== issue.id))
      toast.success('SEO alanları güncellendi')
    } catch { toast.error('Güncelleme başarısız') }
    finally { setFixing(null) }
  }

  const score = stats.total > 0
    ? Math.round(((stats.withSeoTitle + stats.withSeoDesc + stats.withSlug) / (stats.total * 3)) * 100)
    : 100

  const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'
  const scoreBg = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="SEO Yönetimi"
        subtitle="Arama motoru optimizasyon paneli"
        actions={
          <button onClick={loadData} className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />Tazele
          </button>
        }
      />
      <div className="p-6 space-y-6">
        {/* Score card */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="sm:col-span-2 xl:col-span-1 flex flex-col items-center justify-center rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">SEO Skoru</p>
            <p className={cn('mt-2 text-5xl font-black tabular-nums', scoreColor)}>{score}<span className="text-2xl">%</span></p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--color-surface))]">
              <div className={cn('h-full rounded-full transition-all', scoreBg)} style={{ width: `${score}%` }} />
            </div>
          </div>
          {[
            { label: 'SEO Başlığı Olan', value: stats.withSeoTitle, total: stats.total, color: 'text-blue-600' },
            { label: 'Meta Açıklama Olan', value: stats.withSeoDesc, total: stats.total, color: 'text-purple-600' },
            { label: 'URL Slug Olan', value: stats.withSlug, total: stats.total, color: 'text-emerald-600' },
            { label: 'SEO Sorunu', value: stats.missingAny, total: stats.total, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{s.label}</p>
              <p className={cn('mt-1.5 text-2xl font-black tabular-nums', s.color)}>{loading ? '–' : s.value}</p>
              <p className="text-xs text-[rgb(var(--color-muted))]">/ {stats.total} haber</p>
            </div>
          ))}
        </div>

        {/* Issues list */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">SEO Sorunları ({issues.length})</h2>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />)}
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Mükemmel! SEO sorunu yok</p>
            </div>
          ) : (
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {issues.map(issue => (
                <div key={issue.id} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[rgb(var(--color-surface))]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-[rgb(var(--color-text))]">{issue.title}</p>
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      {ISSUE_LABELS[issue.issue]}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleAiFix(issue)} disabled={fixing === issue.id}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                      {fixing === issue.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      AI Düzelt
                    </button>
                    <a href={`/p/${issue.id}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-bold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]">
                      <ExternalLink className="h-3 w-3" />Görüntüle
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
