'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, Newspaper, Video, Users, UserCog, UserCheck,
  Bot, BarChart3, Search, Clock, Key, Settings, ChevronRight,
  ArrowLeft, Zap, Shield, Radio, TrendingUp, Share2,
  BrainCircuit, ChevronDown, Flame, MapPin, Landmark, Globe,
  Trophy, Cpu, Heart, FlaskConical, Palette, Star, Tag, Utensils,
  Car, CircleDot, Music, Film, Theater, PartyPopper, Swords, Plane,
  Map, ShieldAlert, CloudRain, Leaf, Calendar, Bitcoin, BarChart2,
  Megaphone, Mail, Inbox, Archive, FileText, Briefcase, Network,
  ListTodo, BookOpen, GraduationCap, Gauge, ScrollText, Layers,
  LayoutGrid, Activity, SlidersHorizontal, Building2, type LucideIcon,
} from 'lucide-react'
import { getAdminCategoryGroups } from '@/constants/config'
import { cn } from '@/lib/utils'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import type { CmsPermission } from '@/types/cms'
import { CMS_ROLE_COLORS } from '@/types/cms'

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
const COLLAPSE_KEY = 'cms_nav_collapsed_groups'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  requiredPermissions?: CmsPermission[]
  exact?: boolean
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Genel Bakış',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/admin/live-center', label: 'Canlı Haber Merkezi', icon: Activity, requiredPermissions: ['news:read'] },
      { href: '/admin/analytics', label: 'Analitik', icon: BarChart3, requiredPermissions: ['analytics:read'] },
      { href: '/admin/most-read', label: 'En Çok Okunanlar', icon: Flame, requiredPermissions: ['analytics:read'] },
    ],
  },
  {
    id: 'newsroom-desk',
    label: 'Yayın Odası',
    items: [
      { href: '/admin/inbox', label: 'Gelen Haberler', icon: Mail, requiredPermissions: ['news:read'] },
      { href: '/admin/news?filter=draft', label: 'Taslaklar', icon: FileText, requiredPermissions: ['news:read'] },
      { href: '/admin/approvals', label: 'Onay Bekleyenler', icon: Clock, requiredPermissions: ['news:read'] },
      { href: '/admin/newsroom', label: 'Fact Check Bekleyenler', icon: ShieldAlert, requiredPermissions: ['ai:use'] },
      { href: '/admin/news?filter=scheduled', label: 'Planlananlar', icon: Calendar, requiredPermissions: ['news:read'] },
      { href: '/admin/news?filter=published', label: 'Yayında', icon: Newspaper, requiredPermissions: ['news:read'] },
      { href: '/admin/news?filter=update', label: 'Güncellenecekler', icon: ListTodo, requiredPermissions: ['news:read'] },
      { href: '/admin/archive', label: 'Arşiv', icon: Archive, requiredPermissions: ['news:read'] },
    ],
  },
  {
    id: 'content',
    label: 'İçerik Yönetimi',
    items: [
      { href: '/admin/news', label: 'Tüm Haberler', icon: Newspaper, requiredPermissions: ['news:read'] },
      { href: '/admin/news/create', label: 'Yeni Haber', icon: FileText, requiredPermissions: ['news:create'] },
      { href: '/admin/categories', label: 'Kategoriler', icon: Tag, requiredPermissions: ['news:read'] },
      { href: '/admin/locations', label: '81 İl', icon: Building2, requiredPermissions: ['locations:manage'], badge: 'YENİ' },
      { href: '/admin/videos', label: 'Video', icon: Video, requiredPermissions: ['video:read'] },
      { href: '/admin/submissions', label: 'Gönderiler', icon: Inbox, requiredPermissions: ['news:read'] },
      { href: '/admin/job-classifieds', label: 'İş Kariyer', icon: Briefcase, requiredPermissions: ['news:publish'] },
      { href: '/admin/events', label: 'Etkinlikler', icon: Calendar, requiredPermissions: ['news:read'] },
    ],
  },
  {
    id: 'ai',
    label: 'AI Newsroom',
    items: [
      { href: '/admin/ai-org', label: 'AI Organizasyonu', icon: Network, requiredPermissions: ['agents:manage'] },
      { href: '/admin/ai-editors', label: 'AI Editörler', icon: Bot, requiredPermissions: ['ai:use'] },
      { href: '/admin/ai-agents', label: 'AI Ajanlar', icon: BrainCircuit, requiredPermissions: ['agents:manage'] },
      { href: '/admin/roles', label: 'Roller', icon: Shield, requiredPermissions: ['roles:manage'] },
      { href: '/admin/ai-instructions', label: 'Talimatlar', icon: BookOpen, requiredPermissions: ['ai:instructions'] },
      { href: '/admin/ai-tasks', label: 'Görevler', icon: ListTodo, requiredPermissions: ['ai:use'] },
      { href: '/admin/ai-memory', label: 'AI Hafıza', icon: Layers, requiredPermissions: ['ai:configure'] },
      { href: '/admin/ai-learning', label: 'Öğrenme Merkezi', icon: GraduationCap, requiredPermissions: ['ai:configure'] },
      { href: '/admin/ai-models', label: 'AI Modelleri', icon: Cpu, requiredPermissions: ['ai:models'] },
      { href: '/admin/ai-performance', label: 'AI Performans', icon: Gauge, requiredPermissions: ['analytics:read'] },
      { href: '/admin/ai-logs', label: 'AI Logları', icon: ScrollText, requiredPermissions: ['logs:view'] },
      { href: '/admin/ai/news', label: 'AI Haber Asistanı', icon: Bot, requiredPermissions: ['ai:use'] },
    ],
  },
  {
    id: 'social',
    label: 'Sosyal Medya',
    items: [
      { href: '/admin/smm', label: '81 İl SMM', icon: Map, requiredPermissions: ['social:view'], badge: 'YENİ' },
      { href: '/admin/social', label: 'Hesaplar', icon: Share2, requiredPermissions: ['social:view'] },
      { href: '/admin/smm/queue', label: 'Paylaşım Kuyruğu', icon: ListTodo, requiredPermissions: ['social:view'] },
      { href: '/admin/social/gorsel', label: 'Görsel Üretici', icon: Film, requiredPermissions: ['social:view'] },
      { href: '/admin/newsletter', label: 'E-posta Bülteni', icon: Mail, requiredPermissions: ['users:read'] },
    ],
  },
  {
    id: 'app-mgmt',
    label: 'Uygulama Yönetimi',
    items: [
      { href: '/admin/page-controls', label: 'Sayfa Kontrolleri', icon: LayoutGrid, requiredPermissions: ['pages:manage'] },
      { href: '/admin/global-layout', label: 'Global Dizilim', icon: Layers, requiredPermissions: ['pages:manage'] },
      { href: '/admin/feed-algorithm', label: 'Feed & Algoritma', icon: SlidersHorizontal, requiredPermissions: ['algorithm:view'] },
      { href: '/admin/seo', label: 'SEO Yönetimi', icon: Search, requiredPermissions: ['seo:read'] },
      { href: '/admin/ads', label: 'Reklam Yönetimi', icon: Megaphone, requiredPermissions: ['seo:edit'] },
      { href: '/admin/menu', label: 'Menü', icon: LayoutGrid, requiredPermissions: ['pages:manage'] },
    ],
  },
  {
    id: 'team',
    label: 'Yönetim',
    items: [
      { href: '/admin/editors', label: 'Editörler', icon: UserCog, requiredPermissions: ['editors:read'] },
      { href: '/admin/authors', label: 'Yazarlar', icon: UserCheck, requiredPermissions: ['authors:read'] },
      { href: '/admin/users', label: 'Admins / Kullanıcılar', icon: Users, requiredPermissions: ['users:read'] },
      { href: '/admin/roles', label: 'Roller & Yetkiler', icon: Shield, requiredPermissions: ['roles:manage'] },
      { href: '/admin/cron', label: 'Cron İzleme', icon: Clock, requiredPermissions: ['cron:read'] },
      { href: '/admin/system-health', label: 'Sistem Sağlığı', icon: Activity, requiredPermissions: ['system:settings'] },
      { href: '/admin/audit-logs', label: 'Loglar', icon: ScrollText, requiredPermissions: ['logs:view'] },
      { href: '/admin/api-management', label: 'API Yönetimi', icon: Key, requiredPermissions: ['system:api_keys'] },
      { href: '/admin/settings', label: 'Ayarlar', icon: Settings, requiredPermissions: ['system:settings'] },
    ],
  },
]

