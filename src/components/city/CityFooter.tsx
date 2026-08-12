'use client'

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { CONTACT_EMAIL, FOOTER_BOTTOM_LINKS } from '@/constants/siteLegalLinks'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import type { CityCategory } from '@/services/cityNewsService.server'

/* ─────────────────────────────────────────────────────────────────────────────
   Kategori slug → tematik grup haritası
   Haritada olmayan slug'lar → HABERLER sütununa düşer (default)
───────────────────────────────────────────────────────────────────────────── */
type CatGroup = 'life' | 'culture'

const SLUG_TO_GROUP: Record<string, CatGroup> = {
  // YAŞAM
  yasam: 'life', turizm: 'life', gezi: 'life', saglik: 'life',
  gastronomi: 'life', magazin: 'life', muzeler: 'life',
  'cevre-iklim': 'life', 'din-inanc': 'life',
  spor: 'life', futbol: 'life', basketbol: 'life',
  // KÜLTÜR & TEKNOLOJİ
  kultur: 'culture', 'kultur-sanat': 'culture',
  sinema: 'culture', tiyatro: 'culture', konser: 'culture',
  egitim: 'culture', tarih: 'culture', etkinlik: 'culture',
  teknoloji: 'culture', bilim: 'culture', otomobil: 'culture',
  meteoroloji: 'culture', 'hava-durumu': 'culture', 'oyun-espor': 'culture',
}

