/**
 * POST /api/admin/db-migrate
 * ONE-TIME USE — runs Neon DB schema migration + Çanakkale seed.
 * DELETE THIS FILE after use.
 *
 * Protected by X-Migrate-Token header.
 */
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const MIGRATE_TOKEN = 'nahaber-migrate-2026-a9f3b2c1'

const DDL = `
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('user','author','video_editor','editor','managing_editor','super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE news_status AS ENUM ('draft','pending','published','archived','banned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE editor_type AS ENUM ('local','national','breaking','trend','influencer','event'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE article_format AS ENUM ('standard','column','analysis'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE storage_provider AS ENUM ('firebase','r2','external'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE media_type AS ENUM ('image','video','audio'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS countries (code VARCHAR(2) PRIMARY KEY, name VARCHAR(100) NOT NULL, name_local VARCHAR(100) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS provinces (slug VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, country_code VARCHAR(2) NOT NULL REFERENCES countries(code), lat REAL NOT NULL, lng REAL NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS districts (slug VARCHAR(80) PRIMARY KEY, name VARCHAR(100) NOT NULL, province_slug VARCHAR(50) NOT NULL REFERENCES provinces(slug), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS city_sites (id VARCHAR(50) PRIMARY KEY, slug VARCHAR(50) NOT NULL UNIQUE, display_name VARCHAR(100) NOT NULL, domain VARCHAR(255) NOT NULL, province_slug VARCHAR(50) REFERENCES provinces(slug), is_active BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS categories (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE, parent_id VARCHAR(50), icon_name VARCHAR(50), color VARCHAR(7), is_standalone BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS users (firebase_uid VARCHAR(128) PRIMARY KEY, email VARCHAR(255) UNIQUE, username VARCHAR(30) UNIQUE, display_name VARCHAR(100), photo_url VARCHAR(500), role user_role NOT NULL DEFAULT 'user', home_city_slug VARCHAR(50), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS news (id VARCHAR(64) PRIMARY KEY, legacy_firestore_id VARCHAR(64) UNIQUE, slug VARCHAR(300) NOT NULL UNIQUE, title TEXT NOT NULL, summary VARCHAR(500), description TEXT, content TEXT, html_content TEXT, status news_status NOT NULL DEFAULT 'draft', category_id VARCHAR(50) REFERENCES categories(id), city_site_id VARCHAR(50) REFERENCES city_sites(id), city_name VARCHAR(100), city_slug VARCHAR(50), district_name VARCHAR(100), district_slug VARCHAR(80), author_id VARCHAR(128) REFERENCES users(firebase_uid), author_display_name VARCHAR(100), source VARCHAR(200), source_url TEXT, thumbnail_url TEXT, cover_image_url TEXT, video_url TEXT, tags TEXT[], views_count INTEGER NOT NULL DEFAULT 0, likes_count INTEGER NOT NULL DEFAULT 0, comments_count INTEGER NOT NULL DEFAULT 0, saves_count INTEGER NOT NULL DEFAULT 0, shares_count INTEGER NOT NULL DEFAULT 0, is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE, editor_type editor_type, ai_editor_id VARCHAR(64), article_format article_format, confidence_score SMALLINT, is_breaking BOOLEAN NOT NULL DEFAULT FALSE, is_featured BOOLEAN NOT NULL DEFAULT FALSE, is_editor_pick BOOLEAN NOT NULL DEFAULT FALSE, seo_title VARCHAR(200), seo_description VARCHAR(300), published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE INDEX IF NOT EXISTS news_status_published_idx ON news(status, published_at);
CREATE INDEX IF NOT EXISTS news_city_slug_idx ON news(city_slug);
CREATE INDEX IF NOT EXISTS news_category_idx ON news(category_id);
CREATE INDEX IF NOT EXISTS news_city_site_idx ON news(city_site_id);
CREATE INDEX IF NOT EXISTS news_author_idx ON news(author_id);
CREATE INDEX IF NOT EXISTS news_created_at_idx ON news(created_at);

CREATE TABLE IF NOT EXISTS news_locations (news_id VARCHAR(64) NOT NULL REFERENCES news(id) ON DELETE CASCADE, province_slug VARCHAR(50) NOT NULL REFERENCES provinces(slug), district_slug VARCHAR(80) REFERENCES districts(slug), lat REAL, lng REAL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (news_id, province_slug));

CREATE TABLE IF NOT EXISTS news_categories (news_id VARCHAR(64) NOT NULL REFERENCES news(id) ON DELETE CASCADE, category_id VARCHAR(50) NOT NULL REFERENCES categories(id), is_primary BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (news_id, category_id));

CREATE TABLE IF NOT EXISTS media (id VARCHAR(64) PRIMARY KEY, news_id VARCHAR(64) REFERENCES news(id) ON DELETE SET NULL, type media_type NOT NULL, storage_provider storage_provider NOT NULL DEFAULT 'firebase', storage_key VARCHAR(500), public_url TEXT NOT NULL, alt VARCHAR(300), caption TEXT, credit VARCHAR(200), width INTEGER, height INTEGER, size_bytes INTEGER, sort_order SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE INDEX IF NOT EXISTS media_news_idx ON media(news_id);
CREATE INDEX IF NOT EXISTS media_provider_idx ON media(storage_provider);
`

