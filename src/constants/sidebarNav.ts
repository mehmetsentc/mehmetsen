/**
 * Desktop/mobile side nav bilgi mimarisi — üst menü A bloğu ile aynı sıra.
 * B = Keşfet (collapse), C = Araçlar.
 */
import {
  Newspaper,
  MapPin,
  ShieldAlert,
  Trophy,
  Globe2,
  Landmark,
  Scale,
  TrendingUp,
  GraduationCap,
  HeartPulse,
  Leaf,
  Gamepad2,
  Church,
  Plane,
  Compass,
  Cpu,
  FlaskConical,
  Home,
  Sparkles,
  UtensilsCrossed,
  Car,
  Palette,
  Clapperboard,
  Theater,
  Star,
  ScrollText,
  LayoutGrid,
  CalendarDays,
  Flame,
  Cloud,
  Building2,
  type LucideIcon,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'

export type SidebarAccent =
  | 'brand'
  | 'gundem'
  | 'yerel'
  | 'asayis'
  | 'spor'
  | 'dunya'
  | 'siyaset'
  | 'ekonomi'
  | 'egitim'
  | 'saglik'
  | 'teknoloji'
  | 'kultur'
  | 'magazin'
  | 'yasam'
  | 'hava'
  | 'muted'

export interface SidebarNavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  accent: SidebarAccent
}

function cat(id: string, label?: string): { id: string; label: string; href: string } | null {
  const def = DEFAULT_CATEGORIES.find((c) => c.id === id)
  if (!def) return null
  return {
    id,
    label: label ?? def.name,
    href: ROUTES.CATEGORY(def.slug ?? def.id),
  }
}

/** A — Ana haber (üst menü ile hizalı) */
export const SIDEBAR_PRIMARY: SidebarNavItem[] = [
  { id: 'feed', label: 'Ana Sayfa', href: ROUTES.FEED, icon: LayoutGrid, accent: 'brand' },
  { ...cat('gundem')!, icon: Newspaper, accent: 'gundem' },
  { id: 'yerel', label: 'Yerel Haber', href: ROUTES.LOCAL, icon: MapPin, accent: 'yerel' },
  { ...cat('asayis', '3. Sayfa')!, icon: ShieldAlert, accent: 'asayis' },
  { ...cat('spor')!, icon: Trophy, accent: 'spor' },
  { ...cat('dunya')!, icon: Globe2, accent: 'dunya' },
  { ...cat('kibris-haberleri')!, icon: Landmark, accent: 'dunya' },
  { ...cat('siyaset')!, icon: Scale, accent: 'siyaset' },
  { ...cat('ekonomi')!, icon: TrendingUp, accent: 'ekonomi' },
]

/** B — Keşfet (varsayılan kapalı “Daha fazla”) */
export const SIDEBAR_EXPLORE: SidebarNavItem[] = [
  { ...cat('saglik')!, icon: HeartPulse, accent: 'saglik' },
  { ...cat('egitim')!, icon: GraduationCap, accent: 'egitim' },
  { ...cat('teknoloji')!, icon: Cpu, accent: 'teknoloji' },
  { ...cat('bilim')!, icon: FlaskConical, accent: 'teknoloji' },
  { ...cat('cevre-iklim')!, icon: Leaf, accent: 'ekonomi' },
  { ...cat('yasam')!, icon: Home, accent: 'yasam' },
  { ...cat('kultur')!, icon: Palette, accent: 'kultur' },
  { ...cat('magazin')!, icon: Sparkles, accent: 'magazin' },
  { ...cat('turizm')!, icon: Plane, accent: 'yerel' },
  { ...cat('gezi')!, icon: Compass, accent: 'yerel' },
  { ...cat('tarih')!, icon: ScrollText, accent: 'asayis' },
  { ...cat('gastronomi')!, icon: UtensilsCrossed, accent: 'spor' },
  { ...cat('otomobil')!, icon: Car, accent: 'muted' },
  { ...cat('oyun-espor')!, icon: Gamepad2, accent: 'siyaset' },
  { ...cat('din-inanc')!, icon: Church, accent: 'muted' },
  ...(cat('sinema')
    ? [{ ...cat('sinema')!, icon: Clapperboard, accent: 'kultur' as const }]
    : []),
  ...(cat('tiyatro')
    ? [{ ...cat('tiyatro')!, icon: Theater, accent: 'kultur' as const }]
    : []),
].filter(Boolean) as SidebarNavItem[]

/** C — Araçlar / ürün yüzeyleri */
export const SIDEBAR_TOOLS: SidebarNavItem[] = [
  { id: 'skor', label: 'Skor', href: ROUTES.SKOR, icon: Trophy, accent: 'spor' },
  { id: 'etkinlikler', label: 'Etkinlikler', href: ROUTES.EVENTS, icon: CalendarDays, accent: 'yerel' },
  { id: 'teve', label: 'Teve', href: ROUTES.REELS, icon: Clapperboard, accent: 'magazin' },
  { id: 'trending', label: 'Trending', href: '/kategori/trend', icon: Flame, accent: 'gundem' },
  { id: 'influencer', label: 'Influencer', href: ROUTES.INFLUENCER, icon: Star, accent: 'magazin' },
  { id: 'muzeler', label: 'Müzeler', href: ROUTES.MUZELER, icon: Building2, accent: 'kultur' },
  { id: 'hava', label: 'Hava Durumu', href: ROUTES.WEATHER, icon: Cloud, accent: 'hava' },
]

/** Keşfet’te ilk N satır her zaman görünür; kalanı “Daha fazla” */
export const SIDEBAR_EXPLORE_PREVIEW = 6