function groupCategories(cats: CityCategory[]) {
  const news: CityCategory[] = []
  const life: CityCategory[] = []
  const culture: CityCategory[] = []
  for (const cat of cats) {
    // ID veya slug üzerinden eşleştir
    const g = SLUG_TO_GROUP[cat.id] ?? SLUG_TO_GROUP[cat.slug]
    if (g === 'life') life.push(cat)
    else if (g === 'culture') culture.push(cat)
    else news.push(cat)
  }
  return { news, life, culture }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sabit linkler
───────────────────────────────────────────────────────────────────────────── */
// Haberlerin altına eklenen statik sayfalar
const NEWS_STATIC = [
  { label: 'Ana Sayfa',   href: '/' },
  { label: 'Etkinlik',    href: '/etkinlik' },
  { label: 'İlçeler',     href: '/ilceler' },
  { label: 'Müzeler',     href: '/muzeler' },
] as const

// Yaşam sütununun altına eklenen statik
const LIFE_STATIC = [
  { label: 'Spor', href: '/spor' },
] as const

const KURUMSAL = [
  { label: 'Hakkımızda',        href: '/hakkimizda' },
  { label: 'Künye',             href: '/kunye' },
  { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
  { label: 'Reklam',            href: '/iletisim' },
  { label: 'İletişim',          href: '/iletisim' },
  { label: 'RSS Beslemeleri',   href: 'https://nahaber.com/rss' },
] as const

const HESAP = [
  { label: 'Giriş Yap',      href: '/giris' },
  { label: 'Üye Ol',         href: '/kayit' },
  { label: 'Hesap Ayarları', href: '/hesap/ayarlar' },
  { label: 'Mobil Uygulama', href: '/mobil-uygulama' },
] as const

const SOCIAL = [
  { label: 'X',         href: process.env.NEXT_PUBLIC_X_URL        ?? 'https://x.com/nahabercom' },
  { label: 'Facebook',  href: process.env.NEXT_PUBLIC_FACEBOOK_URL  ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube',   href: process.env.NEXT_PUBLIC_YOUTUBE_URL   ?? 'https://www.youtube.com/@nahabercom' },
] as const

/* ─────────────────────────────────────────────────────────────────────────────
   Yardımcı: link listesi render
───────────────────────────────────────────────────────────────────────────── */
type SimpleLink = { label: string; href: string }

function FooterLinks({ items, external = false }: { items: readonly SimpleLink[]; external?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((l) =>
        external && l.href.startsWith('http') ? (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
            >
              {l.label}
            </a>
          </li>
        ) : (
          <li key={l.label}>
            <Link href={l.href}
              className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
            >
              {l.label}
            </Link>
          </li>
        )
      )}
    </ul>
  )
}

function CategoryLinks({ cats }: { cats: CityCategory[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {cats.map((cat) => (
        <li key={cat.id}>
          <Link href={`/#category-rail-${cat.id}`}
            className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
          >
            {cat.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ColHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
      {title}
    </h2>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Ana bileşen
───────────────────────────────────────────────────────────────────────────── */
interface CityFooterProps {
  cityName: string
  provinceSlug: string
}

export function CityFooter({ cityName }: CityFooterProps) {
  const { categories } = useCityCategoryFilter()
  const { news, life, culture } = groupCategories(categories)
  const year = new Date().getFullYear()

  // Dinamik kategori linkleri (hash anchor)
  const newsLinks: SimpleLink[] = news.map((c) => ({ label: c.name, href: `/#category-rail-${c.id}` }))
  const lifeLinks: SimpleLink[] = life.map((c) => ({ label: c.name, href: `/#category-rail-${c.id}` }))
  const cultureLinks: SimpleLink[] = culture.map((c) => ({ label: c.name, href: `/#category-rail-${c.id}` }))

  return (
    <footer
      className="mt-10 border-t border-[rgb(var(--color-border))] font-[family-name:var(--font-inter,Inter,system-ui,sans-serif)]"
      role="contentinfo"
    >
      {/* ══════════ MOBİL ══════════ */}
      <div className="block px-4 pt-7 pb-6 space-y-5 lg:hidden">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <BrandLogo size="sm" />
          <div className="leading-tight">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
              {cityName}
            </span>
            <span className="block text-lg font-black text-[rgb(var(--color-text))]">NaHaber</span>
          </div>
        </div>

        {/* Kategori chips — hepsini tek satırda chip */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[...newsLinks, ...lifeLinks, ...cultureLinks].map((l) => (
              <Link key={l.href} href={l.href}
                className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-[12px] font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}

        {/* Sosyal */}
        <div className="flex items-center gap-4 border-t border-[rgb(var(--color-border))] pt-4">
          {SOCIAL.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer me"
              aria-label={`NaHaber ${s.label}`}
              className="text-[13px] font-semibold text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
            >
              {s.label}
            </a>
          ))}
        </div>

        {/* Yasal */}
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {FOOTER_BOTTOM_LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className="text-[11px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <p className="text-[11px] text-[rgb(var(--color-muted))] border-t border-[rgb(var(--color-border))] pt-4">
          © {year}{' '}
          <Link href="https://nahaber.com" className="font-medium hover:underline text-[rgb(var(--color-text))]">
            NaHaber
          </Link>
          . Tüm hakları saklıdır.
        </p>
      </div>

      {/* ══════════ DESKTOP ══════════ */}
      <div className="hidden lg:block pt-8">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-2.5">
          <BrandLogo size="md" />
          <div className="leading-tight">
            <span className="block text-[11px] font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
              {cityName}
            </span>
            <span className="block text-2xl font-black text-[rgb(var(--color-text))]">NaHaber</span>
          </div>
        </div>

        {/* Sütun ızgarası — nahaber.com ile aynı yapı */}
        <div className="border-t border-[rgb(var(--color-border))] pt-8 mb-8">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">

            {/* 1) HABERLER — haber/politika kategorileri + statik sayfalar */}
            <nav aria-label="Haberler">
              <ColHeader title="Haberler" />
              <CategoryLinks cats={news} />
              {NEWS_STATIC.length > 0 && (
                <ul className="m-0 mt-2.5 flex list-none flex-col gap-2.5 p-0 border-t border-[rgb(var(--color-border))] pt-2.5">
                  {NEWS_STATIC.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}
                        className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </nav>

            {/* 2) YAŞAM — turizm/sağlık/spor vb. kategoriler */}
            {(life.length > 0 || LIFE_STATIC.length > 0) && (
              <nav aria-label="Yaşam">
                <ColHeader title="Yaşam" />
                <CategoryLinks cats={life} />
                {LIFE_STATIC.length > 0 && (
                  <ul className="m-0 mt-2.5 flex list-none flex-col gap-2.5 p-0 border-t border-[rgb(var(--color-border))] pt-2.5">
                    {LIFE_STATIC.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href}
                          className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
            )}

            {/* 3) KÜLTÜR & TEKNOLOJİ */}
            {culture.length > 0 && (
              <nav aria-label="Kültür ve Teknoloji">
                <ColHeader title="Kültür & Teknoloji" />
                <CategoryLinks cats={culture} />
              </nav>
            )}

            {/* 4) KURUMSAL */}
            <nav aria-label="Kurumsal">
              <ColHeader title="Kurumsal" />
              <FooterLinks items={KURUMSAL} external />
            </nav>

            {/* 5) HESAP */}
            <nav aria-label="Hesap"
              className="col-span-2 sm:col-span-1 lg:col-span-1 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-6"
            >
              <ColHeader title="Hesap" />
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {HESAP.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}
                      className="text-[13px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li className="pt-1">
                  <a href={`mailto:${CONTACT_EMAIL}`}
                    className="inline-flex items-center gap-2 text-[13px] font-bold text-[rgb(var(--color-text))] hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {CONTACT_EMAIL}
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        {/* Sosyal medya */}
        <div className="mb-6 flex flex-wrap gap-4">
          {SOCIAL.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer me"
              aria-label={`NaHaber ${s.label}`}
              className="text-[12px] font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
            >
              {s.label}
            </a>
          ))}
        </div>

        {/* Alt çizgi */}
        <div className="border-t border-[rgb(var(--color-border))] pt-5 pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="m-0 text-[11px] text-[rgb(var(--color-muted))]">
              © {year}{' '}
              <Link href="https://nahaber.com" className="hover:underline">NaHaber</Link>
              . Tüm hakları saklıdır.
            </p>
            <nav aria-label="Yasal bağlantılar">
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
                {FOOTER_BOTTOM_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}
                      className="text-[11px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p className="mt-4 max-w-4xl text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
            {cityName} NaHaber, {cityName} iline ait güncel haberler, etkinlikler, kültür ve
            yaşam içeriklerini tarafsız biçimde sunan bağımsız bir dijital haber platformudur.
          </p>
        </div>
      </div>
    </footer>
  )
}