function isActive(pathname: string, search: string, href: string, exact = false): boolean {
  const [path, query = ''] = href.split('?')
  if (exact) return pathname === path && (!query || search.includes(query))
  if (path === '/admin') return pathname === path
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false
  if (!query) {
    // Prefer exact query-less match when another item owns the query
    if (path === '/admin/news' && search.includes('filter=') && href === '/admin/news') return false
    if (path === '/admin/news' && search.includes('category=') && href === '/admin/news') return false
    return pathname === path || pathname.startsWith(`${path}/`)
  }
  return search.includes(query)
}

function NavItemRow({
  item,
  pathname,
  search,
}: {
  item: NavItem
  pathname: string
  search: string
}) {
  const active = isActive(pathname, search, item.href, item.exact)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors duration-150',
        active
          ? 'bg-white/12 text-white'
          : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          active ? 'text-[rgb(var(--color-brand))]' : 'text-slate-400 group-hover:text-slate-200'
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="rounded-full bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {item.badge}
        </span>
      ) : null}
      {active ? <ChevronRight className="h-3 w-3 text-white/40" /> : null}
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
        onClick={() => setOpen((o) => !o)}
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
        <div className="ml-3 mt-0.5 max-h-[min(280px,40vh)] space-y-px overflow-y-auto border-l border-white/10 pl-2.5">
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
  const { user, role, roleLabel, can } = useCmsAuth()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY)
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleGroup = (id: string) => {
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

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.requiredPermissions || item.requiredPermissions.some((p) => can(p))
        ),
      })).filter((group) => group.items.length > 0),
    [can]
  )

  return (
    <aside className="flex h-screen w-[248px] shrink-0 flex-col overflow-hidden bg-[rgb(var(--admin-sidebar))] text-white">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))] shadow-sm">
          <Radio className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight">
            <span className="text-[rgb(var(--color-brand))]">Na</span>Haber CMS
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Newsroom</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-medium text-slate-400">Canlı yayın aktif</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {visibleGroups.map((group) => {
          const isCollapsed = Boolean(collapsed[group.id])
          return (
            <div key={group.id} className="mb-3 px-2.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="mb-1 flex w-full items-center gap-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-300"
              >
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', isCollapsed && '-rotate-90')} />
              </button>
              {!isCollapsed ? (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItemRow key={item.href + item.label} item={item} pathname={pathname} search={search} />
                  ))}
                  {group.id === 'content' && can('news:read') ? <CategoryMenu pathname={pathname} /> : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <div className="space-y-2 border-t border-white/[0.06] px-2.5 py-3">
        {user ? (
          <div className="flex items-center gap-3 rounded-[10px] bg-white/[0.04] px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-xs font-bold text-white">
              {user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.displayName || user.email}</p>
              <span
                className={cn(
                  'mt-0.5 inline-block rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide',
                  CMS_ROLE_COLORS[role]
                )}
              >
                {roleLabel}
              </span>
            </div>
            {role === 'super_admin' ? <Shield className="h-3.5 w-3.5 text-slate-400" /> : null}
          </div>
        ) : null}
        <Link
          href="/"
          className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Uygulamaya Dön
        </Link>
      </div>
    </aside>
  )
}
