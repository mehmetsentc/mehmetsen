import { ROUTES } from '@/constants/routes'

// P17.7 Editorial Safety Gate Version Constant
export const EDITORIAL_SAFETY_VERSION = 'v17.7' as const

// TODO: Implement in Phase 1
export const APP_CONFIG = {
  NAME: 'NaHaber',
  DESCRIPTION: 'Güncel haberleri takip et, paylaş ve tartış.',
  POSTS_PER_PAGE: 10,
  COMMENTS_PER_PAGE: 20,
  MAX_IMAGE_SIZE_MB: 2,
  MAX_VIDEO_SIZE_MB: 50,
  MAX_IMAGES_PER_POST: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm'],
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  POST_TITLE_MAX_LENGTH: 150,
  POST_SUMMARY_MAX_LENGTH: 200,
} as const

export interface CategoryDef {
  id: string
  name: string
  slug: string
  iconName: string
  color: string
  /** Parent category id — defines a subcategory relationship */
  parentId?: string
  /**
   * When true, this subcategory's articles are ISOLATED — they appear only
   * on their own page and NOT in the parent's feed query.
   * The chip still shows on the parent page for navigation.
   */
  standalone?: boolean
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // ── Ana kategoriler ─────────────────────────────────────────────────────────
  { id: 'trend',       name: 'Trending',    slug: 'trend',       iconName: 'flame',        color: '#FF6B35' },
  { id: 'gundem',      name: 'Gündem',      slug: 'gundem',      iconName: 'newspaper',    color: '#EF4444' },
  { id: 'yerel-haber', name: 'Yerel Haber', slug: 'yerel-haber', iconName: 'map-pin',      color: '#059669' },
  { id: 'yerel-asayis',   name: 'Yerel Asayiş',   slug: 'yerel-asayis',   iconName: 'shield-alert', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-gundem',   name: 'Yerel Gündem',   slug: 'yerel-gundem',   iconName: 'newspaper',    color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-siyaset',  name: 'Yerel Siyaset',  slug: 'yerel-siyaset',  iconName: 'landmark',     color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-spor',     name: 'Yerel Spor',     slug: 'yerel-spor',     iconName: 'trophy',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-futbol',   name: 'Yerel Futbol',   slug: 'yerel-futbol',   iconName: 'circle-dot',   color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-basketbol', name: 'Yerel Basketbol', slug: 'yerel-basketbol', iconName: 'circle',     color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-voleybol', name: 'Yerel Voleybol', slug: 'yerel-voleybol', iconName: 'circle',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-hentbol',  name: 'Yerel Hentbol',  slug: 'yerel-hentbol',  iconName: 'circle',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-atletizm', name: 'Yerel Atletizm', slug: 'yerel-atletizm', iconName: 'zap',          color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-gures',    name: 'Yerel Güreş',    slug: 'yerel-gures',    iconName: 'swords',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-tenis',    name: 'Yerel Tenis',    slug: 'yerel-tenis',    iconName: 'circle',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-karate',   name: 'Yerel Karate',   slug: 'yerel-karate',   iconName: 'swords',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-yuzme',    name: 'Yerel Yüzme',    slug: 'yerel-yuzme',    iconName: 'waves',        color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-motor-sporlari', name: 'Yerel Motor Sporları', slug: 'yerel-motor-sporlari', iconName: 'gauge', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-etkinlik', name: 'Yerel Etkinlik', slug: 'yerel-etkinlik', iconName: 'calendar',     color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-sinema',   name: 'Yerel Sinema',   slug: 'yerel-sinema',   iconName: 'film',         color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-kultur',   name: 'Yerel Kültür',   slug: 'yerel-kultur',   iconName: 'palette',      color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-konser',   name: 'Yerel Konser',   slug: 'yerel-konser',   iconName: 'music',        color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-magazin',  name: 'Yerel Magazin',  slug: 'yerel-magazin',  iconName: 'star',         color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-saglik',   name: 'Yerel Sağlık',   slug: 'yerel-saglik',   iconName: 'heart',        color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-yasam',    name: 'Yerel Yaşam',    slug: 'yerel-yasam',    iconName: 'leaf',         color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-gezi',     name: 'Yerel Gezi',     slug: 'yerel-gezi',     iconName: 'map',          color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-egitim',   name: 'Yerel Eğitim',   slug: 'yerel-egitim',   iconName: 'graduation-cap', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-finans',   name: 'Yerel Finans',   slug: 'yerel-finans',   iconName: 'chart-line',   color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-kariyer',  name: 'Yerel Kariyer',  slug: 'yerel-kariyer',  iconName: 'briefcase',    color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-ekonomi',  name: 'Yerel Ekonomi',  slug: 'yerel-ekonomi',  iconName: 'trending-up',  color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-emlak',    name: 'Yerel Emlak',    slug: 'yerel-emlak',    iconName: 'building-2',   color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-enerji',   name: 'Yerel Enerji',   slug: 'yerel-enerji',   iconName: 'bolt',         color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-teknoloji', name: 'Yerel Teknoloji', slug: 'yerel-teknoloji', iconName: 'cpu',       color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-bilim',    name: 'Yerel Bilim',    slug: 'yerel-bilim',    iconName: 'flask',        color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-cevre-iklim', name: 'Yerel Çevre & İklim', slug: 'yerel-cevre-iklim', iconName: 'tree-pine', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-oyun-espor', name: 'Yerel Oyun & Espor', slug: 'yerel-oyun-espor', iconName: 'gamepad-2', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-din-inanc', name: 'Yerel Din & İnanç', slug: 'yerel-din-inanc', iconName: 'moon-star', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-tiyatro',  name: 'Yerel Tiyatro',  slug: 'yerel-tiyatro',  iconName: 'theater',      color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-festival', name: 'Yerel Festival', slug: 'yerel-festival', iconName: 'party-popper', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-gastronomi', name: 'Yerel Gastronomi', slug: 'yerel-gastronomi', iconName: 'utensils', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-otomobil', name: 'Yerel Otomobil', slug: 'yerel-otomobil', iconName: 'car',          color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-meteoroloji', name: 'Yerel Meteoroloji', slug: 'yerel-meteoroloji', iconName: 'cloud-rain', color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-turizm',   name: 'Yerel Turizm',   slug: 'yerel-turizm',   iconName: 'plane',        color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-tarih',    name: 'Yerel Tarih',    slug: 'yerel-tarih',    iconName: 'book-open',    color: '#059669', parentId: 'yerel-haber' },
  { id: 'yerel-duyuru',   name: 'Yerel Duyuru',   slug: 'yerel-duyuru',   iconName: 'megaphone',    color: '#059669', parentId: 'yerel-haber' },
  { id: 'siyaset',     name: 'Siyaset',     slug: 'siyaset',     iconName: 'landmark',     color: '#7C3AED' },
  { id: 'dunya',       name: 'Dünya',       slug: 'dunya',       iconName: 'globe',        color: '#6B7280' },
  { id: 'kibris-haberleri', name: 'Kıbrıs Haberleri', slug: 'kibris-haberleri', iconName: 'flag', color: '#0E7490' },
  { id: 'kibris-asayis',   name: 'Kıbrıs Asayiş',   slug: 'kibris-asayis',   iconName: 'shield-alert', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-gundem',   name: 'Kıbrıs Gündem',   slug: 'kibris-gundem',   iconName: 'newspaper',    color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-siyaset',  name: 'Kıbrıs Siyaset',  slug: 'kibris-siyaset',  iconName: 'landmark',     color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-spor',     name: 'Kıbrıs Spor',     slug: 'kibris-spor',     iconName: 'trophy',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-futbol',   name: 'Kıbrıs Futbol',   slug: 'kibris-futbol',   iconName: 'circle-dot',   color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-basketbol', name: 'Kıbrıs Basketbol', slug: 'kibris-basketbol', iconName: 'circle',     color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-voleybol', name: 'Kıbrıs Voleybol', slug: 'kibris-voleybol', iconName: 'circle',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-hentbol',  name: 'Kıbrıs Hentbol',  slug: 'kibris-hentbol',  iconName: 'circle',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-atletizm', name: 'Kıbrıs Atletizm', slug: 'kibris-atletizm', iconName: 'zap',          color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-gures',    name: 'Kıbrıs Güreş',    slug: 'kibris-gures',    iconName: 'swords',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-tenis',    name: 'Kıbrıs Tenis',    slug: 'kibris-tenis',    iconName: 'circle',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-karate',   name: 'Kıbrıs Karate',   slug: 'kibris-karate',   iconName: 'swords',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-yuzme',    name: 'Kıbrıs Yüzme',    slug: 'kibris-yuzme',    iconName: 'waves',        color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-motor-sporlari', name: 'Kıbrıs Motor Sporları', slug: 'kibris-motor-sporlari', iconName: 'gauge', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-etkinlik', name: 'Kıbrıs Etkinlik', slug: 'kibris-etkinlik', iconName: 'calendar',     color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-sinema',   name: 'Kıbrıs Sinema',   slug: 'kibris-sinema',   iconName: 'film',         color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-kultur',   name: 'Kıbrıs Kültür',   slug: 'kibris-kultur',   iconName: 'palette',      color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-konser',   name: 'Kıbrıs Konser',   slug: 'kibris-konser',   iconName: 'music',        color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-magazin',  name: 'Kıbrıs Magazin',  slug: 'kibris-magazin',  iconName: 'star',         color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-saglik',   name: 'Kıbrıs Sağlık',   slug: 'kibris-saglik',   iconName: 'heart',        color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-yasam',    name: 'Kıbrıs Yaşam',    slug: 'kibris-yasam',    iconName: 'leaf',         color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-gezi',     name: 'Kıbrıs Gezi',     slug: 'kibris-gezi',     iconName: 'map',          color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-egitim',   name: 'Kıbrıs Eğitim',   slug: 'kibris-egitim',   iconName: 'graduation-cap', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-finans',   name: 'Kıbrıs Finans',   slug: 'kibris-finans',   iconName: 'chart-line',   color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-kariyer',  name: 'Kıbrıs Kariyer',  slug: 'kibris-kariyer',  iconName: 'briefcase',    color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-ekonomi',  name: 'Kıbrıs Ekonomi',  slug: 'kibris-ekonomi',  iconName: 'trending-up',  color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-emlak',    name: 'Kıbrıs Emlak',    slug: 'kibris-emlak',    iconName: 'building-2',   color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-enerji',   name: 'Kıbrıs Enerji',   slug: 'kibris-enerji',   iconName: 'bolt',         color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-teknoloji', name: 'Kıbrıs Teknoloji', slug: 'kibris-teknoloji', iconName: 'cpu',       color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-bilim',    name: 'Kıbrıs Bilim',    slug: 'kibris-bilim',    iconName: 'flask',        color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-cevre-iklim', name: 'Kıbrıs Çevre & İklim', slug: 'kibris-cevre-iklim', iconName: 'tree-pine', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-oyun-espor', name: 'Kıbrıs Oyun & Espor', slug: 'kibris-oyun-espor', iconName: 'gamepad-2', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-din-inanc', name: 'Kıbrıs Din & İnanç', slug: 'kibris-din-inanc', iconName: 'moon-star', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-tiyatro',  name: 'Kıbrıs Tiyatro',  slug: 'kibris-tiyatro',  iconName: 'theater',      color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-festival', name: 'Kıbrıs Festival', slug: 'kibris-festival', iconName: 'party-popper', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-gastronomi', name: 'Kıbrıs Gastronomi', slug: 'kibris-gastronomi', iconName: 'utensils', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-otomobil', name: 'Kıbrıs Otomobil', slug: 'kibris-otomobil', iconName: 'car',          color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-meteoroloji', name: 'Kıbrıs Meteoroloji', slug: 'kibris-meteoroloji', iconName: 'cloud-rain', color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-turizm',   name: 'Kıbrıs Turizm',   slug: 'kibris-turizm',   iconName: 'plane',        color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-tarih',    name: 'Kıbrıs Tarih',    slug: 'kibris-tarih',    iconName: 'book-open',    color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'kibris-duyuru',   name: 'Kıbrıs Duyuru',   slug: 'kibris-duyuru',   iconName: 'megaphone',    color: '#0E7490', parentId: 'kibris-haberleri' },
  { id: 'ekonomi',     name: 'Ekonomi',     slug: 'ekonomi',     iconName: 'trending-up',  color: '#F59E0B' },
  { id: 'borsa',       name: 'Borsa',       slug: 'borsa',       iconName: 'bar-chart-2',  color: '#22C55E', parentId: 'ekonomi', standalone: true },
  { id: 'kripto',      name: 'Kripto',      slug: 'kripto',      iconName: 'bitcoin',      color: '#F7931A', parentId: 'ekonomi', standalone: true },
  { id: 'finans-piyasa', name: 'Finans & Piyasa', slug: 'finans-piyasa', iconName: 'chart-line', color: '#D97706', parentId: 'ekonomi' },
  { id: 'emlak-konut', name: 'Emlak & Konut', slug: 'emlak-konut', iconName: 'building-2', color: '#B45309', parentId: 'ekonomi' },
  { id: 'enerji',      name: 'Enerji',      slug: 'enerji',      iconName: 'bolt',         color: '#CA8A04', parentId: 'ekonomi' },
  { id: 'is-kariyer',  name: 'İş & Kariyer', slug: 'is-kariyer', iconName: 'briefcase',    color: '#A16207', parentId: 'ekonomi' },
  { id: 'teknoloji',   name: 'Teknoloji',   slug: 'teknoloji',   iconName: 'cpu',          color: '#3B82F6' },
  { id: 'saglik',      name: 'Sağlık',      slug: 'saglik',      iconName: 'heart',        color: '#EC4899' },
  { id: 'bilim',       name: 'Bilim',       slug: 'bilim',       iconName: 'flask',        color: '#14B8A6' },
  { id: 'egitim',      name: 'Eğitim',      slug: 'egitim',      iconName: 'graduation-cap', color: '#2563EB' },
  { id: 'cevre-iklim', name: 'Çevre & İklim', slug: 'cevre-iklim', iconName: 'tree-pine', color: '#15803D' },
  { id: 'oyun-espor',  name: 'Oyun & Espor', slug: 'oyun-espor', iconName: 'gamepad-2',    color: '#7C3AED' },
  { id: 'din-inanc',   name: 'Din & İnanç', slug: 'din-inanc',  iconName: 'moon-star',    color: '#0F766E' },
  { id: 'magazin',     name: 'Magazin',     slug: 'magazin',     iconName: 'star',         color: '#F472B6' },

  // ── Spor + alt kategoriler ──────────────────────────────────────────────────
  { id: 'spor',              name: 'Spor',             slug: 'spor',              iconName: 'trophy',       color: '#10B981' },
  { id: 'futbol',            name: 'Futbol',           slug: 'futbol',            iconName: 'circle-dot',   color: '#10B981', parentId: 'spor', standalone: true },
  { id: 'basketbol',         name: 'Basketbol',        slug: 'basketbol',         iconName: 'circle',       color: '#10B981', parentId: 'spor', standalone: true },
  { id: 'voleybol',          name: 'Voleybol',         slug: 'voleybol',          iconName: 'circle',       color: '#10B981', parentId: 'spor', standalone: true },
  { id: 'hentbol',           name: 'Hentbol',          slug: 'hentbol',           iconName: 'circle',       color: '#10B981', parentId: 'spor' },
  { id: 'atletizm',          name: 'Atletizm',         slug: 'atletizm',          iconName: 'zap',          color: '#10B981', parentId: 'spor' },
  { id: 'gures',             name: 'Güreş',            slug: 'gures',             iconName: 'swords',       color: '#10B981', parentId: 'spor' },
  { id: 'tenis',             name: 'Tenis',            slug: 'tenis',             iconName: 'circle',       color: '#10B981', parentId: 'spor' },
  { id: 'karate',            name: 'Karate',           slug: 'karate',            iconName: 'swords',       color: '#10B981', parentId: 'spor' },
  { id: 'dunya-kupasi-2026', name: '2026 Dünya Kupası (Arşiv)', slug: 'dunya-kupasi-2026', iconName: 'trophy',      color: '#F59E0B', parentId: 'spor', standalone: true },

  // ── Kültür + alt kategoriler ────────────────────────────────────────────────
  { id: 'kultur',      name: 'Kültür',      slug: 'kultur',      iconName: 'palette',      color: '#8B5CF6' },
  { id: 'sinema',      name: 'Sinema',      slug: 'sinema',      iconName: 'film',         color: '#8B5CF6', parentId: 'kultur' },
  { id: 'tiyatro',     name: 'Tiyatro',     slug: 'tiyatro',     iconName: 'theater',      color: '#8B5CF6', parentId: 'kultur' },
  { id: 'konser',      name: 'Konser',      slug: 'konser',      iconName: 'music',        color: '#8B5CF6', parentId: 'kultur' },
  { id: 'festival',    name: 'Festival',    slug: 'festival',    iconName: 'party-popper', color: '#8B5CF6', parentId: 'kultur' },

  // ── Yaşam + alt kategoriler ─────────────────────────────────────────────────
  { id: 'yasam',         name: 'Yaşam',         slug: 'yasam',         iconName: 'leaf',        color: '#16A34A' },
  { id: 'astroloji',     name: 'Astroloji',     slug: 'astroloji',     iconName: 'sparkles',    color: '#7C3AED', parentId: 'yasam' },
  { id: 'moda',          name: 'Moda',           slug: 'moda',          iconName: 'shirt',       color: '#DB2777', parentId: 'yasam' },
  { id: 'anne-cocuk',    name: 'Anne & Çocuk',   slug: 'anne-cocuk',    iconName: 'baby',        color: '#E879F9', parentId: 'yasam' },
  { id: 'dekorasyon',    name: 'Dekorasyon',     slug: 'dekorasyon',    iconName: 'sofa',        color: '#C2410C', parentId: 'yasam' },
  { id: 'iliskiler',     name: 'İlişkiler',      slug: 'iliskiler',     iconName: 'heart-handshake', color: '#E11D48', parentId: 'yasam' },
  { id: 'gastronomi',    name: 'Gastronomi',    slug: 'gastronomi',    iconName: 'utensils',    color: '#F97316' },
  { id: 'otomobil',      name: 'Otomobil',      slug: 'otomobil',      iconName: 'car',         color: '#64748B' },
  { id: 'meteoroloji',   name: 'Meteoroloji',   slug: 'meteoroloji',   iconName: 'cloud-rain',  color: '#0EA5E9' },
  { id: 'turizm',        name: 'Turizm',        slug: 'turizm',        iconName: 'plane',       color: '#0284C7' },
  { id: 'gezi',          name: 'Gezi',          slug: 'gezi',          iconName: 'map',         color: '#0891B2' },
  { id: 'asayis',        name: 'Asayiş',        slug: 'asayis',        iconName: 'shield-alert', color: '#B45309' },

  // ── Tarih ───────────────────────────────────────────────────────────────────
  { id: 'tarih',         name: 'Tarih',         slug: 'tarih',         iconName: 'book-open',   color: '#92400E' },

  // ── Özel kategoriler ────────────────────────────────────────────────────────
  { id: 'son-dakika',    name: 'Son Dakika',    slug: 'son-dakika',    iconName: 'zap',         color: '#EF4444' },
  { id: 'etkinlikler',   name: 'Etkinlikler',   slug: 'etkinlikler',   iconName: 'calendar',    color: '#8B5CF6' },
  /** Cross-source duplicate stubs — hidden from main nav, audit-only */
  { id: 'tekrarlayan',   name: 'Tekrarlayan Haber', slug: 'tekrarlayan', iconName: 'copy',    color: '#9CA3AF', standalone: true },
]

/** Category id for AI-skipped cross-source duplicate stubs */
export const TEKRARLAYAN_CATEGORY_ID = 'tekrarlayan'

/** Admin CMS haber editörü — gruplu kategori seçici (tek kaynak: DEFAULT_CATEGORIES). */
const ADMIN_CATEGORY_GROUP_DEFS: Array<{ label: string; ids: string[] }> = [
  { label: 'Genel', ids: ['trend', 'gundem', 'yerel-haber', 'siyaset', 'dunya', 'kibris-haberleri', 'asayis', 'son-dakika'] },
  { label: 'Ekonomi', ids: ['ekonomi'] },
  { label: 'Spor', ids: ['spor'] },
  { label: 'Teknoloji & Bilim', ids: ['teknoloji', 'bilim', 'oyun-espor'] },
  { label: 'Eğitim & Toplum', ids: ['egitim', 'cevre-iklim', 'din-inanc'] },
  { label: 'Yaşam & Turizm', ids: ['saglik', 'yasam', 'astroloji', 'gastronomi', 'turizm', 'gezi', 'otomobil', 'meteoroloji'] },
  { label: 'Kültür & Magazin', ids: ['kultur', 'magazin'] },
  { label: 'Tarih', ids: ['tarih'] },
  { label: 'Özel', ids: ['etkinlikler'] },
]

export function getAdminCategoryGroups(): Array<{ label: string; categories: CategoryDef[] }> {
  const used = new Set<string>()

  const groups = ADMIN_CATEGORY_GROUP_DEFS.map(({ label, ids }) => ({
    label,
    categories: ids.flatMap((id) => {
      const parent = DEFAULT_CATEGORIES.find((c) => c.id === id)
      if (!parent) return []
      const items =
        id === YEREL_HABER_CATEGORY_ID || id === KIBRIS_HABERLERI_CATEGORY_ID
          ? [parent]
          : [parent, ...getSubcategories(id)]
      return items.filter((cat) => {
        if (used.has(cat.id)) return false
        used.add(cat.id)
        return true
      })
    }),
  })).filter((g) => g.categories.length > 0)

  const remaining = DEFAULT_CATEGORIES.filter((c) => !used.has(c.id))
  if (remaining.length > 0) {
    groups.push({ label: 'Diğer', categories: remaining })
  }

  return groups
}

/** Returns subcategories of a given parent category id */
export function getSubcategories(parentId: string): CategoryDef[] {
  return DEFAULT_CATEGORIES.filter((c) => c.parentId === parentId)
}

/** Returns the parent category for a given category id */
export function getParentCategory(categoryId: string): CategoryDef | undefined {
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat?.parentId) return undefined
  return DEFAULT_CATEGORIES.find((c) => c.id === cat.parentId)
}

export const SPOR_CATEGORY_ID = 'spor'

/** Admin Haberler spor alt chip sırası (ulusal branşlar). */
export const SPOR_ADMIN_SUBCATEGORY_ORDER = [
  'futbol',
  'basketbol',
  'voleybol',
  'hentbol',
  'gures',
  'tenis',
  'karate',
  'atletizm',
  'dunya-kupasi-2026',
] as const

/** National sport branches for CMS filters (Futbol, Basketbol, …). */
export function getSporSubcategories(): CategoryDef[] {
  const subs = getSubcategories(SPOR_CATEGORY_ID)
  const byId = new Map(subs.map((c) => [c.id, c]))
  const ordered: CategoryDef[] = []
  for (const id of SPOR_ADMIN_SUBCATEGORY_ORDER) {
    const cat = byId.get(id)
    if (cat) ordered.push(cat)
  }
  for (const cat of subs) {
    if (!ordered.some((c) => c.id === cat.id)) ordered.push(cat)
  }
  return ordered
}

export function isNationalSporCategory(categoryId: string): boolean {
  const id = categoryId?.trim().toLowerCase() ?? ''
  if (id === SPOR_CATEGORY_ID) return true
  return getParentCategory(id)?.id === SPOR_CATEGORY_ID
}

/** spor + ulusal branş id'leri (yerel aynalar hariç). */
export function getNationalSporFamilyIds(): string[] {
  return [SPOR_CATEGORY_ID, ...getSubcategories(SPOR_CATEGORY_ID).map((c) => c.id)]
}

export const YEREL_HABER_CATEGORY_ID = 'yerel-haber'

/**
 * Registered Yerel subcategory ids (prompt order + completeness check).
 * CMS/mobile pickers use `getYerelSubcategories()` (Turkish A–Z by short label).
 */
export const YEREL_SUBCATEGORY_IDS = [
  'yerel-asayis',
  'yerel-gundem',
  'yerel-siyaset',
  'yerel-spor',
  'yerel-futbol',
  'yerel-basketbol',
  'yerel-voleybol',
  'yerel-hentbol',
  'yerel-atletizm',
  'yerel-gures',
  'yerel-tenis',
  'yerel-karate',
  'yerel-yuzme',
  'yerel-motor-sporlari',
  'yerel-ekonomi',
  'yerel-finans',
  'yerel-emlak',
  'yerel-enerji',
  'yerel-kariyer',
  'yerel-teknoloji',
  'yerel-etkinlik',
  'yerel-sinema',
  'yerel-kultur',
  'yerel-tiyatro',
  'yerel-konser',
  'yerel-festival',
  'yerel-magazin',
  'yerel-yasam',
  'yerel-saglik',
  'yerel-bilim',
  'yerel-egitim',
  'yerel-cevre-iklim',
  'yerel-din-inanc',
  'yerel-gastronomi',
  'yerel-otomobil',
  'yerel-meteoroloji',
  'yerel-turizm',
  'yerel-gezi',
  'yerel-tarih',
  'yerel-oyun-espor',
  'yerel-duyuru',
] as const


export const KIBRIS_HABERLERI_CATEGORY_ID = 'kibris-haberleri'

/**
 * Registered Kıbrıs subcategory ids (same topics as Yerel, under kibris-haberleri).
 * CMS/mobile pickers use `getKibrisSubcategories()` (Turkish A–Z by short label).
 */
export const KIBRIS_SUBCATEGORY_IDS = [
  'kibris-asayis',
  'kibris-gundem',
  'kibris-siyaset',
  'kibris-spor',
  'kibris-futbol',
  'kibris-basketbol',
  'kibris-voleybol',
  'kibris-hentbol',
  'kibris-atletizm',
  'kibris-gures',
  'kibris-tenis',
  'kibris-karate',
  'kibris-yuzme',
  'kibris-motor-sporlari',
  'kibris-ekonomi',
  'kibris-finans',
  'kibris-emlak',
  'kibris-enerji',
  'kibris-kariyer',
  'kibris-teknoloji',
  'kibris-etkinlik',
  'kibris-sinema',
  'kibris-kultur',
  'kibris-tiyatro',
  'kibris-konser',
  'kibris-festival',
  'kibris-magazin',
  'kibris-yasam',
  'kibris-saglik',
  'kibris-bilim',
  'kibris-egitim',
  'kibris-cevre-iklim',
  'kibris-din-inanc',
  'kibris-gastronomi',
  'kibris-otomobil',
  'kibris-meteoroloji',
  'kibris-turizm',
  'kibris-gezi',
  'kibris-tarih',
  'kibris-oyun-espor',
  'kibris-duyuru',
] as const

const KIBRIS_CATEGORY_IDS = new Set([KIBRIS_HABERLERI_CATEGORY_ID])

/** Short label for Kıbrıs subcategories in admin dropdowns (e.g. "Kıbrıs Gündem" → "Gündem"). */
export function getKibrisSubcategoryShortLabel(cat: CategoryDef): string {
  if (cat.id === KIBRIS_HABERLERI_CATEGORY_ID || !cat.parentId) return cat.name
  if (KIBRIS_CATEGORY_IDS.has(cat.parentId)) {
    return cat.name.replace(/^Kıbrıs\s+/i, '')
  }
  return cat.name
}

/**
 * Kıbrıs child categories for CMS / mobile pickers.
 * Same topic set as Yerel, sorted by Turkish short label.
 */
export function getKibrisSubcategories(): CategoryDef[] {
  const subs = getSubcategories(KIBRIS_HABERLERI_CATEGORY_ID)
  const byId = new Map(subs.map((c) => [c.id, c]))
  const ordered = KIBRIS_SUBCATEGORY_IDS.flatMap((id) => {
    const cat = byId.get(id)
    return cat ? [cat] : []
  })
  const seen = new Set(ordered.map((c) => c.id))
  for (const cat of subs) {
    if (!seen.has(cat.id)) ordered.push(cat)
  }
  return ordered.sort((a, b) =>
    getKibrisSubcategoryShortLabel(a).localeCompare(
      getKibrisSubcategoryShortLabel(b),
      'tr',
      { sensitivity: 'base' },
    ),
  )
}

/** True when categoryId is Kıbrıs Haberleri or one of its subcategories. */
export function isKibrisCategoryTree(categoryId: string): boolean {
  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (KIBRIS_CATEGORY_IDS.has(cat)) return true
  const parent = getParentCategory(cat)
  return parent != null && KIBRIS_CATEGORY_IDS.has(parent.id)
}

/** Split stored categoryId into Kıbrıs parent + optional subcategory. */
export function resolveKibrisCategoryParts(categoryId: string): {
  parentId: string
  subcategoryId: string | null
} {
  const cat = categoryId?.trim() ?? ''
  if (!cat || KIBRIS_CATEGORY_IDS.has(cat)) {
    return { parentId: KIBRIS_HABERLERI_CATEGORY_ID, subcategoryId: null }
  }
  const parent = getParentCategory(cat)
  if (parent && KIBRIS_CATEGORY_IDS.has(parent.id)) {
    return { parentId: KIBRIS_HABERLERI_CATEGORY_ID, subcategoryId: cat }
  }
  return { parentId: cat, subcategoryId: null }
}

/** Compose Firestore categoryId from Kıbrıs subcategory selection (empty → kibris-haberleri). */
export function composeKibrisCategoryId(subcategoryId: string | null | undefined): string {
  const sub = subcategoryId?.trim()
  return sub || KIBRIS_HABERLERI_CATEGORY_ID
}

/** Pipe-separated kıbrıs subcategory ids for AI prompts. */
export function getKibrisSubcategoryIdsForPrompt(): string {
  return KIBRIS_SUBCATEGORY_IDS.join('|')
}

/**
 * Yerel-only alt kategoriler — ulusal ana sayfa raylarında gösterilmez
 * (çift feed haritasına da eklenmez; şehir / yerel bölümünde kalır).
 */
export const YEREL_HOMEPAGE_EXCLUDED_IDS = new Set<string>(['yerel-duyuru'])

/** Yerel alt kategori → ulusal kategori (Türkiye feed çift görünürlük). */
export const YEREL_TO_NATIONAL_CATEGORY_MAP: Record<string, string> = {
  'yerel-asayis': 'asayis',
  // yerel-gundem: ulusal Gündem'e dual-feed YOK — yalnızca şehir / yerel-gundem sayfalarında
  'yerel-siyaset': 'siyaset',
  'yerel-spor': 'spor',
  'yerel-futbol': 'futbol',
  'yerel-basketbol': 'basketbol',
  'yerel-voleybol': 'voleybol',
  'yerel-hentbol': 'hentbol',
  'yerel-atletizm': 'atletizm',
  'yerel-gures': 'gures',
  'yerel-tenis': 'tenis',
  'yerel-karate': 'karate',
  'yerel-yuzme': 'spor',
  'yerel-motor-sporlari': 'spor',
  'yerel-ekonomi': 'ekonomi',
  'yerel-finans': 'finans-piyasa',
  'yerel-emlak': 'emlak-konut',
  'yerel-enerji': 'enerji',
  'yerel-kariyer': 'is-kariyer',
  'yerel-teknoloji': 'teknoloji',
  'yerel-etkinlik': 'etkinlikler',
  'yerel-sinema': 'sinema',
  'yerel-kultur': 'kultur',
  'yerel-tiyatro': 'tiyatro',
  'yerel-konser': 'konser',
  'yerel-festival': 'festival',
  'yerel-magazin': 'magazin',
  'yerel-yasam': 'yasam',
  'yerel-saglik': 'saglik',
  'yerel-bilim': 'bilim',
  'yerel-egitim': 'egitim',
  'yerel-cevre-iklim': 'cevre-iklim',
  'yerel-din-inanc': 'din-inanc',
  'yerel-gastronomi': 'gastronomi',
  'yerel-otomobil': 'otomobil',
  'yerel-meteoroloji': 'meteoroloji',
  'yerel-turizm': 'turizm',
  'yerel-gezi': 'gezi',
  'yerel-tarih': 'tarih',
  'yerel-oyun-espor': 'oyun-espor',
}

/** National branch categories → yerel subcategory (sport, ekonomi alt dalları vb.). */
const NATIONAL_BRANCH_TO_YEREL: Record<string, string> = {
  // One-way: ulusal gundem → yerel etiket/şehir yerelleştirme; dual-feed haritasında yok
  gundem: 'yerel-gundem',
  futbol: 'yerel-futbol',
  basketbol: 'yerel-basketbol',
  voleybol: 'yerel-voleybol',
  hentbol: 'yerel-hentbol',
  atletizm: 'yerel-atletizm',
  gures: 'yerel-gures',
  tenis: 'yerel-tenis',
  karate: 'yerel-karate',
  'dunya-kupasi-2026': 'yerel-spor',
  borsa: 'yerel-finans',
  kripto: 'yerel-finans',
  'finans-piyasa': 'yerel-finans',
  'emlak-konut': 'yerel-emlak',
  enerji: 'yerel-enerji',
  'is-kariyer': 'yerel-kariyer',
  tiyatro: 'yerel-tiyatro',
  festival: 'yerel-festival',
  astroloji: 'yerel-yasam',
  moda: 'yerel-yasam',
  'anne-cocuk': 'yerel-yasam',
  dekorasyon: 'yerel-yasam',
  iliskiler: 'yerel-yasam',
}

let nationalToYerelCache: Record<string, string> | null = null

function getNationalToYerelMap(): Record<string, string> {
  if (!nationalToYerelCache) {
    nationalToYerelCache = {
      ...Object.fromEntries(
        Object.entries(YEREL_TO_NATIONAL_CATEGORY_MAP).map(([yerel, national]) => [national, yerel])
      ),
      ...NATIONAL_BRANCH_TO_YEREL,
    }
  }
  return nationalToYerelCache
}

/** Categories that must never be converted to a yerel subcategory. */
const NON_LOCALIZABLE_CATEGORIES = new Set([
  'dunya',
  'kibris-haberleri',
  'son-dakika',
  'trend',
  'influencer',
  // Lifestyle / tech / industry — never geo-owned as yerel-*
  'gastronomi',
  'otomobil',
  'saglik',
  'yasam',
  'teknoloji',
  'magazin',
  'moda',
  'astroloji',
  'anne-cocuk',
  'dekorasyon',
  'iliskiler',
  'oyun-espor',
  'bilim',
  'sinema',
  'tiyatro',
  'konser',
  'festival',
])

const YEREL_CATEGORY_IDS = new Set([YEREL_HABER_CATEGORY_ID, 'yerel'])

/** Short label for Yerel subcategories in admin dropdowns (e.g. "Yerel Gündem" → "Gündem"). */
export function getYerelSubcategoryShortLabel(cat: CategoryDef): string {
  if (cat.id === YEREL_HABER_CATEGORY_ID || !cat.parentId) return cat.name
  if (YEREL_CATEGORY_IDS.has(cat.parentId)) {
    return cat.name.replace(/^Yerel\s+/i, '')
  }
  return cat.name
}

/**
 * Yerel child categories for CMS / mobile pickers.
 * Includes every `parentId: yerel-haber` def (duyuru, spor branşları, …),
 * sorted by Turkish short label so items like Duyuru are findable.
 */
export function getYerelSubcategories(): CategoryDef[] {
  const subs = getSubcategories(YEREL_HABER_CATEGORY_ID)
  const byId = new Map(subs.map((c) => [c.id, c]))
  // Prefer known ids first so orphan/mis-parented defs don't hide registered ones.
  const ordered = YEREL_SUBCATEGORY_IDS.flatMap((id) => {
    const cat = byId.get(id)
    return cat ? [cat] : []
  })
  const seen = new Set(ordered.map((c) => c.id))
  for (const cat of subs) {
    if (!seen.has(cat.id)) ordered.push(cat)
  }
  return ordered.sort((a, b) =>
    getYerelSubcategoryShortLabel(a).localeCompare(
      getYerelSubcategoryShortLabel(b),
      'tr',
      { sensitivity: 'base' },
    ),
  )
}

/** Yerel spor / branş alt kategorisi mi? (yerel-futbol, yerel-tenis, …) */
export function isYerelSporCategory(categoryId: string): boolean {
  const id = categoryId?.trim().toLowerCase() ?? ''
  if (id === 'yerel-spor') return true
  const national = YEREL_TO_NATIONAL_CATEGORY_MAP[id]
  if (!national) return false
  return isNationalSporCategory(national)
}

/**
 * Yerel altındaki spor chip'leri — ulusal Spor sırasıyla (Futbol, Basketbol, …).
 * Yüzme / motor gibi yalnızca yerel olan branşlar sonda eklenir.
 */
export function getYerelSporSubcategories(): CategoryDef[] {
  const byId = new Map(getYerelSubcategories().map((c) => [c.id, c]))
  const ordered: CategoryDef[] = []
  const push = (id: string | null | undefined) => {
    if (!id) return
    const cat = byId.get(id)
    if (cat && !ordered.some((c) => c.id === cat.id)) ordered.push(cat)
  }
  push('yerel-spor')
  for (const id of SPOR_ADMIN_SUBCATEGORY_ORDER) {
    push(mapNationalCategoryToYerelSubcategory(id))
  }
  for (const cat of byId.values()) {
    if (isYerelSporCategory(cat.id)) push(cat.id)
  }
  return ordered
}

/** True when a news item belongs to the Yerel category tree (admin inline changer scope). */
export function isYerelNewsItem(categoryId: string, citySlug?: string | null): boolean {
  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (YEREL_CATEGORY_IDS.has(cat)) return true
  if (citySlug?.trim()) return true
  const parent = getParentCategory(cat)
  return parent != null && YEREL_CATEGORY_IDS.has(parent.id)
}

/** Admin dropdown — Yerel parent + child categories only (future subcats via parentId). */
export function getYerelAdminCategoryGroups(): Array<{ label: string; categories: CategoryDef[] }> {
  const parent = DEFAULT_CATEGORIES.find((c) => c.id === YEREL_HABER_CATEGORY_ID)
  if (!parent) return []
  return [{
    label: 'Yerel',
    categories: [parent, ...getYerelSubcategories()],
  }]
}

/** True when categoryId is Yerel Haber or one of its subcategories. */
export function isYerelCategoryTree(categoryId: string): boolean {
  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (YEREL_CATEGORY_IDS.has(cat)) return true
  const parent = getParentCategory(cat)
  return parent != null && YEREL_CATEGORY_IDS.has(parent.id)
}

/** Split stored categoryId into Yerel parent + optional subcategory. */
export function resolveYerelCategoryParts(categoryId: string): {
  parentId: string
  subcategoryId: string | null
} {
  const cat = categoryId?.trim() ?? ''
  if (!cat || YEREL_CATEGORY_IDS.has(cat)) {
    return { parentId: YEREL_HABER_CATEGORY_ID, subcategoryId: null }
  }
  const parent = getParentCategory(cat)
  if (parent && YEREL_CATEGORY_IDS.has(parent.id)) {
    return { parentId: YEREL_HABER_CATEGORY_ID, subcategoryId: cat }
  }
  return { parentId: cat, subcategoryId: null }
}

/** Compose Firestore categoryId from Yerel subcategory selection (empty → yerel-haber). */
export function composeYerelCategoryId(subcategoryId: string | null | undefined): string {
  const sub = subcategoryId?.trim()
  return sub || YEREL_HABER_CATEGORY_ID
}

/**
 * All category ids that belong to a parent (inclusive).
 * Used to query Firestore for "show all sport news" (spor + futbol + basketbol + ...).
 * Includes ALL subcategories so the parent "Tümü" view shows every branch.
 */
/** Yerel alt kategoriler whose mapped national id is in the given family set. */
export function getYerelIdsMappedToCategoryFamily(familyIds: string[]): string[] {
  const familySet = new Set(familyIds)
  return Object.entries(YEREL_TO_NATIONAL_CATEGORY_MAP)
    .filter(([, nationalId]) => familySet.has(nationalId))
    .map(([yerelId]) => yerelId)
}

/** National category id for a yerel subcategory (for feed routing / display). */
export function getNationalCategoryForYerelSubcategory(yerelCategoryId: string): string | null {
  return YEREL_TO_NATIONAL_CATEGORY_MAP[yerelCategoryId] ?? null
}

/** Map a national (or branch) category id to the best yerel subcategory. */
export function mapNationalCategoryToYerelSubcategory(nationalCategoryId: string): string | null {
  const id = nationalCategoryId?.trim().toLowerCase() ?? ''
  if (!id || id === YEREL_HABER_CATEGORY_ID) return null
  return getNationalToYerelMap()[id] ?? null
}

/** True when a news item should receive a specific yerel subcategory. */
export function shouldLocalizeCategory(categoryId: string, citySlug?: string | null): boolean {
  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (NON_LOCALIZABLE_CATEGORIES.has(cat)) return false
  if (isKibrisCategoryTree(cat)) return false
  if (isYerelCategoryTree(cat)) return true
  return Boolean(citySlug?.trim())
}

/**
 * Resolve the best yerel subcategory for local news.
 * Falls back to yerel-haber when no mapping exists.
 */
export function resolveYerelSubcategoryForLocalNews(
  categoryId: string,
  citySlug?: string | null,
): string {
  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (!shouldLocalizeCategory(cat, citySlug)) return cat
  if (cat.startsWith('yerel-') && cat !== YEREL_HABER_CATEGORY_ID) return cat
  return mapNationalCategoryToYerelSubcategory(cat) ?? YEREL_HABER_CATEGORY_ID
}

/** Comma-separated yerel subcategory ids for AI prompts. */
export function getYerelSubcategoryIdsForPrompt(): string {
  return YEREL_SUBCATEGORY_IDS.join('|')
}

export function getCategoryFamily(parentId: string): string[] {
  const base = [
    parentId,
    ...getSubcategories(parentId).map((c) => c.id),
  ]
  const yerelIds = getYerelIdsMappedToCategoryFamily(base)
  return [...new Set([...base, ...yerelIds])]
}

/**
 * Ana sayfa kategori rayları — standalone alt kategoriler dahil
 * (ör. Spor rayında futbol/basketbol haberleri de görünsün).
 * Firestore `in` limiti: en fazla 10 id.
 * YEREL_HOMEPAGE_EXCLUDED_IDS (ör. yerel-duyuru) ana sayfa rayına girmez;
 * istenen parentId'nin kendisi sorgulanıyorsa korunur.
 *
 * Limit aşımında ulusal alt dallar (futbol/basketbol…) öncelikli tutulur;
 * dual-route haberler ulusal categoryId ile yazıldığı için yerel ayna id'ler
 * ikincil sıradadır (yerel-futbol vb. şişirmesin).
 */
export function getHomeFeedCategoryFamily(parentId: string): string[] {
  const base = [parentId, ...getSubcategories(parentId).map((c) => c.id)]
  const yerelIds = getYerelIdsMappedToCategoryFamily(base).filter(
    (id) => !YEREL_HOMEPAGE_EXCLUDED_IDS.has(id)
  )
  const combined = [...new Set([...base, ...yerelIds])].filter(
    (id) => id === parentId || !YEREL_HOMEPAGE_EXCLUDED_IDS.has(id)
  )
  if (combined.length <= 10) return combined

  // Firestore `in` max 10 — parent + national children first, then yerel mirrors.
  const ordered = [
    parentId,
    ...base.filter((id) => id !== parentId && !YEREL_HOMEPAGE_EXCLUDED_IDS.has(id)),
    ...yerelIds.filter((id) => id !== parentId && !base.includes(id)),
  ]
  return [...new Set(ordered)].slice(0, 10)
}

/** True when category should stay off national homepage rails / featured filler. */
export function isYerelHomepageExcluded(categoryId: string): boolean {
  return YEREL_HOMEPAGE_EXCLUDED_IDS.has(categoryId?.trim().toLowerCase() ?? '')
}

/**
 * Categories shown in the main sidebar nav (legacy order reference).
 * Güncel side nav: `@/constants/sidebarNav` — SIDEBAR_CATEGORIES (ana + alt).
 */
export const SIDEBAR_MAIN_CATEGORY_IDS = [
  'gundem',
  'asayis',
  'spor',
  'dunya',
  'kibris-haberleri',
  'siyaset',
  'ekonomi',
  'saglik',
  'egitim',
  'teknoloji',
  'bilim',
  'cevre-iklim',
  'yasam',
  'kultur',
  'magazin',
  'turizm',
  'gezi',
  'tarih',
  'gastronomi',
  'otomobil',
  'oyun-espor',
  'din-inanc',
] as const

/**
 * Üst gezinme barlarında (CategoryNav mobile + FeedCategoryBar) gösterilecek
 * kategori id'leri — TEK kaynak. Yerel haber bağlantısı kart düzeyinde
 * eklenir (slug yerine sabit route).
 */
export const TOP_NAV_CATEGORY_IDS = [
  'gundem',
  'ekonomi',
  'spor',
  'dunya',
  'siyaset',
  'teknoloji',
  'saglik',
  'kultur',
  'asayis',
  'kibris-haberleri',
  'egitim',
  'turizm',
  'gezi',
  'bilim',
  'cevre-iklim',
  'oyun-espor',
  'din-inanc',
  'yasam',
  'gastronomi',
  'otomobil',
  'sinema',
  'tiyatro',
  'magazin',
  'tarih',
] as const

/**
 * Desktop header kısa etiketleri — global sıra getSiteNavItems'tan gelir.
 */
const HEADER_LABELS: Record<string, string> = {
  feed: 'Ana Sayfa',
  'feed-v2': 'Akış',
  yerel: 'Yerel',
  'kibris-haberleri': 'Kıbrıs',
  siyaset: 'Politika',
  'finans-piyasa': 'Finans',
  kultur: 'Kültür Sanat',
  asayis: '3. Sayfa',
  video: 'Video',
}

/**
 * Concept B desktop — kırmızı üst bardaki birincil kategoriler.
 * Sıra getHeaderAllNavItems (global dizilim) ile aynıdır.
 */
export const HEADER_PRIMARY_NAV_IDS = [
  'feed',
  'son-dakika',
  'gundem',
  'yerel',
  'asayis',
  'feed-v2',
  'dunya',
  'kibris-haberleri',
] as const

export interface SiteNavItem {
  id: string
  label: string
  href: string
  /** Kültür alt kategorileri gibi girintili linkler */
  indent?: boolean
}

/**
 * Header + footer haber kategorileri — tek kaynak sıra.
 * Ana Sayfa → … → Magazin → Teve
 */
export function getSiteNavItems(): SiteNavItem[] {
  const categoryLink = (id: string, label?: string): SiteNavItem | null => {
    const def = DEFAULT_CATEGORIES.find((c) => c.id === id)
    if (!def) return null
    return {
      id,
      label: label ?? def.name,
      href: ROUTES.CATEGORY(def.slug ?? def.id),
    }
  }

  const items: Array<SiteNavItem | null> = [
    { id: 'feed', label: 'Ana Sayfa', href: ROUTES.FEED },
    categoryLink('gundem'),
    { id: 'yerel', label: 'Yerel Haber', href: ROUTES.LOCAL },
    categoryLink('asayis', '3. Sayfa'),
    { id: 'feed-v2', label: 'Akış', href: ROUTES.FEED_V2 },
    categoryLink('dunya'),
    categoryLink('kibris-haberleri'),
    categoryLink('siyaset'),
    categoryLink('ekonomi'),
    categoryLink('spor'),
    categoryLink('egitim'),
    categoryLink('saglik'),
    categoryLink('cevre-iklim'),
    categoryLink('oyun-espor'),
    categoryLink('din-inanc'),
    categoryLink('turizm'),
    categoryLink('gezi'),
    categoryLink('teknoloji'),
    categoryLink('bilim'),
    categoryLink('yasam'),
    categoryLink('astroloji') ? { ...categoryLink('astroloji')!, indent: true } : null,
    categoryLink('gastronomi'),
    categoryLink('otomobil'),
    categoryLink('kultur'),
    categoryLink('sinema') ? { ...categoryLink('sinema')!, indent: true } : null,
    categoryLink('tiyatro') ? { ...categoryLink('tiyatro')!, indent: true } : null,
    { id: 'teve', label: 'Teve', href: ROUTES.REELS, indent: true },
    categoryLink('magazin'),
    categoryLink('tarih'),
    { id: 'etkinlikler', label: 'Etkinlikler', href: ROUTES.EVENTS },
  ]

  return items.filter((item): item is SiteNavItem => item !== null)
}

/**
 * Üst nav kategorileri — id, label, href tuple'ı, DEFAULT_CATEGORIES'den
 * türetiliyor. Slug yoksa id'yi kullanır.
 */
export function getTopNavCategories(): Array<{ id: string; label: string; href: string }> {
  return TOP_NAV_CATEGORY_IDS
    .map((id) => DEFAULT_CATEGORIES.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      label: c!.name,
      href: `/kategori/${c!.slug ?? c!.id}`,
    }))
}

