'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Search } from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import { useMobileAdmin } from './MobileAdminContext'
import { cn } from '@/lib/utils'

/** Primary bottom-nav roots — brand chrome, no back. */
const PRIMARY_EXACT = new Set(['/admin', '/admin/approvals', '/admin/news', '/admin/menu'])

const NESTED_TITLES: { prefix: string; title: string; backHref: string }[] = [
  { prefix: '/admin/inbox', title: 'Gelen Kutusu', backHref: '/admin/menu' },
  { prefix: '/admin/submissions', title: 'Gönderiler', backHref: '/admin/menu' },
  { prefix: '/admin/job-classifieds', title: 'İş Kariyer', backHref: '/admin/menu' },
  { prefix: '/admin/archive', title: 'Arşiv', backHref: '/admin/menu' },
  { prefix: '/admin/videos', title: 'Videolar', backHref: '/admin/menu' },
  { prefix: '/admin/newsroom', title: 'AI Newsroom', backHref: '/admin/menu' },
  { prefix: '/admin/ai-editors', title: 'AI Editörler', backHref: '/admin/menu' },
  { prefix: '/admin/ai', title: 'AI Asistan', backHref: '/admin/menu' },
  { prefix: '/admin/seo', title: 'SEO', backHref: '/admin/menu' },
  { prefix: '/admin/social', title: 'Sosyal Medya', backHref: '/admin/menu' },
  { prefix: '/admin/newsletter', title: 'E-posta Bülteni', backHref: '/admin/menu' },
  { prefix: '/admin/ads', title: 'Reklamlar', backHref: '/admin/menu' },
  { prefix: '/admin/analytics', title: 'Analitik', backHref: '/admin/menu' },
  { prefix: '/admin/most-read', title: 'En Çok Okunanlar', backHref: '/admin/menu' },
  { prefix: '/admin/categories', title: 'Kategoriler', backHref: '/admin/menu' },
  { prefix: '/admin/editors', title: 'Editörler', backHref: '/admin/menu' },
  { prefix: '/admin/authors', title: 'Yazarlar', backHref: '/admin/menu' },
  { prefix: '/admin/users', title: 'Kullanıcılar', backHref: '/admin/menu' },
  { prefix: '/admin/settings', title: 'Ayarlar', backHref: '/admin/menu' },
  { prefix: '/admin/cron', title: 'Cron', backHref: '/admin/menu' },
  { prefix: '/admin/reports', title: 'Raporlar', backHref: '/admin/menu' },
]

function resolveNestedMeta(pathname: string): { title: string; backHref: string } | null {
  if (PRIMARY_EXACT.has(pathname)) return null
  // Keep news list + query filters on primary chrome
  if (pathname === '/admin/news') return null
  for (const entry of NESTED_TITLES) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      return { title: entry.title, backHref: entry.backHref }
    }
  }
  // Fallback: any other /admin/* nested screen
  if (pathname.startsWith('/admin/') && pathname !== '/admin') {
    const segment = pathname.split('/').filter(Boolean).pop() ?? 'Sayfa'
    const title = segment
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ')
    return { title, backHref: '/admin/menu' }
  }
  return null
}

export function MobileAdminHeader() {
  const { user, roleLabel } = useCmsAuth()
  const { hideChrome, pendingBadge, openSearch, openNotif } = useMobileAdmin()
  const pathname = usePathname()
  const router = useRouter()

  if (hideChrome) return null

  const nested = resolveNestedMeta(pathname)
  const initial =
    user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'N'

  return (
    <header
      className="sticky top-0 z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 backdrop-blur-md md:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex h-14 items-center gap-1 px-2">
        {nested ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back()
                  return
                }
                router.push(nested.backHref)
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[rgb(var(--color-text))]"
              aria-label="Geri"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-[rgb(var(--color-text))]">
                {nested.title}
              </p>
              <p className="truncate text-[11px] text-[rgb(var(--color-muted))]">Menü</p>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-[rgb(var(--color-text))]">
              <span className="text-[rgb(var(--color-brand))]">Na</span>Haber Newsroom
            </p>
            <p className="truncate text-[11px] text-[rgb(var(--color-muted))]">{roleLabel}</p>
          </div>
        )}

        <button
          type="button"
          onClick={openSearch}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
          aria-label="Ara"
        >
          <Search className="h-5 w-5" />
        </button>

        <AdminThemeToggle className="shrink-0" />

        <button
          type="button"
          onClick={openNotif}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
          aria-label="Bildirimler"
        >
          <Bell className="h-5 w-5" />
          {pendingBadge > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-1 text-[9px] font-bold text-white">
              {pendingBadge > 99 ? '99+' : pendingBadge}
            </span>
          ) : null}
        </button>

        <Link
          href="/admin/menu"
          className={cn(
            'ml-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-xs font-bold text-white'
          )}
          title={roleLabel}
          aria-label="Profil ve menü"
        >
          {initial}
        </Link>
      </div>
    </header>
  )
}
