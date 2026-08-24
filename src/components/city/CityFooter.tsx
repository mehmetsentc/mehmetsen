'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { AppDownloadBadges } from '@/components/layout/AppDownloadBadges'
import { CONTACT_EMAIL, FOOTER_BOTTOM_LINKS } from '@/constants/siteLegalLinks'
import { ROUTES } from '@/constants/routes'
import { isDutyPharmacyCity } from '@/lib/dutyPharmacies/constants'
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
const NEWS_STATIC = [
  { label: 'Ana Sayfa',   href: '/' },
  { label: 'Etkinlik',    href: '/etkinlik' },
  { label: 'İş İlanları', href: '/is-ilanlari' },
  { label: 'İlçeler',     href: '/ilceler' },
  { label: 'Müzeler',     href: '/muzeler' },
] as const

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

const linkClass =
  'text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline'

function FooterLinks({ items, external = false }: { items: readonly SimpleLink[]; external?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((l) =>
        external && l.href.startsWith('http') ? (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {l.label}
            </a>
          </li>
        ) : (
          <li key={l.label}>
            <Link href={l.href} className={linkClass}>
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
          <Link href={`/kategori/${cat.slug || cat.id}`} className={linkClass}>
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
      {children}
    </h2>
  )
}

function BrandLockup({ cityName, size }: { cityName: string; size: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo size={size} />
      <div className="leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--color-muted))]">
          {cityName}
        </span>
        <span
          className={
            size === 'md'
              ? 'block text-2xl font-black tracking-tight text-[rgb(var(--color-text))]'
              : 'block text-lg font-black tracking-tight text-[rgb(var(--color-text))]'
          }
        >
          NaHaber
        </span>
      </div>
    </div>
  )
}

function QuietCategoryLinks({ items }: { items: SimpleLink[] }) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Kategoriler">
      <SectionLabel>Kategoriler</SectionLabel>
      <ul className="m-0 flex list-none flex-wrap gap-x-1 gap-y-2 p-0">
        {items.map((l, i) => (
          <li key={l.href} className="inline-flex items-center">
            {i > 0 ? (
              <span className="mx-1.5 select-none text-[11px] text-[rgb(var(--color-border))]" aria-hidden>
                ·
              </span>
            ) : null}
            <Link
              href={l.href}
              className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function SocialRow() {
  return (
    <nav aria-label="Sosyal medya" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {SOCIAL.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer me"
          aria-label={`NaHaber ${s.label}`}
          className="text-[12px] font-medium text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}

function LegalLinks() {
  return (
    <nav aria-label="Yasal bağlantılar">
      <ul className="m-0 flex list-none flex-wrap gap-x-1 gap-y-2 p-0">
        {FOOTER_BOTTOM_LINKS.map((l, i) => (
          <li key={l.href} className="inline-flex items-center">
            {i > 0 ? (
              <span className="mx-1.5 select-none text-[10px] text-[rgb(var(--color-border))]" aria-hidden>
                ·
              </span>
            ) : null}
            <Link
              href={l.href}
              className="text-[11px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Ana bileşen
───────────────────────────────────────────────────────────────────────────── */
interface CityFooterProps {
  cityName: string
  provinceSlug: string
  /** Haber detayında gövde içi bülten varken footer aboneliğini gizle. */
  suppressNewsletter?: boolean
}

export function CityFooter({ cityName, provinceSlug, suppressNewsletter = false }: CityFooterProps) {
  const { categories } = useCityCategoryFilter()
  const { news, life, culture } = groupCategories(categories)
  const year = new Date().getFullYear()
  const newsStatic = isDutyPharmacyCity(provinceSlug)
    ? [
        ...NEWS_STATIC.slice(0, 3),
        { label: 'Nöbetçi Eczaneler', href: ROUTES.CITY_DUTY_PHARMACIES },
        ...NEWS_STATIC.slice(3),
      ]
    : NEWS_STATIC

  const newsLinks: SimpleLink[] = news.map((c) => ({
    label: c.name,
    href: `/kategori/${c.slug || c.id}`,
  }))
  const lifeLinks: SimpleLink[] = life.map((c) => ({
    label: c.name,
    href: `/kategori/${c.slug || c.id}`,
  }))
  const cultureLinks: SimpleLink[] = culture.map((c) => ({
    label: c.name,
    href: `/kategori/${c.slug || c.id}`,
  }))
  const allCategoryLinks = [...newsLinks, ...lifeLinks, ...cultureLinks]

  return (
    <footer
      className="mt-10 border-t border-[rgb(var(--color-border))] font-[family-name:var(--font-inter,Inter,system-ui,sans-serif)]"
      role="contentinfo"
    >
      {/* ══════════ MOBİL ══════════ */}
      <div className="block px-4 pt-8 pb-8 lg:hidden">
        <BrandLockup cityName={cityName} size="sm" />

        <div className="mt-7 space-y-7">
          {allCategoryLinks.length > 0 ? <QuietCategoryLinks items={allCategoryLinks} /> : null}

          <div className="border-t border-[rgb(var(--color-border))] pt-7">
            <SectionLabel>Takip & uygulama</SectionLabel>
            <div className="space-y-4">
              <SocialRow />
              <AppDownloadBadges variant="minimal" />
            </div>
          </div>

          {!suppressNewsletter ? (
            <div className="border-t border-[rgb(var(--color-border))] pt-7">
              <SectionLabel>Bülten</SectionLabel>
              <NewsletterSignup
                source="city-footer"
                variant="compact"
                title=""
                description="Önemli gelişmeleri e-posta ile alın. İstediğiniz zaman abonelikten çıkabilirsiniz."
              />
            </div>
          ) : null}

          <div className="border-t border-[rgb(var(--color-border))] pt-7 space-y-4">
            <LegalLinks />
            <p className="m-0 text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
              © {year}{' '}
              <Link
                href="https://nahaber.com"
                className="font-medium text-[rgb(var(--color-text))] hover:underline"
              >
                NaHaber
              </Link>
              . Tüm hakları saklıdır.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════ DESKTOP ══════════ */}
      <div className="hidden lg:block pt-10">
        <div className="mb-8">
          <BrandLockup cityName={cityName} size="md" />
        </div>

        <div className="border-t border-[rgb(var(--color-border))] pt-8 mb-10">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            <nav aria-label="Haberler">
              <ColHeader title="Haberler" />
              <CategoryLinks cats={news} />
              {newsStatic.length > 0 && (
                <ul className="m-0 mt-2.5 flex list-none flex-col gap-2.5 border-t border-[rgb(var(--color-border))] p-0 pt-2.5">
                  {newsStatic.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className={linkClass}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </nav>

            {(life.length > 0 || LIFE_STATIC.length > 0) && (
              <nav aria-label="Yaşam">
                <ColHeader title="Yaşam" />
                <CategoryLinks cats={life} />
                {LIFE_STATIC.length > 0 && (
                  <ul className="m-0 mt-2.5 flex list-none flex-col gap-2.5 border-t border-[rgb(var(--color-border))] p-0 pt-2.5">
                    {LIFE_STATIC.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className={linkClass}>
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
            )}

            {culture.length > 0 && (
              <nav aria-label="Kültür ve Teknoloji">
                <ColHeader title="Kültür & Teknoloji" />
                <CategoryLinks cats={culture} />
              </nav>
            )}

            <nav aria-label="Kurumsal">
              <ColHeader title="Kurumsal" />
              <FooterLinks items={KURUMSAL} external />
            </nav>

            <nav
              aria-label="Hesap"
              className="col-span-2 sm:col-span-1 lg:col-span-1 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-6"
            >
              <ColHeader title="Hesap" />
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {HESAP.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={linkClass}>
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li className="pt-1">
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
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

        <div className="mb-10 grid gap-8 border-t border-[rgb(var(--color-border))] pt-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start lg:gap-12">
          {!suppressNewsletter ? (
            <div>
              <SectionLabel>Bülten</SectionLabel>
              <NewsletterSignup
                source="city-footer"
                variant="compact"
                title=""
                description="Önemli gelişmeleri e-posta ile alın. İstediğiniz zaman abonelikten çıkabilirsiniz."
              />
            </div>
          ) : (
            <div />
          )}
          <div className="space-y-5 lg:pt-0.5">
            <div>
              <SectionLabel>Takip & uygulama</SectionLabel>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <SocialRow />
                <span className="hidden h-3 w-px bg-[rgb(var(--color-border))] sm:block" aria-hidden />
                <AppDownloadBadges variant="minimal" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[rgb(var(--color-border))] pt-6 pb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <p className="m-0 text-[11px] text-[rgb(var(--color-muted))]">
              © {year}{' '}
              <Link href="https://nahaber.com" className="hover:underline">
                NaHaber
              </Link>
              . Tüm hakları saklıdır.
            </p>
            <LegalLinks />
          </div>
          <p className="mt-5 max-w-3xl text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
            {cityName} NaHaber, {cityName} iline ait güncel haberler, etkinlikler, kültür ve
            yaşam içeriklerini tarafsız biçimde sunan bağımsız bir dijital haber platformudur.
          </p>
        </div>
      </div>
    </footer>
  )
}
