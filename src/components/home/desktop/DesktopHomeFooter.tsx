import Link from 'next/link'
import { LogIn, Mail, Settings, Smartphone, UserPlus } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import {
  CONTACT_EMAIL,
  FOOTER_ACCOUNT_LINKS,
  FOOTER_BOTTOM_LINKS,
  FOOTER_NAV_COLUMNS,
  type FooterLink,
} from '@/constants/siteLegalLinks'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'
import { cn } from '@/lib/utils'

const SOCIAL = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? 'https://www.youtube.com/@nahabercom' },
] as const

const ACCOUNT_ICONS: Record<string, typeof LogIn> = {
  'Giriş Yap': LogIn,
  'Kayıt Ol': UserPlus,
  'Hesap Ayarları': Settings,
  'Mobil Uygulama': Smartphone,
  'İletişim Formu': Mail,
}

function FooterLinkItem({ link, bold = false }: { link: FooterLink; bold?: boolean }) {
  const className = cn(
    'text-[13px] leading-snug transition-colors hover:underline',
    bold
      ? 'font-bold text-[rgb(var(--color-text))]'
      : 'font-normal text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
  )

  if (link.external || link.href.startsWith('http')) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
      </a>
    )
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  )
}

function FooterColumn({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
        {title}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {links.map((link) => (
          <li key={`${title}-${link.href}`}>
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function DesktopHomeFooter() {
  const year = new Date().getFullYear()
  const siteUrl = getSiteUrl()

  return (
    <footer
      className="desktop-home-footer mt-14 border-t border-[rgb(var(--color-border))] pt-8 font-[family-name:var(--font-inter,Inter,system-ui,sans-serif)]"
      role="contentinfo"
      itemScope
      itemType="https://schema.org/WPFooter"
    >
      <div className="mb-8">
        <Link href={ROUTES.FEED} className="inline-flex items-center gap-2.5" aria-label="NaHaber Ana Sayfa">
          <BrandLogo size="md" />
          <span className="text-2xl font-black tracking-tight text-[rgb(var(--color-text))]" itemProp="name">
            NaHaber
          </span>
        </Link>
      </div>

      <div className="mb-8 border-t border-[rgb(var(--color-border))] pt-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {FOOTER_NAV_COLUMNS.map((column) => (
            <FooterColumn key={column.title} title={column.title} links={column.links} />
          ))}

          <nav
            aria-label="Hesap"
            className="col-span-2 border-[rgb(var(--color-border))] sm:col-span-3 lg:col-span-1 lg:border-l lg:pl-8"
          >
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
              Hesap
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {FOOTER_ACCOUNT_LINKS.map((link) => {
                const Icon = ACCOUNT_ICONS[link.label]
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex items-center gap-2 text-[13px] font-bold text-[rgb(var(--color-text))] transition-colors hover:underline"
                    >
                      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                      {link.label}
                    </Link>
                  </li>
                )
              })}
              <li className="pt-1">
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 text-[13px] font-bold text-[rgb(var(--color-text))] transition-colors hover:underline"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {SOCIAL.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer me"
            aria-label={`NaHaber ${s.label}`}
            className="text-[12px] font-medium text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
          >
            {s.label}
          </a>
        ))}
      </div>

      <div className="border-t border-[rgb(var(--color-border))] pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="m-0 text-[11px] text-[rgb(var(--color-muted))]">
            © {year}{' '}
            <Link href={siteUrl} className="hover:underline">
              NaHaber
            </Link>
            . Tüm hakları saklıdır.
          </p>

          <nav aria-label="Yasal bağlantılar">
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
              {FOOTER_BOTTOM_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[11px] text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-4 max-w-4xl text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
          NaHaber bağımsız bir dijital haber platformudur. Gündem, son dakika, spor, ekonomi,
          turizm, teknoloji ve magazin haberlerini tarafsız biçimde sunar.
        </p>
      </div>
    </footer>
  )
}
