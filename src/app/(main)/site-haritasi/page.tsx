import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteNavItems, getSitemapLinks } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Site Haritası',
  description: `${siteName} site haritası — tüm haber kategorileri, sayfalar ve XML site haritaları.`,
  alternates: { canonical: `${siteUrl}${ROUTES.SITE_MAP}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Site Haritası | ${siteName}`,
    description: 'NaHaber haber kategorileri ve sayfa dizini.',
    url: `${siteUrl}${ROUTES.SITE_MAP}`,
    type: 'website',
    locale: 'tr_TR',
    siteName,
  },
}

const UTILITY_PAGES = [
  { label: 'Hakkımızda', href: '/hakkimizda' },
  { label: 'Künye', href: '/kunye' },
  { label: 'İletişim', href: '/iletisim' },
  { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
  { label: 'Yerel Haberler', href: ROUTES.LOCAL },
  { label: 'Etkinlikler', href: ROUTES.EVENTS },
  { label: 'Teve', href: ROUTES.REELS },
  { label: 'Arama', href: ROUTES.SEARCH },
  { label: 'Gizlilik Politikası', href: '/gizlilik' },
  { label: 'Çerez Politikası', href: '/hukuk/cerez-politikasi' },
  { label: 'KVKK', href: '/hukuk/kvkk' },
  { label: 'Aydınlatma Metni', href: '/aydinlatma-metni' },
  { label: 'Kullanım Koşulları', href: '/hukuk/kullanim-kosullari' },
  { label: 'İçerik Kuralları', href: ROUTES.FEED_CONTENT_POLICY },
] as const

export default function SiteHaritasiPage() {
  const navItems = getSiteNavItems()
  const sitemapLinks = getSitemapLinks(siteUrl)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${siteName} Site Haritası`,
    description: 'NaHaber haber kategorileri ve sayfa dizini.',
    url: `${siteUrl}${ROUTES.SITE_MAP}`,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Site Haritası', item: `${siteUrl}${ROUTES.SITE_MAP}` },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: navItems.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
        url: `${siteUrl}${item.href}`,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[rgb(var(--color-muted))]">
          <ol className="flex list-none flex-wrap gap-2 p-0 m-0">
            <li>
              <Link href={ROUTES.FEED} className="hover:underline">
                Ana Sayfa
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page">Site Haritası</li>
          </ol>
        </nav>

        <h1 className="mb-2 text-2xl font-black text-[rgb(var(--color-text))]">Site Haritası</h1>
        <p className="mb-8 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
          NaHaber&apos;deki tüm haber kategorileri, önemli sayfalar ve arama motorları için XML
          site haritaları.
        </p>

        <section className="mb-10" aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="mb-4 text-lg font-bold text-[rgb(var(--color-text))]">
            Haber Kategorileri
          </h2>
          <ul className="grid list-none gap-2 p-0 m-0 sm:grid-cols-2">
            {navItems.map((item) => (
              <li key={item.id} className={item.indent ? 'pl-4' : undefined}>
                <Link
                  href={item.href}
                  title={`${item.label} haberleri`}
                  className="text-sm text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))] hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10" aria-labelledby="pages-heading">
          <h2 id="pages-heading" className="mb-4 text-lg font-bold text-[rgb(var(--color-text))]">
            Sayfalar
          </h2>
          <ul className="grid list-none gap-2 p-0 m-0 sm:grid-cols-2">
            {UTILITY_PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="text-sm text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))] hover:underline"
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="xml-heading">
          <h2 id="xml-heading" className="mb-4 text-lg font-bold text-[rgb(var(--color-text))]">
            XML Site Haritaları
          </h2>
          <ul className="list-none space-y-2 p-0 m-0">
            {sitemapLinks.slice(1).map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  rel="sitemap"
                  title={link.description}
                  className="text-sm text-[rgb(var(--color-brand))] hover:underline"
                >
                  {link.label}
                </a>
                <p className="text-xs text-[rgb(var(--color-muted))]">{link.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </>
  )
}