function resolveHeaderNavItem(
  id: string,
  labelOverride?: string
): SiteNavItem | null {
  if (id === 'feed') {
    return { id: 'feed', label: labelOverride ?? 'Ana Sayfa', href: ROUTES.FEED }
  }
  if (id === 'feed-v2') {
    return { id: 'feed-v2', label: labelOverride ?? 'Akış', href: ROUTES.FEED_V2 }
  }
  if (id === 'yerel') {
    return { id: 'yerel', label: labelOverride ?? 'Yerel', href: ROUTES.LOCAL }
  }
  if (id === 'video' || id === 'teve') {
    return { id: 'video', label: labelOverride ?? 'Video', href: ROUTES.REELS }
  }
  const def = DEFAULT_CATEGORIES.find((c) => c.id === id)
  if (!def) return null
  return {
    id,
    label: labelOverride ?? def.name,
    href: ROUTES.CATEGORY(def.slug ?? def.id),
  }
}

const HEADER_PRIMARY_ID_SET = new Set<string>(HEADER_PRIMARY_NAV_IDS)

/**
 * Desktop header — global kategori sırası (getSiteNavItems).
 * Ana Sayfa'dan sonra Son Dakika; Ekonomi'den sonra Finans; sonda Video.
 * Girintili alt kategoriler (sinema, tiyatro, astroloji, teve) üst barda yok.
 */
