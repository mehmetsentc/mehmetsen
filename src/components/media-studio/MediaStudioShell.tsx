'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { AlertCircle, ArrowDownToLine, LayoutGrid, Plus, Search, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { STUDIO_NAV, isStudioNavActive } from '@/media-studio/routes'
import { clearNotice, sessionSummary, setLibraryControls, updateStudioSession } from '@/media-studio/session'
import { useStudio } from '@/media-studio/useStudio'
import { cn } from '@/lib/utils'
import { focusRing } from './styles'
import { useStudioLinks } from './studioLinks'

const RAIL_ICON: Record<string, LucideIcon> = {
  '/admin/media-studio': Plus,
  '/admin/media-studio/jobs': ArrowDownToLine,
  '/admin/media-studio/library': LayoutGrid,
  '/admin/media-studio/failed': AlertCircle,
  '/admin/media-studio/settings': Settings,
}

export function MediaStudioShell({
  children,
  navPathname,
}: {
  children: React.ReactNode
  /** Dev preview only. Real admin routes use the live pathname. */
  navPathname?: string
}) {
  const livePathname = usePathname()
  const pathname = navPathname ?? livePathname
  const router = useRouter()
  const links = useStudioLinks()
  const session = useStudio()
  const quota = sessionSummary(session).quota
  const [query, setQuery] = useState('')

  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    updateStudioSession((current) => setLibraryControls(current, { libraryQuery: query.trim() }))
    router.push(links.href('/admin/media-studio/library'))
  }

  return (
    <div className="flex min-h-full min-w-0 bg-[rgb(var(--color-bg))]">
      <nav
        className="sticky top-0 z-20 hidden h-screen w-[72px] shrink-0 flex-col items-center border-r border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-4 md:flex"
        aria-label="Medya Stüdyosu"
      >
        <Link
          href={links.href('/admin/media-studio')}
          className={`mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))] text-sm font-bold text-white ${focusRing}`}
          title="NaHaber"
        >
          N
        </Link>
        <div className="flex flex-1 flex-col items-center gap-2">
          {STUDIO_NAV.map((item) => (
            <RailLink key={item.href} href={links.href(item.href)} label={item.label} icon={RAIL_ICON[item.href] ?? Plus} active={isStudioNavActive(pathname, item.href, item.exact)} />
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <header className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-[28px] font-semibold leading-none tracking-tight text-[rgb(var(--color-text))]">Medya Stüdyosu</h1>
              <p className="mt-2 text-sm text-[rgb(var(--color-text))]/80">Medyayı içe aktarın, düzenleyin ve yönetin.</p>
            </div>
            <div className="flex items-center gap-3">
              <form onSubmit={onSearch} className="relative min-w-0 flex-1 lg:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" aria-hidden="true" />
                <label className="sr-only" htmlFor="studio-search">
                  Ara
                </label>
                <input
                  id="studio-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ara"
                  className={`h-10 w-full rounded-xl bg-[rgb(var(--color-surface))] pl-9 pr-3 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] ${focusRing}`}
                />
              </form>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-[rgb(var(--color-text))]">
                  {quota.usedLabel} / {quota.capLabel}
                </p>
                <div className="mt-2 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-[rgb(var(--color-surface))]" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${Math.round(quota.usedRatio * 100)}%`, backgroundColor: 'rgb(var(--admin-info))' }} />
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-4 flex w-full max-w-[1480px] gap-1 overflow-x-auto md:hidden" aria-label="Medya Stüdyosu">
            {STUDIO_NAV.map((item) => {
              const active = isStudioNavActive(pathname, item.href, item.exact)
              const Icon = RAIL_ICON[item.href] ?? Plus
              return (
                <Link
                  key={item.href}
                  href={links.href(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2 text-sm font-medium',
                    focusRing,
                    active
                      ? 'border-[rgb(var(--color-text))] text-[rgb(var(--color-text))]'
                      : 'border-transparent text-[rgb(var(--color-muted))]'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label === 'Yeni İndirme' ? 'Yeni' : item.label}
                </Link>
              )
            })}
          </div>
        </header>
        {session.notice ? (
          <div className="px-4 pt-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-3 rounded-xl bg-[rgb(var(--color-surface))] px-4 py-3 text-sm text-[rgb(var(--color-text))]">
              <p>{session.notice}</p>
              <button type="button" className={`rounded-lg px-2 py-1 text-xs font-semibold ${focusRing}`} onClick={() => updateStudioSession(clearNotice)}>
                Kapat
              </button>
            </div>
          </div>
        ) : null}
        <div className="mx-auto w-full min-w-0 max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  )
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      className={cn(
        'group relative flex h-11 w-11 items-center justify-center rounded-xl',
        focusRing,
        active
          ? 'bg-[rgb(var(--color-brand))] text-white'
          : 'text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]'
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="pointer-events-none absolute left-14 z-30 hidden whitespace-nowrap rounded-lg bg-[rgb(var(--color-text))] px-2 py-1 text-xs font-medium text-[rgb(var(--color-bg))] group-hover:block">
        {label}
      </span>
    </Link>
  )
}
