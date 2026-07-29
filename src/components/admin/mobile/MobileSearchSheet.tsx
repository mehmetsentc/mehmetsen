'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Search, Loader2 } from 'lucide-react'
import { adminNewsService, type AdminNewsItem } from '@/services/adminNewsService'
import { getCategoryLabel } from '@/lib/newsMapper'
import { useMobileAdmin } from './MobileAdminContext'

const RECENT_KEY = 'nahaber_mobile_admin_recent_search'

export function MobileSearchSheet() {
  const { searchOpen, closeSearch } = useMobileAdmin()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<AdminNewsItem[]>([])
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    if (!searchOpen) return
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) setRecent(JSON.parse(raw) as string[])
    } catch {
      /* ignore */
    }
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const tid = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const [{ posts }, tagHits] = await Promise.all([
            adminNewsService.list('all', undefined, undefined, 40),
            adminNewsService.searchByTag(term).catch(() => [] as AdminNewsItem[]),
          ])
          const lower = term.toLowerCase()
          const fromList = posts.filter((p) =>
            [p.title, p.spot, p.summary, p.categoryId, ...(p.tags ?? [])]
              .join(' ')
              .toLowerCase()
              .includes(lower)
          )
          const map = new Map<string, AdminNewsItem>()
          for (const p of [...fromList, ...tagHits]) map.set(p.id, p)
          setResults([...map.values()].slice(0, 30))
        } catch {
          setResults([])
        } finally {
          setLoading(false)
        }
      })()
    }, 350)
    return () => window.clearTimeout(tid)
  }, [q, searchOpen])

  function remember(term: string) {
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 8)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  if (!searchOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[rgb(var(--color-bg))] md:hidden">
      <div
        className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Haber, etiket, kategori…"
            className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] pl-10 pr-3 text-[15px] text-[rgb(var(--color-text))] outline-none"
            enterKeyHint="search"
          />
        </div>
        <button
          type="button"
          onClick={closeSearch}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {q.trim().length < 2 ? (
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Son aramalar
            </p>
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Aramaya başlayın…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setQ(r)}
                    className="rounded-full bg-[rgb(var(--color-surface))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-brand))]" />
          </div>
        ) : results.length === 0 ? (
          <p className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">Sonuç yok.</p>
        ) : (
          <div className="space-y-1">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Haberler · {results.length}
            </p>
            {results.map((p) => (
              <Link
                key={p.id}
                href={`/admin/news/${p.id}/edit`}
                onClick={() => {
                  remember(q.trim())
                  closeSearch()
                }}
                className="flex gap-3 rounded-xl px-2 py-3 active:bg-[rgb(var(--color-surface))]"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-surface))]">
                  {p.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">{p.title}</p>
                  <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                    {getCategoryLabel(p.categoryId)} · {p.status}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
