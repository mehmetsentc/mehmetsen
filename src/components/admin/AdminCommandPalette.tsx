'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Newspaper, Plus, Clock, Bot, BarChart3, Settings,
  Users, Share2, Inbox, Zap, FileText, Archive, Video, Megaphone,
  BrainCircuit, LayoutDashboard, Mail, Flame, Briefcase,
} from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { CmsPermission } from '@/types/cms'

interface CommandItem {
  id: string
  label: string
  hint?: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string
  requiredPermissions?: CmsPermission[]
  group: string
}

const COMMANDS: CommandItem[] = [
  {
    id: 'dash',
    label: 'Dashboard',
    href: ROUTES.ADMIN.DASHBOARD,
    icon: LayoutDashboard,
    group: 'Genel',
    keywords: 'panel ana',
  },
  {
    id: 'new',
    label: 'Yeni haber oluştur',
    href: ROUTES.ADMIN.NEWS_CREATE,
    icon: Plus,
    group: 'Haber',
    keywords: 'yaz create',
    requiredPermissions: ['news:create'],
  },
  {
    id: 'pending',
    label: 'Onay kuyruğunu aç',
    href: `${ROUTES.ADMIN.NEWS}?filter=pending`,
    icon: Clock,
    group: 'Haber',
    keywords: 'onay pending moderasyon',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'news',
    label: 'Tüm haberler',
    href: ROUTES.ADMIN.NEWS,
    icon: Newspaper,
    group: 'Haber',
    keywords: 'liste içerik',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'breaking',
    label: 'Son dakika haberleri',
    href: `${ROUTES.ADMIN.NEWS}?category=son-dakika`,
    icon: Zap,
    group: 'Haber',
    keywords: 'breaking acil',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'drafts',
    label: 'Taslaklar',
    href: `${ROUTES.ADMIN.NEWS}?filter=draft`,
    icon: FileText,
    group: 'Haber',
    keywords: 'draft',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'archive',
    label: 'Arşiv',
    href: ROUTES.ADMIN.ARCHIVE,
    icon: Archive,
    group: 'Haber',
    keywords: 'eski',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'videos',
    label: 'Videolar',
    href: ROUTES.ADMIN.VIDEOS,
    icon: Video,
    group: 'Haber',
    requiredPermissions: ['video:read'],
  },
  {
    id: 'inbox',
    label: 'Haber merkezi gelen kutusu',
    href: ROUTES.ADMIN.INBOX,
    icon: Mail,
    group: 'Haber Merkezi',
    keywords: 'gmail email info@',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'submissions',
    label: 'Kullanıcı gönderileri',
    href: ROUTES.ADMIN.SUBMISSIONS,
    icon: Inbox,
    group: 'Haber Merkezi',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'job-classifieds',
    label: 'İş kariyer yönetimi',
    href: ROUTES.ADMIN.JOB_CLASSIFIEDS,
    icon: Briefcase,
    group: 'Haber Merkezi',
    keywords: 'eleman iş arayan classified kariyer',
    requiredPermissions: ['news:publish'],
  },
  {
    id: 'newsroom',
    label: 'AI Newsroom',
    href: ROUTES.ADMIN.NEWSROOM,
    icon: BrainCircuit,
    group: 'Yapay Zeka',
    requiredPermissions: ['ai:use'],
  },
  {
    id: 'ai-news',
    label: 'AI Haber Asistanı',
    href: ROUTES.ADMIN.AI_NEWS,
    icon: Bot,
    group: 'Yapay Zeka',
    requiredPermissions: ['ai:use'],
  },
  {
    id: 'ai-editors',
    label: 'AI Editörler',
    href: ROUTES.ADMIN.AI_EDITORS,
    icon: Bot,
    group: 'Yapay Zeka',
    requiredPermissions: ['ai:use'],
  },
  {
    id: 'seo',
    label: 'SEO yönetimi',
    href: ROUTES.ADMIN.SEO,
    icon: Search,
    group: 'Dağıtım',
    requiredPermissions: ['seo:read'],
  },
  {
    id: 'social',
    label: 'Sosyal medya paylaşım durumu',
    href: ROUTES.ADMIN.SOCIAL,
    icon: Share2,
    group: 'Dağıtım',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'ads',
    label: 'Reklam yönetimi',
    href: ROUTES.ADMIN.ADS,
    icon: Megaphone,
    group: 'Dağıtım',
    requiredPermissions: ['seo:edit'],
  },
  {
    id: 'analytics',
    label: 'Analitik',
    href: ROUTES.ADMIN.ANALYTICS,
    icon: BarChart3,
    group: 'Genel',
    requiredPermissions: ['analytics:read'],
  },
  {
    id: 'most-read',
    label: 'En Çok Okunanlar',
    href: ROUTES.ADMIN.MOST_READ,
    icon: Flame,
    group: 'Genel',
    requiredPermissions: ['analytics:read'],
  },
  {
    id: 'newsletter',
    label: 'E-posta Bülteni',
    href: ROUTES.ADMIN.NEWSLETTER,
    icon: Mail,
    group: 'Dağıtım',
    requiredPermissions: ['users:read'],
  },
  {
    id: 'users',
    label: 'Kullanıcılar',
    href: ROUTES.ADMIN.USERS,
    icon: Users,
    group: 'Yönetim',
    requiredPermissions: ['users:read'],
  },
  {
    id: 'settings',
    label: 'Ayarlar',
    href: ROUTES.ADMIN.SETTINGS,
    icon: Settings,
    group: 'Yönetim',
    requiredPermissions: ['system:settings'],
  },
  {
    id: 'live-center',
    label: 'Canlı Haber Merkezi',
    href: '/admin/live-center',
    icon: Zap,
    group: 'Genel',
    keywords: 'canlı live operasyon',
    requiredPermissions: ['news:read'],
  },
  {
    id: 'ai-org',
    label: 'AI Organizasyonu',
    href: '/admin/ai-org',
    icon: BrainCircuit,
    group: 'AI',
    keywords: 'org hiyerarşi ajan',
    requiredPermissions: ['agents:manage'],
  },
  {
    id: 'smm',
    label: '81 İl SMM Ağı',
    href: '/admin/smm',
    icon: Share2,
    group: 'Sosyal',
    keywords: 'smm şehir sosyal',
    requiredPermissions: ['social:view'],
  },
  {
    id: 'locations',
    label: '81 İl Lokasyon',
    href: '/admin/locations',
    icon: Newspaper,
    group: 'İçerik',
    keywords: 'il şehir location',
    requiredPermissions: ['locations:manage'],
  },
  {
    id: 'feed-algo',
    label: 'Feed & Algoritma',
    href: '/admin/feed-algorithm',
    icon: BarChart3,
    group: 'Uygulama',
    keywords: 'algoritma feed',
    requiredPermissions: ['algorithm:view'],
  },

]

