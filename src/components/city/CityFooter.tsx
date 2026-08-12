'use client'

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { CONTACT_EMAIL, FOOTER_BOTTOM_LINKS } from '@/constants/siteLegalLinks'
import { useCityTenant } from '@/store/cityTenantContext'

const SOCIAL = [
  { label: 'X',         href: process.env.NEXT_PUBLIC_X_URL       ?? 'https://x.com/nahabercom' },
  { label: 'Facebook',  href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube',   href: process.env.NEXT_PUBLIC_YOUTUBE_URL  ?? 'https://www.youtube.com/@nahabercom' },
] as const

/** City-specific nav columns — linked to the city feed sub-paths */
function buildColumns(citySlug: string) {
  const base = `/${citySlug}`
  return [
    {
      title: 'Haberler',
      links: [
        { label: 'Ana Sayfa',     href: '/' },
        { label: 'Son Dakika',    href: `${base}/son-dakika` },
        { label: 'Güncel',        href: `${base}/gundem` },
        { label: 'Yerel Haber',   href: `${base}/yerel-haber` },
        { label: '3. Sayfa',      href: `${base}/asayis` },
        { label: 'Siyaset',       href: `${base}/siyaset` },
      ],
    },
    {
      title: 'Spor & Ekonomi',
      links: [
        { label: 'Spor',      href: `${base}/spor` },
        { label: 'Futbol',    href: `${base}/futbol` },
        { label: 'Basketbol', href: `${base}/basketbol` },
        { label: 'Ekonomi',   href: `${base}/ekonomi` },
      ],
    },
    {
      title: 'Yaşam',
      links: [
        { label: 'Yaşam',    href: `${base}/yasam` },
        { label: 'Sağlık',   href: `${base}/saglik` },
        { label: 'Eğitim',   href: `${base}/egitim` },
        { label: 'Turizm',   href: `${base}/turizm` },
        { label: 'Etkinlik', href: '/etkinlik' },
        { label: 'Müzeler',  href: '/muzeler' },
      ],
    },
    {
      title: 'Kültür & Medya',
      links: [
        { label: 'Kültür Sanat', href: `${base}/kultur` },
        { label: 'Konser',       href: `${base}/konser` },
        { label: 'Video',        href: '/video' },
        { label: 'RSS Beslemeleri', href: 'https://nahaber.com/rss', external: true },
        { label: 'Haberler RSS', href: 'https://nahaber.com/rss.xml', external: true },
      ],
    },
    {
      title: 'Kurumsal',
      links: [
        { label: 'Hakkımızda',   href: '/hakkimizda' },
        { label: 'Künye',        href: '/kunye' },
        { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
        { label: 'Reklam',       href: '/iletisim' },
        { label: 'İletişim',     href: '/iletisim' },
      ],
    },
  ] as const
}

interface CityFooterProps {
  cityName: string
  provinceSlug: string
}

export function CityFooter({ cityName, provinceSlug }: CityFooterProps) {
  const year = new Date().getFullYear()
  const columns = buildColumns(provinceSlug)

  return (
    <footer
      className="mt-10 border-t border-[rgb(var(--color-border))] font-[family-name:var(--font-inter,Inter,system-ui,sans-serif)]"
      role="contentinfo"
    >
      {/* ── Mobil footer ── */}
      <div className="block px-4 pt-7 pb-6 space-y-6 lg:hidden">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="sm" />
          <span className="text-lg font-black text-[rgb(var(--color-text))]">
            {cityName} <span className="text-[rgb(var(--color-accent,red))]">Na</span>Haber
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-[rgb(var(--color-muted))] -mt-3">
          {cityName} haberleri, etkinlikleri ve güncel bilgiler
        </p>

        {/* Hızlı linkler */}
        <div className="flex flex-wrap gap-2">
          {columns.flatMap((col) => [...col.links]).slice(0, 12).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-[12px] font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Sosyal medya */}
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

      {/* ── Desktop footer ── */}
      <div className="hidden lg:block pt-8">
        {/* Logo + şehir adı */}
        <div className="mb-8 flex items-center gap-2.5">
          <BrandLogo size="md" />
          <div className="leading-tight">
            <span className="block text-[11px] font-bold uppercase tracking-widest text-[rgb(var(--color-muted))]">
              {cityName}
            </span>
            <span className="block text-2xl font-black text-[rgb(var(--color-text))]">
              NaHaber
            </span>
          </div>
        </div>

        {/* Nav sütunlar */}
        <div className="mb-8 border-t border-[rgb(var(--color-border))] pt-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {columns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
                  {col.title}
                </h2>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      {'external' in link && link.external ? (
                        <a href={link.href} target="_blank" rel="noopener noreferrer"
                          className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href}
                          className="text-[13px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            {/* Hesap / iletişim sütunu */}
            <nav aria-label="İletişim"
              className="col-span-2 border-[rgb(var(--color-border))] sm:col-span-3 lg:col-span-1 lg:border-l lg:pl-8"
            >
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
                Hesap
              </h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                <li>
                  <Link href="/giris"
                    className="text-[13px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    Giriş Yap
                  </Link>
                </li>
                <li>
                  <Link href="/kayit"
                    className="text-[13px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    Üye Ol
                  </Link>
                </li>
                <li>
                  <Link href="/hesap/ayarlar"
                    className="text-[13px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    Hesap Ayarları
                  </Link>
                </li>
                <li>
                  <Link href="/mobil-uygulama"
                    className="text-[13px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    Mobil Uygulama
                  </Link>
                </li>
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
        <div className="mb-6 flex flex-wrap gap-3">
          {SOCIAL.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer me"
              aria-label={`NaHaber ${s.label}`}
              className="text-[12px] font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
            >
              {s.label}
            </a>
          ))}
        </div>

        {/* Alt çizgi: copyright + yasal linkler */}
        <div className="border-t border-[rgb(var(--color-border))] pt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="m-0 text-[11px] text-[rgb(var(--color-muted))]">
              © {year}{' '}
              <Link href="https://nahaber.com" className="hover:underline">NaHaber</Link>
              . Tüm hakları saklıdır.
            </p>
            <nav aria-label="Yasal bağlantılar">
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
                {FOOTER_BOTTOM_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}
                      className="text-[11px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                    >
                      {link.label}
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