export function getHeaderAllNavItems(): SiteNavItem[] {
  const sonDakika = resolveHeaderNavItem('son-dakika')
  const finans = resolveHeaderNavItem('finans-piyasa', HEADER_LABELS['finans-piyasa'])
  const video = resolveHeaderNavItem('video', HEADER_LABELS.video)

  const items: SiteNavItem[] = []
  for (const item of getSiteNavItems()) {
    if (item.indent) continue
    items.push({ ...item, label: HEADER_LABELS[item.id] ?? item.label })
    if (item.id === 'feed' && sonDakika) items.push(sonDakika)
    if (item.id === 'ekonomi' && finans) items.push(finans)
  }
  if (video && !items.some((existing) => existing.id === 'video')) {
    items.push(video)
  }
  return items
}

/** Concept B — kırmızı bardaki birincil kategori linkleri. */
export function getHeaderPrimaryNavItems(): SiteNavItem[] {
  return getHeaderAllNavItems().filter((item) => HEADER_PRIMARY_ID_SET.has(item.id))
}

/** Concept B — lacivert bardaki ikincil kategori linkleri. */
export function getHeaderSecondaryNavItems(): SiteNavItem[] {
  return getHeaderAllNavItems().filter((item) => !HEADER_PRIMARY_ID_SET.has(item.id))
}

