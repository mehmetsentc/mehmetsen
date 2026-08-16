/**
 * Desktop/mobile side nav — ana + alt kategori ağacı.
 * Sıra: site nav / CategoryNav hiyerarşisi; altlar DEFAULT_CATEGORIES.parentId.
 */
import {
  Newspaper,
  MapPin,
  ShieldAlert,
  Trophy,
  Globe2,
  Landmark,
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
  Heart,
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
  CircleDot,
  Music,
  PartyPopper,
  Megaphone,
  Zap,
  Swords,
  BarChart2,
  Bitcoin,
  Briefcase,
  ChartLine,
  Bolt,
  Baby,
  Shirt,
  HeartHandshake,
  Sofa,
  type LucideIcon,
} from 'lucide-react'
import { DEFAULT_CATEGORIES, getSubcategories, type CategoryDef } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

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
  /** Alt kategori (girintili) */
  child?: boolean
  children?: SidebarNavItem[]
}

const ICON_BY_ID: Record<string, LucideIcon> = {
  feed: LayoutGrid,
  gundem: Newspaper,
  yerel: MapPin,
  'yerel-haber': MapPin,
  asayis: ShieldAlert,
  spor: Trophy,
  futbol: CircleDot,
  basketbol: CircleDot,
  voleybol: CircleDot,
  hentbol: CircleDot,
  atletizm: Zap,
  gures: Swords,
  tenis: CircleDot,
  karate: Swords,
  'dunya-kupasi-2026': Trophy,
  dunya: Globe2,
  'kibris-haberleri': Landmark,
  siyaset: Landmark,
  ekonomi: TrendingUp,
  borsa: BarChart2,
  kripto: Bitcoin,
  'finans-piyasa': ChartLine,
  'emlak-konut': Building2,
  enerji: Bolt,
  'is-kariyer': Briefcase,
  egitim: GraduationCap,
  saglik: HeartPulse,
  'cevre-iklim': Leaf,
  'oyun-espor': Gamepad2,
  'din-inanc': Church,
  turizm: Plane,
  gezi: Compass,
  teknoloji: Cpu,
  bilim: FlaskConical,
  yasam: Heart,
  astroloji: Sparkles,
  moda: Shirt,
  'anne-cocuk': Baby,
  dekorasyon: Sofa,
  iliskiler: HeartHandshake,
  gastronomi: UtensilsCrossed,
  otomobil: Car,
  kultur: Palette,
  sinema: Clapperboard,
  tiyatro: Theater,
  konser: Music,
  festival: PartyPopper,
  magazin: Sparkles,
  tarih: ScrollText,
  'yerel-duyuru': Megaphone,
  'yerel-spor': Trophy,
  'yerel-futbol': CircleDot,
  'yerel-basketbol': CircleDot,
  'yerel-voleybol': CircleDot,
  'yerel-hentbol': CircleDot,
  'yerel-atletizm': Zap,
  'yerel-gures': Swords,
  'yerel-tenis': CircleDot,
  'yerel-karate': Swords,
  'yerel-yuzme': CircleDot,
  'yerel-motor-sporlari': Car,
}

const ACCENT_BY_ID: Record<string, SidebarAccent> = {
  gundem: 'gundem',
  yerel: 'yerel',
  'yerel-haber': 'yerel',
  'yerel-duyuru': 'yerel',
  asayis: 'asayis',
  spor: 'spor',
  futbol: 'spor',
  basketbol: 'spor',
  voleybol: 'spor',
  hentbol: 'spor',
  atletizm: 'spor',
  gures: 'spor',
  tenis: 'spor',
  karate: 'spor',
  'yerel-spor': 'spor',
  'yerel-futbol': 'spor',
  'yerel-basketbol': 'spor',
  'yerel-voleybol': 'spor',
  'yerel-hentbol': 'spor',
  'yerel-atletizm': 'spor',
  'yerel-gures': 'spor',
  'yerel-tenis': 'spor',
  'yerel-karate': 'spor',
  'yerel-yuzme': 'spor',
  'yerel-motor-sporlari': 'spor',
  dunya: 'dunya',
  'kibris-haberleri': 'dunya',
  siyaset: 'siyaset',
  ekonomi: 'ekonomi',
  egitim: 'egitim',
  saglik: 'saglik',
  teknoloji: 'teknoloji',
  bilim: 'teknoloji',
  kultur: 'kultur',
  magazin: 'magazin',
  yasam: 'yasam',
  'cevre-iklim': 'ekonomi',
  turizm: 'yerel',
  gezi: 'yerel',
  tarih: 'asayis',
  gastronomi: 'spor',
  otomobil: 'muted',
  'oyun-espor': 'siyaset',
  'din-inanc': 'muted',
}

/**
 * Global kategori sırası — getSiteNavItems / üst menü ile hizalı ana başlıklar.
 * Alt kategoriler getSubcategories ile eklenir.
 */
