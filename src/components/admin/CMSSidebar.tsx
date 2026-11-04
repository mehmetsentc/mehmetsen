'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, Newspaper, Video, Users,
  Bot, BarChart3, Clock, Settings,
  ArrowLeft, Zap, Shield, Radio, TrendingUp, Share2,
  BrainCircuit, ChevronDown, Flame, MapPin, Landmark, Globe,
  Trophy, Cpu, Heart, FlaskConical, Palette, Star, Tag, Utensils,
  Car, CircleDot, Music, Film, Theater, PartyPopper, Swords, Plane,
  Map, ShieldAlert, CloudRain, Leaf, Calendar, Bitcoin, BarChart2,
  Mail, Inbox, Archive, FileText, Network,
  ListTodo, BookOpen, GraduationCap, ScrollText, Layers,
  LayoutGrid, Activity, SlidersHorizontal, Building2, Timer, Coins, Radar, Search, Images, Clapperboard, Send, type LucideIcon,
} from 'lucide-react'
import { getAdminCategoryGroups } from '@/constants/config'
import { cn } from '@/lib/utils'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import type { CmsPermission } from '@/types/cms'
import { isMediaStudioEnabled } from '@/media-studio/featureFlag'
import { MEDIA_STUDIO_HREF, insertMediaStudioNav } from '@/media-studio/nav'
import { adminNewsService } from '@/services/adminNewsService'
import { auth } from '@/lib/firebase/auth'
import { getCachedStaffScope, scopeHasRight, subscribeStaffScope, type MyStaffScope } from '@/lib/cms/staffScopeClient'

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  trend: Flame,
  gundem: Newspaper,
  'yerel-haber': MapPin,
  siyaset: Landmark,
  dunya: Globe,
  asayis: ShieldAlert,
  'son-dakika': Zap,
  ekonomi: TrendingUp,
  borsa: BarChart2,
  kripto: Bitcoin,
  spor: Trophy,
  futbol: CircleDot,
  basketbol: CircleDot,
  voleybol: CircleDot,
  hentbol: CircleDot,
  atletizm: Zap,
  gures: Swords,
  'dunya-kupasi-2026': Trophy,
  teknoloji: Cpu,
  saglik: Heart,
  bilim: FlaskConical,
  yasam: Leaf,
  gastronomi: Utensils,
  turizm: Plane,
  gezi: Map,
  otomobil: Car,
  meteoroloji: CloudRain,
  kultur: Palette,
  sinema: Film,
  tiyatro: Theater,
  konser: Music,
  festival: PartyPopper,
  magazin: Star,
  etkinlikler: Calendar,
}

function buildSidebarCategories() {
  return getAdminCategoryGroups().flatMap((group) =>
    group.categories.map((cat) => ({
      id: cat.id,
      label: cat.parentId ? `↳ ${cat.name}` : cat.name,
      icon: CATEGORY_ICON_MAP[cat.id] ?? Tag,
      color: cat.parentId ? 'text-slate-400' : 'text-slate-300',
    }))
  )
}

const CATEGORIES = buildSidebarCategories()

/** Scroll a just-opened sidebar block into view once it has rendered. */
function revealSoon(selector: string) {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  )
}
const COLLAPSE_KEY = 'cms_nav_collapsed_groups'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  /** Live count key from sidebar counts hook */
  countKey?: 'inbox' | 'draft' | 'pending' | 'scheduled' | 'published' | 'smmQueue'
  requiredPermissions?: CmsPermission[]
  exact?: boolean
  /** ADMIN-UX-1: other paths that also highlight this entry (its sub-tabs). */
  matches?: string[]
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