export interface SwipeDestination {
  id: string
  label: string
  href: string
}

/** XML ve HTML site haritası bağlantıları — footer / site-haritasi sayfası. */
export function getSitemapLinks(siteUrl: string) {
  return [
    { label: 'Site Haritası', href: ROUTES.SITE_MAP, description: 'Tüm kategoriler ve sayfalar' },
    { label: 'XML Site Haritası', href: `${siteUrl}/sitemap.xml`, description: 'Arama motorları için ana indeks' },
    { label: 'Haber Site Haritası', href: `${siteUrl}/news-sitemap.xml`, description: 'Son haberler' },
    { label: 'Video Site Haritası', href: `${siteUrl}/video-sitemap.xml`, description: 'Video içerikler' },
    { label: 'Görsel Site Haritası', href: `${siteUrl}/images-sitemap.xml`, description: 'Haber görselleri' },
  ] as const
}

/** Ana feed + üst nav kategorileri + oyunlar + yerel — yatay kaydırma sırası (tek kaynak). */
export function getSwipeableFeedDestinations(): SwipeDestination[] {
  const destinations: SwipeDestination[] = [
    { id: 'feed', label: 'Ana Sayfa', href: ROUTES.FEED },
  ]

  for (const cat of getTopNavCategories()) {
    destinations.push(cat)
    if (cat.id === 'spor') {
      destinations.push({ id: 'skor', label: 'Skor', href: ROUTES.SKOR })
    }
    if (cat.id === 'oyun-espor') {
      destinations.push({ id: 'oyunlar', label: 'Oyunlar', href: ROUTES.GAMES })
    }
  }

  destinations.push({ id: 'yerel', label: 'Yerel', href: ROUTES.LOCAL })
  return destinations
}