const SIDEBAR_CATEGORY_ORDER: Array<{
  id: string
  label?: string
  href?: string
  accent?: SidebarAccent
}> = [
  { id: 'gundem' },
  { id: 'yerel', label: 'Yerel Haber', href: ROUTES.LOCAL, accent: 'yerel' },
  { id: 'asayis', label: '3. Sayfa' },
  { id: 'spor' },
  { id: 'dunya' },
  { id: 'kibris-haberleri' },
  { id: 'siyaset' },
  { id: 'ekonomi' },
  { id: 'egitim' },
  { id: 'saglik' },
  { id: 'cevre-iklim' },
  { id: 'oyun-espor' },
  { id: 'din-inanc' },
  { id: 'turizm' },
  { id: 'gezi' },
  { id: 'teknoloji' },
  { id: 'bilim' },
  { id: 'yasam' },
  { id: 'gastronomi' },
  { id: 'otomobil' },
  { id: 'kultur' },
  { id: 'magazin' },
  { id: 'tarih' },
]

function catHref(def: CategoryDef): string {
  return ROUTES.CATEGORY(def.slug ?? def.id)
}

function toChildItem(def: CategoryDef, parentAccent: SidebarAccent): SidebarNavItem {
  return {
    id: def.id,
    label: def.name,
    href: catHref(def),
    icon: ICON_BY_ID[def.id] ?? Newspaper,
    accent: ACCENT_BY_ID[def.id] ?? parentAccent,
    child: true,
  }
}

function buildCategoryItem(entry: (typeof SIDEBAR_CATEGORY_ORDER)[number]): SidebarNavItem | null {
  if (entry.id === 'yerel') {
    return {
      id: 'yerel',
      label: entry.label ?? 'Yerel Haber',
      href: entry.href ?? ROUTES.LOCAL,
      icon: MapPin,
      accent: 'yerel',
    }
  }

  const def = DEFAULT_CATEGORIES.find((c) => c.id === entry.id)
  if (!def) return null

  const accent = entry.accent ?? ACCENT_BY_ID[def.id] ?? 'muted'
  // Kıbrıs alt kategorileri CMS'te seçilir; sidebar'ı şişirmemek için children yok (yerel gibi).
  const children =
    def.id === 'kibris-haberleri'
      ? []
      : getSubcategories(def.id).map((sub) => toChildItem(sub, accent))

  return {
    id: def.id,
    label: entry.label ?? def.name,
    href: catHref(def),
    icon: ICON_BY_ID[def.id] ?? Newspaper,
    accent,
    children: children.length > 0 ? children : undefined,
  }
}

/** Ana Sayfa + tüm ana/alt kategoriler (tek düz ağaç, global sıra). */
export const SIDEBAR_CATEGORIES: SidebarNavItem[] = [
  { id: 'feed', label: 'Ana Sayfa', href: ROUTES.FEED, icon: LayoutGrid, accent: 'brand' },
  ...SIDEBAR_CATEGORY_ORDER.map(buildCategoryItem).filter(
    (item): item is SidebarNavItem => item !== null
  ),
]

/** @deprecated SIDEBAR_CATEGORIES kullanın — geriye dönük uyumluluk */
export const SIDEBAR_PRIMARY: SidebarNavItem[] = SIDEBAR_CATEGORIES.filter(
  (item) =>
    ['feed', 'gundem', 'yerel', 'asayis', 'spor', 'dunya', 'kibris-haberleri', 'siyaset', 'ekonomi'].includes(
      item.id
    )
)

/** @deprecated SIDEBAR_CATEGORIES kullanın */
export const SIDEBAR_EXPLORE: SidebarNavItem[] = SIDEBAR_CATEGORIES.filter(
  (item) =>
    ![
      'feed',
      'gundem',
      'yerel',
      'asayis',
      'spor',
      'dunya',
      'kibris-haberleri',
      'siyaset',
      'ekonomi',
    ].includes(item.id)
)

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

/** Keşfet önizleme — tam listeye geçildi; 0 = hepsi açık */
export const SIDEBAR_EXPLORE_PREVIEW = 0

/** Category icon/accent lookup for city sidebar and other scoped nav surfaces. */
export function getSidebarCategoryIcon(categoryId: string): LucideIcon {
  return ICON_BY_ID[categoryId] ?? Newspaper
}

export function getSidebarCategoryAccent(categoryId: string): SidebarAccent {
  return ACCENT_BY_ID[categoryId] ?? 'muted'
}

/** Düz liste: ana + çocuklar (render için). */
export function flattenSidebarItems(items: SidebarNavItem[]): SidebarNavItem[] {
  const out: SidebarNavItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.children?.length) {
      out.push(...item.children)
    }
  }
  return out
}
