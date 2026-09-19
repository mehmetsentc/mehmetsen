import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { ROUTES } from '@/constants/routes'
import {
  CONTACT_EMAIL,
  FOOTER_BOTTOM_LINKS,
  FOOTER_NAV_COLUMNS,
  type FooterLink,
} from '@/constants/siteLegalLinks'

const SOCIAL = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? 'https://www.youtube.com/@nahabercom' },
] as const

const ACCOUNT = [
  { label: 'Giriş Yap', href: ROUTES.LOGIN },
  { label: 'Hesap Ayarları', href: ROUTES.SETTINGS },
  { label: 'Mobil Uygulama', href: ROUTES.APP },
  { label: 'İletişim Formu', href: '/iletisim#iletisim-formu' },
] as const

function FooterLinkItem({ link }: { link: FooterLink }) {
  const className =
    'text-[13px] leading-snug font-normal text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline'

  if (link.external || link.href.startsWith('http')) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
      </a>
    )
  }

  return (
    <Link href={link.href} prefetch={false} className={className}>
      {link.label}
    </Link>
  )
}

export function CityNewspaperFooter({ cityName }: { cityName: string }) {
  const year = new Date().getFullYear()

  return (
    <footer
      className="desktop-home-footer mt-10 border-t border-[rgb(var(--color-border))] pt-8 pb-10"
      role="contentinfo"
      data-testid="city-newspaper-footer"
    >
      <div className="mb-8">
        <Link href="/" className="inline-flex flex-col items-start gap-1 no-underline" aria-label={`${cityName} NaHaber`}>
          <span className="font-serif text-lg font-black text-[rgb(var(--color-text))]">{cityName}</span>
          <BrandWordmark variant="default" size="lg" className="font-black text-2xl" />
        </Link>
      </div>

      <div className="mb-8 border-t border-[rgb(var(--color-border))] pt-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-7">
          {FOOTER_NAV_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
                {column.title}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}-${link.href}`}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Hesap" className="col-span-2 sm:col-span-3 lg:col-span-1 lg:border-l lg:border-[rgb(var(--color-border))] lg:pl-8">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--color-text))]">
              Hesap
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {ACCOUNT.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="text-[13px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-[13px] font-bold text-[rgb(var(--color-text))] hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="mb-8 max-w-lg">
        <p className="mb-2 text-[13px] font-bold text-[rgb(var(--color-text))]">Güncel haberlere abone ol</p>
        <form action="/bulten" method="get" className="flex flex-wrap gap-2">
          <input
            type="email"
            name="email"
            required
            placeholder="E-posta adresiniz"
            className="min-w-[220px] flex-1 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-sm text-[rgb(var(--color-text))]"
          />
          <button
            type="submit"
            className="rounded-full bg-[#e50914] px-5 py-2 text-sm font-bold text-white"
          >
            Abone Ol
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {SOCIAL.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer me"
            className="text-[12px] font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
          >
            {item.label}
          </a>
        ))}
      </div>

      <div className="border-t border-[rgb(var(--color-border))] pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="m-0 text-[11px] text-[rgb(var(--color-muted))]">
            © {year} NaHaber. {cityName} dijital gazetesi. Tüm hakları saklıdır.
          </p>
          <nav aria-label="Yasal bağlantılar">
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
              {FOOTER_BOTTOM_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="text-[11px] text-[rgb(var(--color-muted))] hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
