'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, Newspaper, Video, Users, UserCog, UserCheck,
  Bot, BarChart3, Search, Clock, Key, Settings, ChevronRight,
  ArrowLeft, Zap, Shield, Radio, TrendingUp, Share2,
  BrainCircuit, ChevronDown, Flame, MapPin, Landmark, Globe,
  Trophy, Cpu, TrendingUp as EkonomiIcon, Heart, FlaskConical,
  Palette, Star, Tag, Utensils, Car, CircleDot, Music, Film,
  Theater, PartyPopper, Swords, Plane, Map, ShieldAlert, CloudRain,
  Leaf, Calendar, Bitcoin, BarChart2, Megaphone, type LucideIcon,
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
  ekonomi: EkonomiIcon,
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

// ── Nav types ─────────────────────────────────────────────────────────────
interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  requiredPermissions?: CmsPermission[]
  exact?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Genel Bakış',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/admin/analytics', label: 'Analitik', icon: BarChart3, requiredPermissions: ['analytics:read'] },
    ],
  },
  {
    label: 'İçerik Yönetimi',
    items: [
      { href: '/admin/news', label: 'Tüm Haberler', icon: Newspaper, requiredPermissions: ['news:read'] },
      { href: '/admin/videos', label: 'Videolar', icon: Video, requiredPermissions: ['video:read'] },
      { href: '/admin/seo', label: 'SEO Yönetimi', icon: Search, requiredPermissions: ['seo:read'] },
      { href: '/admin/ads', label: 'Reklam Yönetimi', icon: Megaphone, requiredPermissions: ['seo:edit'] },
    ],
  },
  {
    label: 'Yapay Zeka',
    items: [
      { href: '/admin/newsroom', label: 'AI Newsroom', icon: BrainCircuit, requiredPermissions: ['ai:use'] },
      { href: '/admin/ai/news', label: 'AI Haber Asistanı', icon: Bot, requiredPermissions: ['ai:use'] },
      { href: '/admin/ai/video', label: 'AI Video Asistanı', icon: Zap, requiredPermissions: ['ai:use'] },
    ],
  },
  {
    label: 'Ekip Yönetimi',
    items: [
      { href: '/admin/editors', label: 'Editörler', icon: UserCog, requiredPermissions: ['editors:read'] },
      { href: '/admin/authors', label: 'Yazarlar', icon: UserCheck, requiredPermissions: ['authors:read'] },
      { href: '/admin/users', label: 'Kullanıcılar', icon: Users, requiredPermissions: ['users:read'] },
    ],
  },
  {
    label: 'Sosyal Medya',
    items: [
      { href: '/admin/social', label: 'Paylaşım Durumu', icon: Share2, requiredPermissions: ['news:read'] },
      { href: '/admin/social/gorsel', label: 'Görsel Üretici', icon: Film, requiredPermissions: ['news:read'] },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { href: '/admin/cron', label: 'Cron İzleme', icon: Clock, requiredPermissions: ['cron:read'] },
      { href: '/admin/api-management', label: 'API Yönetimi', icon: Key, requiredPermissions: ['system:api_keys'] },
      { href: '/admin/settings', label: 'Ayarlar', icon: Settings, requiredPermissions: ['system:settings'] },
    ],
  },
]

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  if (href === '/admin') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavItemRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href, item.exact)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        active ? 'bg-white/15 text-white shadow-sm' : 'text-slate-300 hover:bg-white/8 hover:text-white'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-slate-400 group-hover:text-white')} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
      )}
      {active && <ChevronRight className="h-3 w-3 text-white/50" />}
    </Link>
  )
}

// ── Category submenu ──────────────────────────────────────────────────────
function CategoryMenu({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams()
  const activeCategory = searchParams.get('category')
  const isNewsPage = pathname === '/admin/news'
  const [open, setOpen] = useState(isNewsPage)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
          isNewsPage && !activeCategory
            ? 'bg-white/15 text-white'
            : 'text-slate-300 hover:bg-white/8 hover:text-white'
        )}
      >
        <Tag className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-white" />
        <span className="flex-1 truncate text-left">Kategoriler</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="ml-3 mt-0.5 max-h-[min(420px,50vh)] space-y-px overflow-y-auto border-l border-white/10 pl-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const active = isNewsPage && activeCategory === cat.id
            return (
              <Link
                key={cat.id}
                href={`/admin/news?category=${cat.id}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all',
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-white' : cat.color)} />
                <span className="flex-1 truncate">{cat.label}</span>
                {active && <ChevronRight className="h-2.5 w-2.5 text-white/50" />}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────
export function CMSSidebar() {
  const pathname = usePathname()
  const { user, role, roleLabel, can } = useCmsAuth()

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map(group => ({
        ...group,
        items: group.items.filter(item =>
          !item.requiredPermissions || item.requiredPermissions.some(p => can(p))
        ),
      })).filter(group => group.items.length > 0),
    [can]
  )

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden bg-[#0d1117] text-white">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg">
          <Radio className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-white">NaHaber CMS</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Newsroom</p>
        </div>
      </div>

      {/* Live Indicator */}
      <div className="flex items-center gap-2 border-b border-white/8 px-5 py-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-[11px] font-medium text-slate-400">Canlı Yayın Aktif</span>
        <TrendingUp className="ml-auto h-3 w-3 text-green-500" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {visibleGroups.map(group => (
          <div key={group.label} className="mb-4 px-3">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItemRow key={item.href} item={item} pathname={pathname} />
              ))}
              {group.label === 'İçerik Yönetimi' && can('news:read') && (
                <CategoryMenu pathname={pathname} />
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* User info */}
      <div className="border-t border-white/8 px-3 py-3 space-y-2">
        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
              {user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {user.displayName || user.email}
              </p>
              <span className={cn('inline-block rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide', CMS_ROLE_COLORS[role])}>
                {roleLabel}
              </span>
            </div>
            {role === 'super_admin' && <Shield className="h-3.5 w-3.5 text-purple-400" />}
          </div>
        )}
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Uygulamaya Dön
        </Link>
      </div>
    </aside>
  )
}
