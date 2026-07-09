import Link from 'next/link'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { getTopNavCategories } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

const NAV = getTopNavCategories()

const LEGAL = [
  { label: 'Hakkımızda', href: '/hakkimizda' },
  { label: 'İletişim', href: '/iletisim' },
  { label: 'Gizlilik', href: '/hukuk/gizlilik' },
  { label: 'Kullanım Koşulları', href: '/hukuk/kullanim-kosullari' },
  { label: 'Editoryal İlkeler', href: '/editoryal-ilkeler' },
  { label: 'Kurallar', href: ROUTES.FEED_CONTENT_POLICY },
] as const

const SOCIAL = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? 'https://www.youtube.com/@nahabercom' },
] as const

export function DesktopHomeFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="desktop-home-footer mt-12 border-t border-[rgb(var(--color-border))] pt-10">
      <div className="mb-8 flex items-center gap-3">
        <BrandLogo size="md" />
        <span className="text-xl font-black tracking-tight text-[rgb(var(--color-text))]">NaHaber</span>
      </div>

      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Site bölümleri">
        <Link href={ROUTES.FEED} className="text-sm font-semibold text-[rgb(var(--color-text))] hover:underline">
          Ana Sayfa
        </Link>
        {NAV.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            className="text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
          >
            {cat.label}
          </Link>
        ))}
        <Link
          href={ROUTES.LOCAL}
          className="text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
        >
          Yerel
        </Link>
        <Link
          href={ROUTES.REELS}
          className="text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))] hover:underline"
        >
          Teve
        </Link>
      </nav>

      <div className="mb-6 flex flex-wrap gap-3">
        {SOCIAL.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-muted))] transition-colors hover:border-[rgb(var(--color-text))] hover:text-[rgb(var(--color-text))]"
          >
            {s.label}
          </a>
        ))}
      </div>

      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2" aria-label="Yasal">
        {LEGAL.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <p className="max-w-3xl text-xs leading-relaxed text-[rgb(var(--color-muted))]">
        NaHaber bağımsız bir dijital haber platformudur. Dış bağlantılar üçüncü taraf sitelere
        yönlendirebilir; NaHaber bu sitelerin içeriğinden sorumlu değildir.
      </p>
      <p className="mt-4 text-xs text-[rgb(var(--color-muted))]">
        © {year} NaHaber. Tüm hakları saklıdır.
      </p>
    </footer>
  )
}
