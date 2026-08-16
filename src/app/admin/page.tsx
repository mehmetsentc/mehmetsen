'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CMSHeader, CMSRefreshButton } from '@/components/admin/CMSHeader'
import { MobileHome } from '@/components/admin/mobile/MobileHome'
import {
  NewsroomOsDashboard,
  type OsAgentActivity,
  type OsDashStats,
  type OsLiveEvent,
} from '@/components/admin/os/NewsroomOsDashboard'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'
import { auth } from '@/lib/firebase/auth'
import { Collections, db } from '@/lib/firebase/firestore'
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { adminService } from '@/services/adminService'
import { countVisiblePendingApprovals, isDuplicateNewsData } from '@/services/adminNewsService'

let _pageStatsCache: { data: OsDashStats; t: number } | null = null
const PAGE_STATS_TTL = 5 * 60 * 1000

function tsToMs(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof val === 'object' && 'toMillis' in val) return (val as { toMillis(): number }).toMillis()
  if (val && typeof val === 'object' && 'seconds' in val) return (val as { seconds: number }).seconds * 1000
  return 0
}

const EMPTY_STATS: OsDashStats = {
  totalPublished: 0,
  pendingReview: 0,
  publishedToday: 0,
  totalUsers: 0,
  totalReads: null,
  smmActive: 0,
  smmTotal: 81,
  draftCount: 0,
  scheduledCount: 0,
  archiveCount: 0,
  aiTaskOpen: 0,
  factCheckOpen: 0,
  seoOpen: 0,
  smmQueue: 0,
}