interface AdminCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdminCommandPalette({ open, onOpenChange }: AdminCommandPaletteProps) {
  const router = useRouter()
  const { can } = useCmsAuth()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const allowed = COMMANDS.filter(
      (c) => !c.requiredPermissions || c.requiredPermissions.some((p) => can(p))
    )
    const q = query.trim().toLowerCase()
    if (!q) return allowed
    return allowed.filter((c) => {
      const hay = `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.group}`.toLowerCase()
      return hay.includes(q)
    })
  }, [can, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  const run = useCallback(
    (item: CommandItem) => {
      onOpenChange(false)
      router.push(item.href)
    },
    [onOpenChange, router]
  )

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[active]
        if (item) run(item)
        else if (query.trim()) {
          onOpenChange(false)
          router.push(`${ROUTES.ADMIN.NEWS}?q=${encodeURIComponent(query.trim())}`)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, active, run, onOpenChange, query, router])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Kapat"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Haber, sayfa veya komut ara…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))]"
          />
          <kbd className="hidden rounded border border-[rgb(var(--color-border))] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))] sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[min(420px,55vh)] overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
              {query.trim() ? (
                <>
                  Komut bulunamadı.
                  <button
                    type="button"
                    className="mt-3 block w-full text-sm font-semibold text-[rgb(var(--color-brand))]"
                    onClick={() => {
                      onOpenChange(false)
                      router.push(`${ROUTES.ADMIN.NEWS}?q=${encodeURIComponent(query.trim())}`)
                    }}
                  >
                    “{query.trim()}” için haberlerde ara →
                  </button>
                </>
              ) : (
                'Kullanılabilir komut yok'
              )}
            </div>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon
              const selected = index === active
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(item)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    selected
                      ? 'bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-text))]'
                      : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      selected ? 'text-[rgb(var(--color-brand))]' : 'text-[rgb(var(--color-muted))]'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                    {item.group}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[rgb(var(--color-border))] px-4 py-2 text-[10px] text-[rgb(var(--color-muted))]">
          <span>↑↓ gezin</span>
          <span>↵ aç</span>
          <span className="ml-auto">NaHaber Newsroom</span>
        </div>
      </div>
    </div>
  )
}

/** Global ⌘K / Ctrl+K listener for admin shell */
export function useAdminCommandHotkey(onOpen: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpen])
}
