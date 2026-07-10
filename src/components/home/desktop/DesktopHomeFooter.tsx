import Link from 'next/link'
import { Mail } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { DesktopSiteNavLinks } from '@/components/home/desktop/DesktopSiteNavLinks'
import { CONTACT_EMAIL, FOOTER_LEGAL_LINKS } from '@/constants/siteLegalLinks'
import { getSitemapLinks } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'

const SOCIAL = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? 'https://www.youtube.com/@nahabercom' },
] as const

export function DesktopHomeFooter() {
  const year = new Date().getFullYear()
  const siteUrl = getSiteUrl()
  const sitemapLinks = getSitemapLinks(siteUrl)

  return (
    <footer
      className="desktop-home-footer mt-12 border-t border-[rgb(var(--color-border))] pt-10"
      role="contentinfo"
      itemScope
      itemType="https://schema.org/WPFooter"
    >
      <div className="mb-8 flex items-center gap-3">
        <Link href={ROUTES.FEED} aria-label="NaHaber Ana Sayfa">
          <BrandLogo size="md" />
        </Link>
        <Link
          href={ROUTES.FEED}
          className="text-xl font-black tracking-tight text-[rgb(var(--color-text))] hover:underline"
          itemProp="name"
        >
          NaHaber
        </Link>
      </div>

      <nav aria-label="Haber kategorileri" itemScope itemType="https://schema.org/SiteNavigationElement">
        <DesktopSiteNavLinks variant="footer" className="mb-6" />
      </nav>

      <div className="mb-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <section aria-label="İletişim bilgileri">
          <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--color-muted))]">
            İletişim
          </h2>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-text))] transition-colors hover:text-[rgb(var(--color-brand))]"
          >
            <Mail className="h-4 w-4 shrink-0" />
            {CONTACT_EMAIL}
          </a>
          <p className="mt-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
            Sorularınız ve geri bildirimleriniz için bize yazın.
          </p>
          <Link
            href="/iletisim#iletisim-formu"
            className="mt-3 inline-block text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
          >
            İletişim formu →
          </Link>
        </section>

        <section aria-label="Yasal belgeler" className="sm:col-span-1 lg:col-span-2">
          <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--color-muted))]">
            Yasal Belgeler ve Politikalar
          </h2>
          <ul className="grid list-none grid-cols-1 gap-x-6 gap-y-2 p-0 m-0 sm:grid-cols-2 lg:grid-cols-3">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <nav aria-label="Site haritası" className="mb-6">
        <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-[rgb(var(--color-muted))]">
          Site Haritası
        </h2>
        <ul className="flex list-none flex-wrap gap-x-4 gap-y-2 p-0 m-0">
          {sitemapLinks.map((link) => {
            const isExternal = link.href.startsWith('http')
            return (
              <li key={link.href}>
                {isExternal ? (
                  <a
                    href={link.href}
                    title={link.description}
                    rel="sitemap"
                    className="text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    title={link.description}
                    className="text-sm font-semibold text-[rgb(var(--color-text))] transition-colors hover:underline"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <nav aria-label="Sosyal medya" className="mb-6 flex flex-wrap gap-3">
        {SOCIAL.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer me"
            aria-label={`NaHaber ${s.label} hesabı`}
            className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-muted))] transition-colors hover:border-[rgb(var(--color-text))] hover:text-[rgb(var(--color-text))]"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <p className="max-w-3xl text-xs leading-relaxed text-[rgb(var(--color-muted))]">
        NaHaber bağımsız bir dijital haber platformudur. Gündem, son dakika, spor, ekonomi,
        turizm, teknoloji ve magazin haberlerini tarafsız biçimde sunar. Dış bağlantılar üçüncü
        taraf sitelere yönlendirebilir; NaHaber bu sitelerin içeriğinden sorumlu değildir.
      </p>
      <p className="mt-4 text-xs text-[rgb(var(--color-muted))]">
        © {year}{' '}
        <Link href={siteUrl} className="hover:underline">
          NaHaber
        </Link>
        . Tüm hakları saklıdır.
      </p>
    </footer>
  )
}
