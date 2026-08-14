'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { TurkeySmmMap } from '@/components/admin/os/TurkeySmmMap'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import { db, Collections } from '@/lib/firebase/firestore'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { ExternalLink, Loader2, Share2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ROUTES } from '@/constants/routes'

type AgentRow = {
  id: string
  displayName: string
  roleTemplateId: string
  status: string
  territories: string[]
}

type SharedPostRow = {
  id: string
  title: string
  slug?: string
  url?: string
  coverImageUrl?: string | null
  socialPublished?: boolean
  storyPublished?: boolean
  socialPublishedAt?: number
  storyPublishedAt?: number
  publishedAt?: number
  facebookPostId?: string
  instagramMediaId?: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function toMs(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v < 1_000_000_000_000 ? v * 1000 : v
  }
  if (v && typeof v === 'object' && 'toMillis' in v) {
    try {
      return (v as { toMillis(): number }).toMillis()
    } catch {
      return 0
    }
  }
  if (typeof v === 'string') {
    const n = Date.parse(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

async function loadCitySharedPosts(citySlug: string): Promise<SharedPostRow[]> {
  const base = collection(db, Collections.NEWS)
  const attempts: QueryConstraint[][] = [
    [
      where('citySlug', '==', citySlug),
      where('socialPublished', '==', true),
      orderBy('socialPublishedAt', 'desc'),
      limit(40),
    ],
    [
      where('citySlug', '==', citySlug),
      where('socialPublished', '==', true),
      orderBy('publishedAt', 'desc'),
      limit(40),
    ],
    [where('citySlug', '==', citySlug), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(80)],
  ]

  for (const constraints of attempts) {
    try {
      const snap = await getDocs(query(base, ...constraints))
      const rows: SharedPostRow[] = []
      for (const doc of snap.docs) {
        const d = doc.data()
        const socialPublished = d.socialPublished === true
        const storyPublished = d.storyPublished === true
        // First two queries are already shared; third is published pool — keep shared only
        if (!socialPublished && !storyPublished) continue
        rows.push({
          id: doc.id,
          title: String(d.title ?? 'Başlıksız'),
          slug: typeof d.slug === 'string' ? d.slug : undefined,
          url: typeof d.url === 'string' ? d.url : undefined,
          coverImageUrl:
            (d.coverImageUrl as string | undefined) ??
            (d.thumbnail as string | undefined) ??
            (d.imageUrl as string | undefined) ??
            null,
          socialPublished,
          storyPublished,
          socialPublishedAt: toMs(d.socialPublishedAt),
          storyPublishedAt: toMs(d.storyPublishedAt),
          publishedAt: toMs(d.publishedAt) || toMs(d.createdAt),
          facebookPostId: typeof d.facebookPostId === 'string' ? d.facebookPostId : undefined,
          instagramMediaId: typeof d.instagramMediaId === 'string' ? d.instagramMediaId : undefined,
        })
      }
      rows.sort((a, b) => {
        const aAt = Math.max(a.socialPublishedAt ?? 0, a.storyPublishedAt ?? 0, a.publishedAt ?? 0)
        const bAt = Math.max(b.socialPublishedAt ?? 0, b.storyPublishedAt ?? 0, b.publishedAt ?? 0)
        return bAt - aAt
      })
      return rows.slice(0, 40)
    } catch {
      /* try next index shape */
    }
  }
  return []
}

export default function SmmNetworkPage() {
  const { can } = useCmsAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusCity = (searchParams.get('city') ?? '').trim().toLowerCase()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState(focusCity ?? '')
  const [sharedPosts, setSharedPosts] = useState<SharedPostRow[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedError, setSharedError] = useState<string | null>(null)

  const focusProvince = useMemo(
    () => TURKISH_PROVINCES.find((p) => p.slug === focusCity) ?? null,
    [focusCity]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/newsroom-agents', { headers })
      const data = (await res.json()) as { agents?: AgentRow[]; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setAgents((data.agents ?? []).filter((a) => a.roleTemplateId === 'city-smm'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (focusCity) setQ(focusCity)
  }, [focusCity])

  useEffect(() => {
    if (!focusCity) {
      setSharedPosts([])
      setSharedError(null)
      return
    }
    let cancelled = false
    setSharedLoading(true)
    setSharedError(null)
    void loadCitySharedPosts(focusCity)
      .then((rows) => {
        if (!cancelled) setSharedPosts(rows)
      })
      .catch((e) => {
        if (!cancelled) setSharedError(e instanceof Error ? e.message : 'Paylaşımlar yüklenemedi')
      })
      .finally(() => {
        if (!cancelled) setSharedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focusCity])

  const byCity = useMemo(() => {
    const map = new Map<string, AgentRow>()
    for (const a of agents) {
      const slug = a.territories?.[0]
      if (slug) map.set(slug, a)
    }
    return map
  }, [agents])

  const activeSlugs = useMemo(() => {
    const set = new Set<string>()
    for (const [slug, agent] of byCity) {
      if (agent.status === 'active') set.add(slug)
    }
    // Çanakkale shares exist even if SMM agent seed is incomplete — show on map
    if (sharedPosts.length > 0 && focusCity) set.add(focusCity)
    // Always mark canakkale active when it has live social pipeline (current prod)
    if (byCity.has('canakkale') || focusCity === 'canakkale') set.add('canakkale')
    return set
  }, [byCity, focusCity, sharedPosts.length])

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return TURKISH_PROVINCES.filter(
      (p) =>
        !needle ||
        p.name.toLocaleLowerCase('tr-TR').includes(needle) ||
        p.slug.includes(needle)
    ).map((p) => {
      const agent = byCity.get(p.slug)
      const live = activeSlugs.has(p.slug)
      return {
        ...p,
        agent,
        health: live
          ? agent?.status === 'active' || p.slug === 'canakkale'
            ? 'active'
            : 'warning'
          : agent
            ? 'warning'
            : 'missing',
      }
    })
  }, [byCity, q, activeSlugs])

  const active = rows.filter((r) => r.health === 'active').length
  const missing = rows.filter((r) => r.health === 'missing').length

  const selectCity = (slug: string) => {
    router.push(`/admin/smm?city=${encodeURIComponent(slug)}`)
  }

  const clearCity = () => {
    router.push('/admin/smm')
  }

  const seed81 = async () => {
    if (!can('agents:manage') && !can('ai:configure')) {
      toast.error('Yetkiniz yok')
      return
    }
    if (
      !confirm(
        'Social Media Director + 81 İl SMM ajanı + tüm SMM talimatları (rol/lokasyon/görev) oluşturulacak. Devam?'
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const headers = await authHeaders()
      await fetch('/api/admin/newsroom-agents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-core' }),
      })
      const res = await fetch('/api/admin/newsroom-agents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-smm-81' }),
      })
      const data = (await res.json()) as {
        smm?: { created?: string[]; updated?: string[] }
        instructions?: { created?: string[]; updated?: string[] }
        created?: string[]
        updated?: string[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'Seed başarısız')
      const smmCreated = data.smm?.created?.length ?? data.created?.length ?? 0
      const smmUpdated = data.smm?.updated?.length ?? data.updated?.length ?? 0
      const instrCreated = data.instructions?.created?.length ?? 0
      const instrUpdated = data.instructions?.updated?.length ?? 0
      toast.success(
        `SMM ajan: ${smmCreated} yeni / ${smmUpdated} güncel · Talimat: ${instrCreated} yeni / ${instrUpdated} güncel`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminOsPageShell
      title="81 İl Sosyal Medya Ağı"
      subtitle="Haritadan il seç → paylaşılan haberler · City SMM ajanları"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/social"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            Hesaplar
          </Link>
          <Link
            href="/admin/smm/queue"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            Kuyruk
          </Link>
          {(can('agents:manage') || can('ai:configure')) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void seed81()}
              className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '81 İl SMM + Talimatlar'}
            </button>
          )}
        </div>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'SMM ajan', value: `${active}/81`, tone: active === 81 ? 'ok' : 'warn' },
          { label: 'Eksik', value: String(missing) },
          { label: 'Uyarı', value: String(rows.filter((r) => r.health === 'warning').length) },
          {
            label: focusProvince ? `${focusProvince.name} paylaşım` : 'Seçili il',
            value: focusCity ? String(sharedPosts.length) : '—',
            hint: focusCity ? 'sosyal yayın' : 'haritadan seç',
          },
        ]}
      />

      <div className="mb-6">
        <TurkeySmmMap activeSlugs={activeSlugs} className="min-h-[240px]" />
        <p className="mt-2 text-[11px] text-slate-500">
          İl üzerine tıklayınca o şehrin paylaşılan haberleri açılır. Şu an canlı paylaşım hattı:
          Çanakkale.
        </p>
      </div>

      {focusProvince ? (
        <section
          id="smm-city-shares"
          className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
            <Share2 className="h-4 w-4 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-white">{focusProvince.name} — Paylaşılan haberler</h2>
              <p className="text-[11px] text-slate-400">
                `socialPublished` / `storyPublished` · şehir: {focusCity}
              </p>
            </div>
            <Link
              href={`/admin/social?city=${encodeURIComponent(focusCity)}&status=published`}
              className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
            >
              Sosyal masa →
            </Link>
            <button
              type="button"
              onClick={clearCity}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
              Kapat
            </button>
          </div>

          {sharedLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : sharedError ? (
            <p className="px-4 py-8 text-center text-sm text-red-400">{sharedError}</p>
          ) : sharedPosts.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              Bu il için henüz sosyal medyada paylaşılmış haber yok.
              {focusCity === 'canakkale'
                ? ' Cron / manuel paylaşım sonrası burada listelenir.'
                : ' Şu an yalnızca Çanakkale paylaşım hattı aktif.'}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {sharedPosts.map((post) => {
                const when =
                  Math.max(post.socialPublishedAt ?? 0, post.storyPublishedAt ?? 0, post.publishedAt ?? 0) ||
                  0
                const href =
                  post.url ||
                  (post.slug ? ROUTES.NEWS_DETAIL(post.slug) : `/haber/${post.id}`)
                return (
                  <li key={post.id} className="flex gap-3 px-4 py-3 hover:bg-white/[0.03]">
                    {post.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.coverImageUrl}
                        alt=""
                        className="h-14 w-20 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] text-slate-500">
                        görsel yok
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 text-sm font-semibold text-white hover:underline"
                      >
                        {post.title}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        {post.socialPublished ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                            Post
                          </span>
                        ) : null}
                        {post.storyPublished ? (
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-300">
                            Story
                          </span>
                        ) : null}
                        {post.facebookPostId ? <span>FB</span> : null}
                        {post.instagramMediaId ? <span>IG</span> : null}
                        {when > 0 ? (
                          <span>
                            {formatDistanceToNow(when, { addSuffix: true, locale: tr })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 self-center text-slate-500 hover:text-white"
                      aria-label="Haberi aç"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İl ara…"
          className="w-full max-w-sm rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 sm:w-72"
        />
        <div className="flex gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Aktif
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Uyarı
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Yok
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : agents.length === 0 && !focusCity ? (
        <AdminOsEmptyState
          title="SMM ağı henüz seed edilmedi"
          description="«81 İl SMM + Talimatlar» ile Director + 81 ajan + 81 lokasyon/rol/görev playbook’unu oluştur. Haritadan Çanakkale’ye tıklayarak mevcut paylaşımları görebilirsin."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">İl</th>
                <th className="px-4 py-3">SMM ajan</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr
                  key={r.slug}
                  className={cn('hover:bg-white/[0.03]', focusCity === r.slug && 'bg-white/[0.06]')}
                >
                  <td className="px-4 py-3 font-semibold text-white">{r.name}</td>
                  <td className="px-4 py-3 text-slate-300">{r.agent?.displayName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          r.health === 'active' && 'bg-emerald-500',
                          r.health === 'warning' && 'bg-amber-400',
                          r.health === 'missing' && 'bg-red-500'
                        )}
                      />
                      {r.health === 'active' ? 'Aktif' : r.health === 'warning' ? 'Uyarı' : 'Yok'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => selectCity(r.slug)}
                      className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
                    >
                      Paylaşımlar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminOsPageShell>
  )
}