/** Aktif sayfayı swipe zincirindeki üst düzey kategori anahtarına çevirir. */
export function resolveSwipeCategoryKey(pathname: string): string | null {
  if (pathname === ROUTES.FEED) return 'feed'
  if (pathname === ROUTES.LOCAL || pathname.startsWith(`${ROUTES.LOCAL}/`)) return 'yerel'
  if (pathname === ROUTES.GAMES || pathname.startsWith(`${ROUTES.GAMES}/`)) return 'oyunlar'
  if (pathname === ROUTES.SKOR || pathname.startsWith(`${ROUTES.SKOR}/`)) return 'skor'

  const match = pathname.match(/^\/kategori\/([^/]+)/)
  if (!match) return null

  const slug = decodeURIComponent(match[1]!)
  const cat = DEFAULT_CATEGORIES.find((c) => c.slug === slug || c.id === slug)
  if (!cat) return null
  if (cat.id === 'yerel-haber') return 'yerel'

  const topNavSet = new Set<string>(TOP_NAV_CATEGORY_IDS)
  if (topNavSet.has(cat.id)) return cat.id
  if (cat.parentId && topNavSet.has(cat.parentId)) return cat.parentId
  if (cat.id === 'sinema' || cat.id === 'tiyatro') return cat.id
  if (cat.id === 'astroloji') return 'yasam'

  return null
}

export function getSwipeIndexFromPathname(pathname: string): number {
  const key = resolveSwipeCategoryKey(pathname)
  if (!key) return -1
  return getSwipeableFeedDestinations().findIndex((d) => d.id === key)
}