const SEED_SQL = `
INSERT INTO countries (code, name, name_local, is_active) VALUES ('TR', 'Turkey', 'Türkiye', true) ON CONFLICT (code) DO NOTHING;

INSERT INTO provinces (slug, name, country_code, lat, lng) VALUES ('canakkale', 'Çanakkale', 'TR', 40.1553, 26.4142) ON CONFLICT (slug) DO NOTHING;

INSERT INTO districts (slug, name, province_slug) VALUES
  ('canakkale-merkez', 'Merkez', 'canakkale'),
  ('canakkale-ayvacik', 'Ayvacık', 'canakkale'),
  ('canakkale-bayramic', 'Bayramiç', 'canakkale'),
  ('canakkale-biga', 'Biga', 'canakkale'),
  ('canakkale-bozcaada', 'Bozcaada', 'canakkale'),
  ('canakkale-can', 'Çan', 'canakkale'),
  ('canakkale-eceabat', 'Eceabat', 'canakkale'),
  ('canakkale-ezine', 'Ezine', 'canakkale'),
  ('canakkale-gelibolu', 'Gelibolu', 'canakkale'),
  ('canakkale-gokceada', 'Gökçeada', 'canakkale'),
  ('canakkale-lapseki', 'Lapseki', 'canakkale'),
  ('canakkale-yenice', 'Yenice', 'canakkale')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO city_sites (id, slug, display_name, domain, province_slug, is_active)
VALUES ('canakkale', 'canakkale', 'Çanakkale', 'canakkale.nahaber.com', 'canakkale', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, updated_at = NOW();

INSERT INTO categories (id, name, slug, parent_id, icon_name, color, is_standalone) VALUES
  ('trend','Trending','trend',null,'flame','#FF6B35',false),
  ('gundem','Gündem','gundem',null,'newspaper','#EF4444',false),
  ('yerel-haber','Yerel Haber','yerel-haber',null,'map-pin','#059669',false),
  ('siyaset','Siyaset','siyaset',null,'landmark','#7C3AED',false),
  ('dunya','Dünya','dunya',null,'globe','#6B7280',false),
  ('kibris-haberleri','Kıbrıs Haberleri','kibris-haberleri',null,'flag','#0E7490',false),
  ('ekonomi','Ekonomi','ekonomi',null,'trending-up','#F59E0B',false),
  ('teknoloji','Teknoloji','teknoloji',null,'cpu','#3B82F6',false),
  ('saglik','Sağlık','saglik',null,'heart','#EC4899',false),
  ('bilim','Bilim','bilim',null,'flask','#14B8A6',false),
  ('egitim','Eğitim','egitim',null,'graduation-cap','#2563EB',false),
  ('cevre-iklim','Çevre & İklim','cevre-iklim',null,'tree-pine','#15803D',false),
  ('oyun-espor','Oyun & Espor','oyun-espor',null,'gamepad-2','#7C3AED',false),
  ('din-inanc','Din & İnanç','din-inanc',null,'moon-star','#0F766E',false),
  ('magazin','Magazin','magazin',null,'star','#F472B6',false),
  ('spor','Spor','spor',null,'trophy','#10B981',false),
  ('kultur','Kültür','kultur',null,'palette','#8B5CF6',false),
  ('yasam','Yaşam','yasam',null,'leaf','#16A34A',false),
  ('gastronomi','Gastronomi','gastronomi',null,'utensils','#F97316',false),
  ('otomobil','Otomobil','otomobil',null,'car','#64748B',false),
  ('meteoroloji','Meteoroloji','meteoroloji',null,'cloud-rain','#0EA5E9',false),
  ('turizm','Turizm','turizm',null,'plane','#0284C7',false),
  ('gezi','Gezi','gezi',null,'map','#0891B2',false),
  ('asayis','3. Sayfa','asayis',null,'shield-alert','#B45309',false),
  ('tarih','Tarih','tarih',null,'book-open','#92400E',false),
  ('son-dakika','Son Dakika','son-dakika',null,'zap','#EF4444',false),
  ('etkinlikler','Etkinlikler','etkinlikler',null,'calendar','#8B5CF6',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, slug, parent_id, icon_name, color, is_standalone) VALUES
  ('borsa','Borsa','borsa','ekonomi','bar-chart-2','#22C55E',true),
  ('kripto','Kripto','kripto','ekonomi','bitcoin','#F7931A',true),
  ('finans-piyasa','Finans & Piyasa','finans-piyasa','ekonomi','chart-line','#D97706',false),
  ('emlak-konut','Emlak & Konut','emlak-konut','ekonomi','building-2','#B45309',false),
  ('enerji','Enerji','enerji','ekonomi','bolt','#CA8A04',false),
  ('is-kariyer','İş & Kariyer','is-kariyer','ekonomi','briefcase','#A16207',false),
  ('futbol','Futbol','futbol','spor','circle-dot','#10B981',true),
  ('basketbol','Basketbol','basketbol','spor','circle','#10B981',true),
  ('voleybol','Voleybol','voleybol','spor','circle','#10B981',true),
  ('hentbol','Hentbol','hentbol','spor','circle','#10B981',false),
  ('atletizm','Atletizm','atletizm','spor','zap','#10B981',false),
  ('gures','Güreş','gures','spor','swords','#10B981',false),
  ('dunya-kupasi-2026','2026 Dünya Kupası (Arşiv)','dunya-kupasi-2026','spor','trophy','#F59E0B',true),
  ('sinema','Sinema','sinema','kultur','film','#8B5CF6',false),
  ('tiyatro','Tiyatro','tiyatro','kultur','theater','#8B5CF6',false),
  ('konser','Konser','konser','kultur','music','#8B5CF6',false),
  ('festival','Festival','festival','kultur','party-popper','#8B5CF6',false),
  ('astroloji','Astroloji','astroloji','yasam','sparkles','#7C3AED',false),
  ('moda','Moda','moda','yasam','shirt','#DB2777',false),
  ('anne-cocuk','Anne & Çocuk','anne-cocuk','yasam','baby','#E879F9',false),
  ('dekorasyon','Dekorasyon','dekorasyon','yasam','sofa','#C2410C',false),
  ('iliskiler','İlişkiler','iliskiler','yasam','heart-handshake','#E11D48',false)
ON CONFLICT (id) DO NOTHING;
`

export async function POST(request: Request) {
  const token = request.headers.get('x-migrate-token')
  if (token !== MIGRATE_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 })
  }

  const sql = neon(url)
  const results: string[] = []

  try {
    // Run DDL — split on semicolon+newline, skip blanks/comments
    const ddlStatements = DDL
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    for (const stmt of ddlStatements) {
      await sql.unsafe(stmt)
      results.push(`DDL OK: ${stmt.substring(0, 60)}...`)
    }

    // Run seed
    const seedStatements = SEED_SQL
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    for (const stmt of seedStatements) {
      await sql.unsafe(stmt)
      results.push(`SEED OK: ${stmt.substring(0, 60)}...`)
    }

    // Verify
    const tables = await sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `
    const cityRow = await sql`
      SELECT id, slug, is_active FROM city_sites WHERE slug = 'canakkale'
    `

    return NextResponse.json({
      success: true,
      statementsRun: results.length,
      tables: tables.map((t: { tablename: string }) => t.tablename),
      canakkale: cityRow[0] ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: message, completedSteps: results },
      { status: 500 }
    )
  }
}
