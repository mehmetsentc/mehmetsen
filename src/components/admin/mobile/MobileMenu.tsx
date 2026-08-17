'use client'

import Link from 'next/link'
import {
  Newspaper, Clock, Archive, Video, BrainCircuit, Bot, Search, Share2,
  BarChart3, Users, UserCog, UserCheck, Settings, Mail, Inbox, ArrowLeft,
  Megaphone, Tag, LogOut, Flame, Briefcase, Timer, Coins,
} from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useAuth } from '@/hooks/useAuth'
import { CMS_ROLE_COLORS } from '@/types/cms'
import { cn } from '@/lib/utils'
import type { CmsPermission } from '@/types/cms'

interface MenuItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  perm?: CmsPermission
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

const GROUPS: MenuGroup[] = [
  {
    label: 'Haber Merkezi',
    items: [
      { href: '/admin/approvals', label: 'Onay Kuyruğu', icon: Clock, perm: 'news:read' },
      { href: '/admin/news', label: 'Tüm Haberler', icon: Newspaper, perm: 'news:read' },
      { href: '/admin/inbox', label: 'Mail Kutusu', icon: Mail, perm: 'news:read' },
      { href: '/admin/submissions', label: 'Gönderiler', icon: Inbox, perm: 'news:read' },
      { href: '/admin/job-classifieds', label: 'İş Kariyer', icon: Briefcase, perm: 'news:publish' },
      { href: '/admin/archive', label: 'Arşiv', icon: Archive, perm: 'news:read' },
      { href: '/admin/videos', label: 'Videolar', icon: Video, perm: 'video:read' },
    ],
  },
  {
    label: 'Yapay Zeka',
    items: [
      { href: '/admin/newsroom', label: 'AI Newsroom', icon: BrainCircuit, perm: 'ai:use' },
      { href: '/admin/ai-editors', label: 'AI Editörler', icon: Bot, perm: 'ai:use' },
      { href: '/admin/ai-usage', label: 'AI Maliyet', icon: Coins, perm: 'ai:use' },
      { href: '/admin/ai/news', label: 'AI Asistan', icon: Bot, perm: 'ai:use' },
    ],
  },
  {
    label: 'Dağıtım',
    items: [
      { href: '/admin/seo', label: 'SEO', icon: Search, perm: 'seo:read' },
      { href: '/admin/social', label: 'Sosyal Medya', icon: Share2, perm: 'news:read' },
      { href: '/admin/newsletter', label: 'E-posta Bülteni', icon: Mail, perm: 'users:read' },
      { href: '/admin/ads', label: 'Reklamlar', icon: Megaphone, perm: 'seo:edit' },
      { href: '/admin/analytics', label: 'Analitik', icon: BarChart3, perm: 'analytics:read' },
      { href: '/admin/most-read', label: 'En Çok Okunanlar', icon: Flame, perm: 'analytics:read' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { href: '/admin/categories', label: 'Kategoriler', icon: Tag, perm: 'news:read' },
      { href: '/admin/editors', label: 'Editörler', icon: UserCog, perm: 'editors:read' },
      { href: '/admin/authors', label: 'Yazarlar', icon: UserCheck, perm: 'authors:read' },
      { href: '/admin/users', label: 'Kullanıcılar', icon: Users, perm: 'users:read' },
      { href: '/admin/cron', label: 'Cron İzleme', icon: Timer, perm: 'cron:read' },
      { href: '/admin/settings', label: 'Global Ayarlar', icon: Settings, perm: 'system:settings' },
    ],
  },
]

export function MobileMenu() {
  const { user, role, roleLabel, can } = useCmsAuth()
  const { logout } = useAuth()

  return (
    <div className="px-4 py-4">
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-base font-bold text-white">
          {user?.displayName?.[0]?.toUpperCase() ?? 'N'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[rgb(var(--color-text))]">
            {user?.displayName || user?.email || 'Editör'}
          </p>
          <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', CMS_ROLE_COLORS[role])}>
            {roleLabel}
          </span>
        </div>
      </div>

      {GROUPS.map((group) => {
        const items = group.items.filter((i) => !i.perm || can(i.perm))
        if (items.length === 0) return null
        return (
          <section key={group.label} className="mb-5">
            <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              {group.label}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
              {items.map((item, idx) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex min-h-12 items-center gap-3 px-4 py-3 active:bg-[rgb(var(--color-surface))]',
                      idx > 0 && 'border-t border-[rgb(var(--color-border))]'
                    )}
                  >
                    <Icon className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                    <span className="flex-1 text-sm font-semibold text-[rgb(var(--color-text))]">{item.label}</span>
                    <span className="text-[rgb(var(--color-muted))]">›</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="space-y-2 pb-4">
        <Link
          href="/"
          className="flex min-h-12 items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 text-sm font-semibold text-[rgb(var(--color-text))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Uygulamaya Dön
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 text-sm font-semibold text-red-600"
        >
          <LogOut className="h-4 w-4" />
          Çıkış
        </button>
      </div>
    </div>
  )
}