// ADMIN-UX-1: 7 çalışma alanı. Bir alanın alt sayfaları sayfa başlığının altındaki
// sekmelerden açılır (AdminSectionTabs / CrawlerNav / SocialAdminNav); rotalar değişmez.
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Masa',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/admin/live-center', label: 'Canlı Haber Merkezi', icon: Activity, requiredPermissions: ['news:read'] },
      { href: '/admin/analytics', label: 'Analitik', icon: BarChart3, requiredPermissions: ['analytics:read'], exact: true },
    ],
  },
  {
    id: 'newsroom',
    label: 'Yayın Odası',
    items: [
      { href: '/admin/news', label: 'Haberler', icon: Newspaper, requiredPermissions: ['news:read'], countKey: 'published', exact: true },
      { href: '/admin/approvals', label: 'Onay Bekleyenler', icon: Clock, requiredPermissions: ['news:read'], countKey: 'pending' },
      { href: '/admin/news?filter=draft', label: 'Taslaklar', icon: FileText, requiredPermissions: ['news:read'], countKey: 'draft' },
      { href: '/admin/news?filter=scheduled', label: 'Planlananlar', icon: Calendar, requiredPermissions: ['news:read'], countKey: 'scheduled' },
      { href: '/admin/submissions', label: 'Okur Haberleri', icon: Inbox, requiredPermissions: ['news:read'] },
      { href: '/admin/inbox', label: 'Mail Kutusu', icon: Mail, requiredPermissions: ['news:read'], countKey: 'inbox' },
      { href: '/admin/archive', label: 'Arşiv', icon: Archive, requiredPermissions: ['news:read'] },
      { href: '/admin/canonical-drafts/rights', label: 'Yayın Hakları', icon: Shield, requiredPermissions: ['news:edit'] },
    ],
  },
  {
    id: 'content',
    label: 'İçerik Yapısı',
    items: [
      { href: '/admin/categories', label: 'Kategoriler', icon: Tag, requiredPermissions: ['news:read'] },
      { href: '/admin/locations', label: '81 İl ve Lokasyon', icon: Building2, requiredPermissions: ['locations:manage'] },
      { href: '/admin/publishers', label: 'Yayıncılar', icon: Landmark, requiredPermissions: ['system:settings'] },
      { href: '/admin/ekip', label: 'İl Ekipleri', icon: Users, requiredPermissions: ['users:assign_role'] },
      { href: '/admin/events', label: 'Etkinlikler', icon: Calendar, requiredPermissions: ['news:read'] },
    ],
  },
  {
    id: 'media',
    label: 'Medya Merkezi',
    items: [
      { href: '/admin/videos', label: 'Video Kütüphanesi', icon: Video, requiredPermissions: ['video:read'] },
      { href: '/admin/social/reels', label: 'Reels Stüdyosu', icon: Clapperboard, requiredPermissions: ['social:view'], matches: ['/admin/media-studio/reels'] },
    ],
  },
  {
    id: 'social',
    label: 'Sosyal ve Dağıtım',
    items: [
      { href: '/admin/social/overview', label: 'Genel Bakış', icon: Share2, requiredPermissions: ['social:view'], exact: true },
      { href: '/admin/social/network', label: 'İl Ağı', icon: Map, requiredPermissions: ['social:view'], exact: true },
      { href: '/admin/social/accounts', label: 'Hesaplar', icon: Users, requiredPermissions: ['social:view'], exact: true },
      { href: '/admin/social', label: 'Paylaşım Masası', icon: Send, requiredPermissions: ['social:view'], exact: true },
      { href: '/admin/social/shares', label: 'Hesaplara Paylaş', icon: Share2, requiredPermissions: ['social:view'], exact: true },
      { href: '/admin/smm/queue', label: 'Paylaşım Kuyruğu', icon: ListTodo, requiredPermissions: ['social:view'], countKey: 'smmQueue' },
      { href: '/admin/social/automation', label: 'Otomasyon Kuralları', icon: Zap, requiredPermissions: ['social:view'] },
      { href: '/admin/smm', label: 'İl SMM Ajanları', icon: Bot, requiredPermissions: ['social:view'], exact: true },
    ],
  },
  {
    id: 'ai',
    label: 'AI ve Otomasyon',
    items: [
      { href: '/admin/ai-org', label: 'AI Ekip', icon: Network, requiredPermissions: ['agents:manage', 'ai:use'], matches: ['/admin/ai-editors', '/admin/ai-agents'] },
      { href: '/admin/ai-instructions', label: 'Talimatlar ve Hafıza', icon: BookOpen, requiredPermissions: ['ai:instructions', 'ai:configure'], matches: ['/admin/ai-memory', '/admin/ai-learning'] },
      { href: '/admin/ai-tasks', label: 'AI Görevler', icon: ListTodo, requiredPermissions: ['ai:use'] },
      { href: '/admin/ai-usage', label: 'AI Maliyet', icon: Coins, requiredPermissions: ['ai:use'] },
      { href: '/admin/crawler', label: 'Crawler', icon: Radar, requiredPermissions: ['news:read'], matches: ['/admin/crawler/'] },
    ],
  },
  {
    id: 'system',
    label: 'Sistem',
    items: [
      { href: '/admin/page-controls', label: 'Sayfa ve Dizilim', icon: LayoutGrid, requiredPermissions: ['pages:manage'], matches: ['/admin/global-layout'] },
      { href: '/admin/feed-algorithm', label: 'Algoritma', icon: SlidersHorizontal, requiredPermissions: ['algorithm:view'] },
      { href: '/admin/users', label: 'Ekip ve Yetkiler', icon: Shield, requiredPermissions: ['users:read', 'roles:manage'], matches: ['/admin/roles'] },
      { href: '/admin/settings', label: 'Global Ayarlar', icon: Settings, requiredPermissions: ['system:settings'] },
      { href: '/admin/system-health', label: 'Sağlık ve Loglar', icon: Activity, requiredPermissions: ['system:settings', 'cron:read', 'logs:view'], matches: ['/admin/cron', '/admin/audit-logs'] },
    ],
  },
]