export default function AdminIndexPage() {
  const isMobile = useIsMobileAdminViewport()
  const { can } = useCmsAuth()
  const [stats, setStats] = useState<OsDashStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [liveEvents, setLiveEvents] = useState<OsLiveEvent[]>([])
  const [agentActivity, setAgentActivity] = useState<OsAgentActivity[]>([])
  const [smmActiveSlugs, setSmmActiveSlugs] = useState<Set<string>>(new Set())
  const [orgSummary, setOrgSummary] = useState({
    eic: 'Genel Yayın Yönetmeni AI',
    desks: [
      { label: 'Gündem', count: 0 },
      { label: 'Yerel masalar', count: 0 },
      { label: 'Fact Check', count: 0 },
      { label: 'SEO', count: 0 },
      { label: 'SMM ağı', count: 0 },
    ],
  })
  const [healthChecks, setHealthChecks] = useState<
    Array<{ id: string; label: string; status: string; detail: string; href?: string }>
  >([])

  const loadStats = useCallback(async () => {
    if (isMobile !== false) return
    if (_pageStatsCache && Date.now() - _pageStatsCache.t < PAGE_STATS_TTL) {
      setStats(_pageStatsCache.data)
      setLoading(false)
      return
    }
    try {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const [publishedSnap, pendingReview, todaySnap, usersSnap, draftSnap] = await Promise.all([
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'))).catch(() => null),
        countVisiblePendingApprovals().catch(() => 0),
        getCountFromServer(
          query(
            collection(db, Collections.NEWS),
            where('status', '==', 'published'),
            where('createdAt', '>=', startOfDay.getTime())
          )
        ).catch(() => null),
        getCountFromServer(collection(db, 'users')).catch(() => null),
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'draft'))).catch(() => null),
      ])

      let totalReads: number | null = null
      try {
        const overview = await adminService.getDashboardOverview()
        const sum = (overview.topNews ?? []).reduce((a, n) => a + (n.viewsCount ?? 0), 0)
        totalReads = sum > 0 ? sum : null
      } catch {
        totalReads = null
      }

      const next: OsDashStats = {
        ...EMPTY_STATS,
        totalPublished: publishedSnap?.data().count ?? 0,
        pendingReview: pendingReview,
        publishedToday: todaySnap?.data().count ?? 0,
        totalUsers: usersSnap?.data().count ?? 0,
        draftCount: draftSnap?.data().count ?? 0,
        totalReads,
      }
      _pageStatsCache = { data: next, t: Date.now() }
      setStats(next)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    void loadStats()
  }, [loadStats, isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    const qPublished = query(collection(db, Collections.NEWS), orderBy('createdAt', 'desc'), limit(8))
    const qPending = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(6)
    )
    const qBreaking = query(
      collection(db, Collections.NEWS),
      where('isBreaking', '==', true),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc'),
      limit(4)
    )

    let published: OsLiveEvent[] = []
    let pending: OsLiveEvent[] = []
    let breaking: OsLiveEvent[] = []

    const merge = () => {
      const all = [...pending, ...breaking, ...published].sort((a, b) => b.createdAt - a.createdAt)
      setLiveEvents(all.slice(0, 10))
    }

    const u1 = onSnapshot(
      qPublished,
      (snap) => {
        published = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: `r-${d.id}`,
            title: (data.title as string) ?? '',
            source: (data.source as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            cityLabel: (data.citySlug as string) || (data.city as string) || undefined,
            createdAt: tsToMs(data.createdAt),
            kind: 'published' as const,
            href: `/admin/news/${d.id}/edit`,
          }
        })
        merge()
      },
      () => {}
    )
    const u2 = onSnapshot(
      qPending,
      (snap) => {
        pending = snap.docs
          .filter((d) => !isDuplicateNewsData(d.data()))
          .map((d) => {
          const data = d.data()
          return {
            id: `p-${d.id}`,
            title: (data.title as string) ?? '',
            source: (data.source as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            createdAt: tsToMs(data.createdAt),
            kind: 'pending' as const,
            href: '/admin/news?filter=pending',
          }
        })
        merge()
      },
      () => {}
    )
    const u3 = onSnapshot(
      qBreaking,
      (snap) => {
        breaking = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: `b-${d.id}`,
            title: (data.title as string) ?? '',
            source: (data.source as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            cityLabel: (data.citySlug as string) || undefined,
            createdAt: tsToMs(data.createdAt),
            kind: 'breaking' as const,
            href: `/admin/news/${d.id}/edit`,
          }
        })
        merge()
      },
      () => {}
    )
    return () => {
      u1()
      u2()
      u3()
    }
  }, [isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    if (!can('agents:manage') && !can('ai:use') && !can('social:view')) return

    let cancelled = false
    ;(async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return
        const headers = { Authorization: `Bearer ${token}` }
        const [agentsRes, tasksRes, queueRes, healthRes] = await Promise.all([
          fetch('/api/admin/newsroom-agents', { headers }).catch(() => null),
          fetch('/api/admin/agent-tasks?limit=12', { headers }).catch(() => null),
          fetch('/api/admin/os-ops?resource=smm-queue', { headers }).catch(() => null),
          can('system:settings')
            ? fetch('/api/admin/os-ops?resource=health', { headers }).catch(() => null)
            : Promise.resolve(null),
        ])

        if (agentsRes?.ok) {
          const body = (await agentsRes.json()) as {
            agents?: Array<{
              id: string
              displayName?: string
              roleTemplateId?: string
              status?: string
              territories?: string[]
            }>
            counts?: { total?: number; smm?: number; local?: number }
          }
          if (cancelled) return
          const agents = body.agents ?? []
          const smm = agents.filter((a) => a.roleTemplateId === 'city-smm' || a.id?.startsWith('smm-'))
          const activeSmm = smm.filter((a) => a.status === 'active')
          const slugs = new Set<string>()
          for (const a of activeSmm) {
            for (const t of a.territories ?? []) slugs.add(t)
            const m = /^smm-(.+)$/.exec(a.id)
            if (m) slugs.add(m[1])
          }
          setSmmActiveSlugs(slugs)
          setStats((prev) => {
            const next = {
              ...prev,
              smmActive: activeSmm.length || body.counts?.smm || 0,
              smmTotal: Math.max(81, smm.length || body.counts?.smm || 81),
            }
            _pageStatsCache = { data: next, t: Date.now() }
            return next
          })
          setOrgSummary({
            eic: agents.find((a) => a.roleTemplateId === 'editor-in-chief')?.displayName ?? 'Genel Yayın Yönetmeni AI',
            desks: [
              {
                label: 'Gündem',
                count: agents.filter((a) => a.roleTemplateId === 'desk-editor').length,
              },
              {
                label: 'Yerel masalar',
                count: body.counts?.local ?? agents.filter((a) => a.roleTemplateId === 'local-editor').length,
              },
              {
                label: 'Fact Check',
                count: agents.filter((a) => a.roleTemplateId === 'fact-checker').length || 1,
              },
              {
                label: 'SEO',
                count: agents.filter((a) => a.roleTemplateId === 'seo-editor').length || 1,
              },
              {
                label: 'SMM ağı',
                count: smm.length || body.counts?.smm || 0,
              },
            ],
          })
        }

        if (tasksRes?.ok) {
          const body = (await tasksRes.json()) as {
            tasks?: Array<{
              id: string
              type?: string
              status?: string
              assignedAgentId?: string
              createdAt?: number
              updatedAt?: number
            }>
          }
          if (cancelled) return
          const tasks = body.tasks ?? []
          const open = tasks.filter(
            (t) =>
              t.status === 'PENDING' ||
              t.status === 'PROCESSING' ||
              t.status === 'QUEUED' ||
              t.status === 'pending' ||
              t.status === 'processing'
          )
          setStats((prev) => ({
            ...prev,
            aiTaskOpen: open.length,
            factCheckOpen: open.filter((t) => t.type === 'FACT_CHECK').length,
            seoOpen: open.filter((t) => t.type === 'SEO').length,
          }))
          setAgentActivity(
            tasks.slice(0, 8).map((t) => ({
              id: t.id,
              actor: t.assignedAgentId || 'AI Agent',
              actorType: 'AI' as const,
              message: `${t.type ?? 'TASK'} · ${t.status ?? 'unknown'}`,
              at: t.updatedAt ?? t.createdAt ?? Date.now(),
            }))
          )
        }

        if (queueRes?.ok) {
          const body = (await queueRes.json()) as { counts?: { queued?: number } }
          if (!cancelled) {
            setStats((prev) => ({ ...prev, smmQueue: body.counts?.queued ?? 0 }))
          }
        }

        if (healthRes?.ok) {
          const body = (await healthRes.json()) as {
            checks?: Array<{ id: string; label: string; status: string; detail: string; href?: string }>
          }
          if (!cancelled) setHealthChecks(body.checks ?? [])
        }
      } catch (e) {
        console.error('[os dashboard agents]', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isMobile, can])

  const headerActions = useMemo(
    () => (
      <CMSRefreshButton
        loading={loading}
        onClick={() => {
          _pageStatsCache = null
          setLoading(true)
          void loadStats()
        }}
      />
    ),
    [loading, loadStats]
  )

  if (isMobile === null) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  if (isMobile) {
    return <MobileHome />
  }

  return (
    <div className="flex flex-col admin-shell">
      <CMSHeader title="Dashboard" subtitle="Haber odası kontrol merkezi" actions={headerActions} />
      <NewsroomOsDashboard
        stats={stats}
        loading={loading}
        liveEvents={liveEvents}
        agentActivity={agentActivity}
        smmActiveSlugs={smmActiveSlugs}
        orgSummary={orgSummary}
        healthChecks={healthChecks}
      />
    </div>
  )
}
