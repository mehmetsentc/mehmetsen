/**
 * Idempotent seed script — Phase 1 City Network foundation.
 *
 * Seeds: Türkiye, Çanakkale province + districts, canakkale city_site,
 * and all DEFAULT_CATEGORIES from the existing config.
 *
 * Usage:
 *   npm run db:seed                    # live run
 *   DRY_RUN=true npm run db:seed       # dry-run (log only, no writes)
 *
 * Requires DATABASE_URL (or DATABASE_URL_UNPOOLED) in env.
 */

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import { countries } from './schema/countries'
import { provinces } from './schema/provinces'
import { districts } from './schema/districts'
import { citySites } from './schema/citySites'
import { categories } from './schema/categories'

const DRY_RUN = process.env.DRY_RUN === 'true'

// ── Seed data ───────────────────────────────────────────────────────────────

const COUNTRY_TURKEY = {
  code: 'TR',
  name: 'Turkey',
  nameLocal: 'Türkiye',
  isActive: true,
} as const

const PROVINCE_CANAKKALE = {
  slug: 'canakkale',
  name: 'Çanakkale',
  countryCode: 'TR',
  lat: 40.1553,
  lng: 26.4142,
} as const

const CANAKKALE_DISTRICTS = [
  { slug: 'canakkale-merkez', name: 'Merkez', provinceSlug: 'canakkale' },
  { slug: 'canakkale-ayvacik', name: 'Ayvacık', provinceSlug: 'canakkale' },
  { slug: 'canakkale-bayramic', name: 'Bayramiç', provinceSlug: 'canakkale' },
  { slug: 'canakkale-biga', name: 'Biga', provinceSlug: 'canakkale' },
  { slug: 'canakkale-bozcaada', name: 'Bozcaada', provinceSlug: 'canakkale' },
  { slug: 'canakkale-can', name: 'Çan', provinceSlug: 'canakkale' },
  { slug: 'canakkale-eceabat', name: 'Eceabat', provinceSlug: 'canakkale' },
  { slug: 'canakkale-ezine', name: 'Ezine', provinceSlug: 'canakkale' },
  { slug: 'canakkale-gelibolu', name: 'Gelibolu', provinceSlug: 'canakkale' },
  { slug: 'canakkale-gokceada', name: 'Gökçeada', provinceSlug: 'canakkale' },
  { slug: 'canakkale-lapseki', name: 'Lapseki', provinceSlug: 'canakkale' },
  { slug: 'canakkale-yenice', name: 'Yenice', provinceSlug: 'canakkale' },
] as const

const CITY_SITE_CANAKKALE = {
  id: 'canakkale',
  slug: 'canakkale',
  displayName: 'Çanakkale',
  domain: 'canakkale.nahaber.com',
  provinceSlug: 'canakkale',
  isActive: true,
} as const