/** Media Studio routes (feature-flagged) added to the «Medya Merkezi» group. */
const MEDIA_STUDIO_EXTRA: NavItem[] = [
  { href: '/admin/media-studio/jobs', label: 'İşler ve Hatalar', icon: ListTodo, requiredPermissions: ['video:read'], matches: ['/admin/media-studio/failed'] },
]

/** Phase 2: navigation for il/ilçe/kategori editors — only their own section. */
function scopedNavGroups(scope: MyStaffScope): NavGroup[] {
  const items: NavItem[] = [
    { href: '/admin/news', label: 'Haberlerim', icon: Newspaper, requiredPermissions: ['news:read'], exact: true },
    { href: '/admin/news?filter=pending', label: 'Onay Bekleyenler', icon: Clock, requiredPermissions: ['news:read'] },
    { href: '/admin/news?filter=draft', label: 'Taslaklar', icon: FileText, requiredPermissions: ['news:read'] },
  ]
  if (scopeHasRight(scope, 'create')) {
    items.push({ href: '/admin/news/create', label: 'Yeni Haber', icon: Zap, requiredPermissions: ['news:create'] })
  }
  if (scopeHasRight(scope, 'ads') || scope.canManageStaff) {
    items.push({ href: '/admin/ads', label: 'Reklamlarım', icon: LayoutGrid, requiredPermissions: ['news:read'] })
  }
  if (scope.canManageStaff) {
    items.push({ href: '/admin/ekip', label: 'Ekibim', icon: Users, requiredPermissions: ['news:read'] })
  }
  return [{ id: 'scoped-desk', label: 'Bölümüm', items }]
}

function isActive(pathname: string, search: string, href: string, exact = false): boolean {
  const [path, query = ''] = href.split('?')
  if (exact) {
    if (pathname !== path) return false
    if (!query) {
      // Query-less exact item: inactive when another sibling owns a query on same path
      if (path === '/admin/social' && search.includes('panel=')) return false
      if (path === '/admin/analytics' && search.includes('scope=')) return false
      if (path === '/admin/news' && (search.includes('filter=') || search.includes('category='))) {
        return false
      }
      return true
    }
    return search.includes(query)
  }
  if (path === '/admin') return pathname === path
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false
  if (!query) {
    // Prefer exact query-less match when another item owns the query
    if (path === '/admin/news' && search.includes('filter=') && href === '/admin/news') return false
    if (path === '/admin/news' && search.includes('category=') && href === '/admin/news') return false
    if (path === '/admin/social' && search.includes('panel=')) return false
    if (path === '/admin/analytics' && search.includes('scope=')) return false
    // Nested child routes (e.g. /admin/smm/queue) must not activate the parent (/admin/smm)
    if (pathname.startsWith(`${path}/`)) return false
    return pathname === path
  }
  return pathname === path && search.includes(query)
}

