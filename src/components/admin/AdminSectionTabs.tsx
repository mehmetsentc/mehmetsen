'use client'

/**
 * ADMIN-UX-1 — one sub-navigation row per admin work area.
 *
 * The sidebar shows ONE entry per area (e.g. «AI Ekip»); the pages of that area are
 * reached from this tab row under the page header. Routes do not change.
 * Crawler and Sosyal Medya keep their own existing tab bars (CrawlerNav / SocialAdminNav).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import type { CmsPermission } from '@/types/cms'
import { cn } from '@/lib/utils'

export type SectionTab = { href: string; label: string; requiredPermissions?: CmsPermission[] }
export type AdminSection = { id: string; label: string; tabs: SectionTab[] }

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'ai',
    label: 'AI ve Otomasyon',
    tabs: [
      { href: '/admin/ai-org', label: 'Organizasyon', requiredPermissions: ['agents:manage'] },
      { href: '/admin/ai-editors', label: 'AI Editörler', requiredPermissions: ['ai:use'] },
      { href: '/admin/ai-agents', label: 'AI Ajanlar', requiredPermissions: ['agents:manage'] },
      { href: '/admin/ai-instructions', label: 'Talimatlar', requiredPermissions: ['ai:instructions'] },
      { href: '/admin/ai-memory', label: 'Hafıza', requiredPermissions: ['ai:configure'] },
      { href: '/admin/ai-learning', label: 'Öğrenme', requiredPermissions: ['ai:configure'] },
      { href: '/admin/ai-tasks', label: 'Görevler', requiredPermissions: ['ai:use'] },
      { href: '/admin/ai-usage', label: 'AI Maliyet', requiredPermissions: ['ai:use'] },
    ],
  },
  {
    id: 'structure',
    label: 'İçerik Yapısı',
    tabs: [
      { href: '/admin/categories', label: 'Kategoriler', requiredPermissions: ['news:read'] },
      { href: '/admin/locations', label: '81 İl ve Lokasyon', requiredPermissions: ['locations:manage'] },
      { href: '/admin/publishers', label: 'Yayıncılar', requiredPermissions: ['system:settings'] },
      { href: '/admin/ekip', label: 'İl Ekipleri', requiredPermissions: ['users:assign_role'] },
      { href: '/admin/events', label: 'Etkinlikler', requiredPermissions: ['news:read'] },
    ],
  },
  {
    id: 'app',
    label: 'Uygulama',
    tabs: [
      { href: '/admin/page-controls', label: 'Sayfa Kontrolleri', requiredPermissions: ['pages:manage'] },
      { href: '/admin/global-layout', label: 'Global Dizilim', requiredPermissions: ['pages:manage'] },
      { href: '/admin/feed-algorithm', label: 'Algoritma', requiredPermissions: ['algorithm:view'] },
    ],
  },
  {
    id: 'system',
    label: 'Sistem',
    tabs: [
      { href: '/admin/users', label: 'Ekip ve Kullanıcılar', requiredPermissions: ['users:read'] },
      { href: '/admin/roles', label: 'Roller ve Yetkiler', requiredPermissions: ['roles:manage'] },
      { href: '/admin/settings', label: 'Global Ayarlar', requiredPermissions: ['system:settings'] },
      { href: '/admin/system-health', label: 'Sistem Durumu', requiredPermissions: ['system:settings'] },
      { href: '/admin/cron', label: 'Cron', requiredPermissions: ['cron:read'] },
      { href: '/admin/audit-logs', label: 'Loglar', requiredPermissions: ['logs:view'] },
    ],
  },
]

const tabActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

/** The work area a path belongs to (pure; exported for tests). */
export function sectionForPath(pathname: string): AdminSection | null {
  return ADMIN_SECTIONS.find((s) => s.tabs.some((t) => tabActive(pathname, t.href))) ?? null
}

export function AdminSectionTabs({ className }: { className?: string }) {
  const pathname = usePathname() ?? ''
  const { can } = useCmsAuth()
  const section = sectionForPath(pathname)
  if (!section) return null
  const tabs = section.tabs.filter((t) => !t.requiredPermissions || t.requiredPermissions.some((p) => can(p)))
  if (tabs.length < 2) return null
  return (
    <nav
      aria-label={section.label}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-4 scrollbar-hide sm:px-6',
        '[mask-image:linear-gradient(to_right,black_92%,transparent)] md:[mask-image:none]',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = tabActive(pathname, t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors max-md:py-3',
              active
                ? 'text-[rgb(var(--color-text))] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[rgb(var(--color-brand))]'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