const SEED_CATEGORIES = [
  { id: 'trend', name: 'Trending', slug: 'trend', parentId: null, iconName: 'flame', color: '#FF6B35', isStandalone: false },
  { id: 'gundem', name: 'Gündem', slug: 'gundem', parentId: null, iconName: 'newspaper', color: '#EF4444', isStandalone: false },
  { id: 'yerel-haber', name: 'Yerel Haber', slug: 'yerel-haber', parentId: null, iconName: 'map-pin', color: '#059669', isStandalone: false },
  { id: 'yerel-gundem', name: 'Yerel Gündem', slug: 'yerel-gundem', parentId: 'yerel-haber', iconName: 'newspaper', color: '#059669', isStandalone: false },
  { id: 'yerel-spor', name: 'Yerel Spor', slug: 'yerel-spor', parentId: 'yerel-haber', iconName: 'trophy', color: '#059669', isStandalone: false },
  { id: 'yerel-etkinlik', name: 'Yerel Etkinlik', slug: 'yerel-etkinlik', parentId: 'yerel-haber', iconName: 'calendar', color: '#059669', isStandalone: false },
  { id: 'yerel-sinema', name: 'Yerel Sinema', slug: 'yerel-sinema', parentId: 'yerel-haber', iconName: 'film', color: '#059669', isStandalone: false },
  { id: 'siyaset', name: 'Siyaset', slug: 'siyaset', parentId: null, iconName: 'landmark', color: '#7C3AED', isStandalone: false },
  { id: 'dunya', name: 'Dünya', slug: 'dunya', parentId: null, iconName: 'globe', color: '#6B7280', isStandalone: false },
  { id: 'kibris-haberleri', name: 'Kıbrıs Haberleri', slug: 'kibris-haberleri', parentId: null, iconName: 'flag', color: '#0E7490', isStandalone: false },
  { id: 'ekonomi', name: 'Ekonomi', slug: 'ekonomi', parentId: null, iconName: 'trending-up', color: '#F59E0B', isStandalone: false },
  { id: 'borsa', name: 'Borsa', slug: 'borsa', parentId: 'ekonomi', iconName: 'bar-chart-2', color: '#22C55E', isStandalone: true },
  { id: 'kripto', name: 'Kripto', slug: 'kripto', parentId: 'ekonomi', iconName: 'bitcoin', color: '#F7931A', isStandalone: true },
  { id: 'finans-piyasa', name: 'Finans & Piyasa', slug: 'finans-piyasa', parentId: 'ekonomi', iconName: 'chart-line', color: '#D97706', isStandalone: false },
  { id: 'emlak-konut', name: 'Emlak & Konut', slug: 'emlak-konut', parentId: 'ekonomi', iconName: 'building-2', color: '#B45309', isStandalone: false },
  { id: 'enerji', name: 'Enerji', slug: 'enerji', parentId: 'ekonomi', iconName: 'bolt', color: '#CA8A04', isStandalone: false },
  { id: 'is-kariyer', name: 'İş & Kariyer', slug: 'is-kariyer', parentId: 'ekonomi', iconName: 'briefcase', color: '#A16207', isStandalone: false },
  { id: 'teknoloji', name: 'Teknoloji', slug: 'teknoloji', parentId: null, iconName: 'cpu', color: '#3B82F6', isStandalone: false },
  { id: 'saglik', name: 'Sağlık', slug: 'saglik', parentId: null, iconName: 'heart', color: '#EC4899', isStandalone: false },
  { id: 'bilim', name: 'Bilim', slug: 'bilim', parentId: null, iconName: 'flask', color: '#14B8A6', isStandalone: false },
  { id: 'egitim', name: 'Eğitim', slug: 'egitim', parentId: null, iconName: 'graduation-cap', color: '#2563EB', isStandalone: false },
  { id: 'cevre-iklim', name: 'Çevre & İklim', slug: 'cevre-iklim', parentId: null, iconName: 'tree-pine', color: '#15803D', isStandalone: false },
  { id: 'oyun-espor', name: 'Oyun & Espor', slug: 'oyun-espor', parentId: null, iconName: 'gamepad-2', color: '#7C3AED', isStandalone: false },
  { id: 'din-inanc', name: 'Din & İnanç', slug: 'din-inanc', parentId: null, iconName: 'moon-star', color: '#0F766E', isStandalone: false },
  { id: 'magazin', name: 'Magazin', slug: 'magazin', parentId: null, iconName: 'star', color: '#F472B6', isStandalone: false },
  { id: 'spor', name: 'Spor', slug: 'spor', parentId: null, iconName: 'trophy', color: '#10B981', isStandalone: false },
  { id: 'futbol', name: 'Futbol', slug: 'futbol', parentId: 'spor', iconName: 'circle-dot', color: '#10B981', isStandalone: true },
  { id: 'basketbol', name: 'Basketbol', slug: 'basketbol', parentId: 'spor', iconName: 'circle', color: '#10B981', isStandalone: true },
  { id: 'voleybol', name: 'Voleybol', slug: 'voleybol', parentId: 'spor', iconName: 'circle', color: '#10B981', isStandalone: true },
  { id: 'hentbol', name: 'Hentbol', slug: 'hentbol', parentId: 'spor', iconName: 'circle', color: '#10B981', isStandalone: false },
  { id: 'atletizm', name: 'Atletizm', slug: 'atletizm', parentId: 'spor', iconName: 'zap', color: '#10B981', isStandalone: false },
  { id: 'gures', name: 'Güreş', slug: 'gures', parentId: 'spor', iconName: 'swords', color: '#10B981', isStandalone: false },
  { id: 'dunya-kupasi-2026', name: '2026 Dünya Kupası (Arşiv)', slug: 'dunya-kupasi-2026', parentId: 'spor', iconName: 'trophy', color: '#F59E0B', isStandalone: true },
  { id: 'kultur', name: 'Kültür', slug: 'kultur', parentId: null, iconName: 'palette', color: '#8B5CF6', isStandalone: false },
  { id: 'sinema', name: 'Sinema', slug: 'sinema', parentId: 'kultur', iconName: 'film', color: '#8B5CF6', isStandalone: false },
  { id: 'tiyatro', name: 'Tiyatro', slug: 'tiyatro', parentId: 'kultur', iconName: 'theater', color: '#8B5CF6', isStandalone: false },
  { id: 'konser', name: 'Konser', slug: 'konser', parentId: 'kultur', iconName: 'music', color: '#8B5CF6', isStandalone: false },
  { id: 'festival', name: 'Festival', slug: 'festival', parentId: 'kultur', iconName: 'party-popper', color: '#8B5CF6', isStandalone: false },
  { id: 'yasam', name: 'Yaşam', slug: 'yasam', parentId: null, iconName: 'leaf', color: '#16A34A', isStandalone: false },
  { id: 'astroloji', name: 'Astroloji', slug: 'astroloji', parentId: 'yasam', iconName: 'sparkles', color: '#7C3AED', isStandalone: false },
  { id: 'moda', name: 'Moda', slug: 'moda', parentId: 'yasam', iconName: 'shirt', color: '#DB2777', isStandalone: false },
  { id: 'anne-cocuk', name: 'Anne & Çocuk', slug: 'anne-cocuk', parentId: 'yasam', iconName: 'baby', color: '#E879F9', isStandalone: false },
  { id: 'dekorasyon', name: 'Dekorasyon', slug: 'dekorasyon', parentId: 'yasam', iconName: 'sofa', color: '#C2410C', isStandalone: false },
  { id: 'iliskiler', name: 'İlişkiler', slug: 'iliskiler', parentId: 'yasam', iconName: 'heart-handshake', color: '#E11D48', isStandalone: false },
  { id: 'gastronomi', name: 'Gastronomi', slug: 'gastronomi', parentId: null, iconName: 'utensils', color: '#F97316', isStandalone: false },
  { id: 'otomobil', name: 'Otomobil', slug: 'otomobil', parentId: null, iconName: 'car', color: '#64748B', isStandalone: false },
  { id: 'meteoroloji', name: 'Meteoroloji', slug: 'meteoroloji', parentId: null, iconName: 'cloud-rain', color: '#0EA5E9', isStandalone: false },
  { id: 'turizm', name: 'Turizm', slug: 'turizm', parentId: null, iconName: 'plane', color: '#0284C7', isStandalone: false },
  { id: 'gezi', name: 'Gezi', slug: 'gezi', parentId: null, iconName: 'map', color: '#0891B2', isStandalone: false },
  { id: 'asayis', name: '3. Sayfa', slug: 'asayis', parentId: null, iconName: 'shield-alert', color: '#B45309', isStandalone: false },
  { id: 'tarih', name: 'Tarih', slug: 'tarih', parentId: null, iconName: 'book-open', color: '#92400E', isStandalone: false },
  { id: 'son-dakika', name: 'Son Dakika', slug: 'son-dakika', parentId: null, iconName: 'zap', color: '#EF4444', isStandalone: false },
  { id: 'etkinlikler', name: 'Etkinlikler', slug: 'etkinlikler', parentId: null, iconName: 'calendar', color: '#8B5CF6', isStandalone: false },
] as const

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('❌ DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set.')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('🏜️  DRY RUN — no database writes will be performed.\n')
    console.log(`Country:     ${COUNTRY_TURKEY.nameLocal} (${COUNTRY_TURKEY.code})`)
    console.log(`Province:    ${PROVINCE_CANAKKALE.name} (${PROVINCE_CANAKKALE.slug})`)
    console.log(`Districts:   ${CANAKKALE_DISTRICTS.length}`)
    console.log(`City site:   ${CITY_SITE_CANAKKALE.domain} (active: ${CITY_SITE_CANAKKALE.isActive})`)
    console.log(`Categories:  ${SEED_CATEGORIES.length}`)
    console.log('\n✅ Dry run complete — no changes made.')
    return
  }

  const client = neon(url)
  const db = drizzle(client)

  console.log('🌱 Seeding NaHaber City Network (Phase 1)...\n')

  // 1. Country
  await db
    .insert(countries)
    .values(COUNTRY_TURKEY)
    .onConflictDoNothing({ target: countries.code })
  console.log(`  ✓ Country: ${COUNTRY_TURKEY.nameLocal}`)

  // 2. Province
  await db
    .insert(provinces)
    .values(PROVINCE_CANAKKALE)
    .onConflictDoNothing({ target: provinces.slug })
  console.log(`  ✓ Province: ${PROVINCE_CANAKKALE.name}`)

  // 3. Districts
  for (const d of CANAKKALE_DISTRICTS) {
    await db
      .insert(districts)
      .values(d)
      .onConflictDoNothing({ target: districts.slug })
  }
  console.log(`  ✓ Districts: ${CANAKKALE_DISTRICTS.length} (${PROVINCE_CANAKKALE.name})`)

  // 4. City site (tenant)
  await db
    .insert(citySites)
    .values(CITY_SITE_CANAKKALE)
    .onConflictDoNothing({ target: citySites.id })
  console.log(`  ✓ City site: ${CITY_SITE_CANAKKALE.domain}`)

  // 5. Categories — parents first, then children (FK ordering)
  const parents = SEED_CATEGORIES.filter((c) => !c.parentId)
  const children = SEED_CATEGORIES.filter((c) => c.parentId)

  for (const cat of [...parents, ...children]) {
    await db
      .insert(categories)
      .values(cat)
      .onConflictDoNothing({ target: categories.id })
  }
  console.log(`  ✓ Categories: ${SEED_CATEGORIES.length}`)

  // Verify counts
  const [countryCount] = await db.select({ count: sql<number>`count(*)` }).from(countries)
  const [provinceCount] = await db.select({ count: sql<number>`count(*)` }).from(provinces)
  const [districtCount] = await db.select({ count: sql<number>`count(*)` }).from(districts)
  const [siteCount] = await db.select({ count: sql<number>`count(*)` }).from(citySites)
  const [catCount] = await db.select({ count: sql<number>`count(*)` }).from(categories)

  console.log('\n📊 Current totals:')
  console.log(`   Countries:  ${countryCount.count}`)
  console.log(`   Provinces:  ${provinceCount.count}`)
  console.log(`   Districts:  ${districtCount.count}`)
  console.log(`   City sites: ${siteCount.count}`)
  console.log(`   Categories: ${catCount.count}`)

  console.log('\n✅ Seed complete.')
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