function NavItemRow({
  item,
  pathname,
  search,
  counts,
}: {
  item: NavItem
  pathname: string
  search: string
  counts: Partial<Record<NonNullable<NavItem['countKey']>, number>>
}) {
  const active =
    isActive(pathname, search, item.href, item.exact) ||
    (item.matches ?? []).some((m) => (m.endsWith('/') ? pathname.startsWith(m) : pathname === m || pathname.startsWith(`${m}/`)))
  const Icon = item.icon
  const count = item.countKey ? counts[item.countKey] : undefined

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors duration-150 max-xl:justify-center max-xl:px-0 max-xl:py-2.5',
        active
          ? 'bg-[rgb(var(--color-brand))]/15 text-white'
          : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
      )}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[rgb(var(--color-brand))]" />
      ) : null}
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          active ? 'text-[rgb(var(--color-brand))]' : 'text-slate-400 group-hover:text-slate-200'
        )}
      />
      <span className="flex-1 truncate max-xl:sr-only">{item.label}</span>
      {typeof count === 'number' && count > 0 ? (
        <span className="rounded-md bg-white/10 max-xl:absolute max-xl:right-1 max-xl:top-0.5 max-xl:px-1 max-xl:text-[9px] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-200">
          {count > 999 ? '999+' : count}
        </span>
      ) : null}
      {item.badge ? (
        <span className="rounded-full bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}

function CategoryMenu({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams()
  const activeCategory = searchParams.get('category')
  const isNewsPage = pathname === '/admin/news'
  const [open, setOpen] = useState(Boolean(activeCategory))

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (!open) revealSoon('[data-nav-categories]')
          setOpen((o) => !o)
        }}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors',
          isNewsPage && activeCategory
            ? 'bg-white/12 text-white'
            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
        )}
      >
        <Tag className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="flex-1 truncate text-left">Kategori Filtreleri</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div data-nav-categories="" className="ml-3 mt-0.5 max-h-[min(280px,40vh)] scroll-mb-4 space-y-px overflow-y-auto border-l border-white/10 pl-2.5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const active = isNewsPage && activeCategory === cat.id
            return (
              <Link
                key={cat.id}
                href={`/admin/news?category=${cat.id}`}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  active ? 'bg-white/12 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-[rgb(var(--color-brand))]' : cat.color)} />
                <span className="truncate">{cat.label}</span>
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function CMSSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const { can, loading: authLoading, user } = useCmsAuth()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [counts, setCounts] = useState<Partial<Record<NonNullable<NavItem['countKey']>, number>>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY)
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    ;(async () => {
      try {
        const [navBadges, inboxUnread] = await Promise.all([
          adminNewsService.countNavBadges().catch(() => null),
          (async () => {
            try {
              if (!user) return 0
              const token = await auth.currentUser?.getIdToken()
              if (!token) return 0
              const res = await fetch('/api/admin/gmail/status', {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
              })
              if (!res.ok) return 0
              const data = (await res.json()) as { messagesUnread?: number }
              return Number(data.messagesUnread ?? 0) || 0
            } catch {
              return 0
            }
          })(),
        ])
        if (cancelled) return

        setCounts({
          published: navBadges?.published ?? 0,
          pending: navBadges?.pending ?? 0,
          draft: navBadges?.draft ?? 0,
          inbox: inboxUnread,
          scheduled: navBadges?.scheduled ?? 0,
          smmQueue: navBadges?.smmQueue ?? 0,
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, user, pathname])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ delta?: number; count?: number }>).detail
      setCounts((prev) => {
        if (typeof detail?.count === 'number') {
          return { ...prev, inbox: Math.max(0, detail.count) }
        }
        const delta = Number(detail?.delta ?? 0)
        if (!delta) return prev
        return { ...prev, inbox: Math.max(0, (prev.inbox ?? 0) + delta) }
      })
    }
    window.addEventListener('nahaber:gmail-unread', handler)
    return () => window.removeEventListener('nahaber:gmail-unread', handler)
  }, [])

  const toggleGroup = (id: string) => {
    // ADMIN-UX-1: a group opened at the bottom of the sidebar scrolls into view (it used to open below the fold)
    if (collapsed[id]) revealSoon(`[data-nav-group="${id}"]`)
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // Phase 2: scoped (il/ilçe/kategori) editors see only their own section.
  const [staffScope, setStaffScope] = useState<MyStaffScope | null>(() => getCachedStaffScope())
  useEffect(() => subscribeStaffScope(setStaffScope), [])

  const visibleGroups = useMemo(
    () =>
      (staffScope?.scoped ? scopedNavGroups(staffScope) : NAV_GROUPS).map((group) => ({
        ...group,
        items: insertMediaStudioNav(
          [
            ...group.items,
            ...(group.id === 'media' && isMediaStudioEnabled() ? MEDIA_STUDIO_EXTRA : []),
          ]
            .map((item) =>
              // Reels has one home: inside Medya Stüdyosu when it is on, else the social page
              item.href === '/admin/social/reels' && isMediaStudioEnabled()
                ? { ...item, href: '/admin/media-studio/reels', matches: ['/admin/social/reels'] }
                : item
            )
            .filter(
              (item) => !item.requiredPermissions || item.requiredPermissions.some((p) => can(p))
            ),
          group.id === 'media' && isMediaStudioEnabled() && can('video:read')
            ? {
                href: MEDIA_STUDIO_HREF,
                label: 'İçe Aktar',
                icon: Images,
                requiredPermissions: ['video:read'],
                exact: true,
              }
            : null
        ),
      })).filter((group) => group.items.length > 0),
    [can, staffScope]
  )

  // ADMIN-UX-1: 1024–1279 px (tablet yatay / küçük laptop) → 72 px ikon çubuğu; 1280+ tam sidebar
  return (
    <aside className="flex h-screen w-[72px] shrink-0 flex-col overflow-hidden bg-[rgb(var(--admin-sidebar))] text-white supports-[height:100dvh]:h-[100dvh] xl:w-[248px]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-4 max-xl:justify-center max-xl:px-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))] shadow-sm">
          <Radio className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 max-xl:hidden">
          <p className="truncate text-sm font-bold tracking-tight">
            <span className="text-[rgb(var(--color-brand))]">Na</span>Haber CMS
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Newsroom</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 max-xl:justify-center max-xl:px-0" title="Canlı yayın aktif">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-medium text-slate-400 max-xl:hidden">Canlı yayın aktif</span>
      </div>

      <nav className="flex-1 overflow-y-auto pb-8 pt-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {visibleGroups.map((group) => {
          const isCollapsed = Boolean(collapsed[group.id])
          return (
            <div key={group.id} data-nav-group={group.id} className="mb-3 scroll-mb-4 px-2.5 max-xl:px-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                title={group.label}
                className="mb-1 flex w-full items-center gap-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-300 max-xl:justify-center max-xl:px-0"
              >
                <span className="flex-1 text-left max-xl:hidden">{group.label}</span>
                <span className="hidden h-px flex-1 bg-white/10 max-xl:block" aria-hidden="true" />
                <ChevronDown className={cn('h-3 w-3 transition-transform', isCollapsed && '-rotate-90')} />
              </button>
              {!isCollapsed ? (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItemRow
                      key={item.href + item.label}
                      item={item}
                      pathname={pathname}
                      search={search}
                      counts={counts}
                    />
                  ))}
                  {group.id === 'newsroom' && can('news:read') ? <div className="max-xl:hidden"><CategoryMenu pathname={pathname} /></div> : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.06] px-2.5 py-3">
        <Link
          href="/"
          title="Uygulamaya Dön"
          className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white max-xl:justify-center"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="max-xl:hidden">Uygulamaya Dön</span>
        </Link>
      </div>
    </aside>
  )
}
