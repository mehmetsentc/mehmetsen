'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ListTree, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TOCEntry {
  id: string
  text: string
  level: 2 | 3
}

interface ArticleTOCProps {
  /** Article body root için CSS selector */
  contentSelector?: string
  /** Posta ait benzersiz id — tekrar render'da yeniden tarar */
  postId: string
}

/**
 * ArticleTOC — F2
 *
 * Article body içindeki h2/h3'ten otomatik içindekiler oluşturur.
 * Aktif başlığı IntersectionObserver ile izler.
 *
 * Davranış:
 *   - 2+ heading varsa görünür, yoksa gizli
 *   - Mobilde collapsed (FAB benzeri tek tuş açar)
 *   - Masaüstünde sticky panel olarak yan sütunda görünebilir
 *     (şimdilik sade — masaüstü-mobil aynı toggle paneli)
 */
export function ArticleTOC({ contentSelector = '.news-body', postId }: ArticleTOCProps) {
  const [entries, setEntries] = useState<TOCEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // ── Heading'leri tara ve id'lendir ─────────────────────────────────
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(contentSelector)
    if (!root) {
      setEntries([])
      return
    }

    const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2, h3'))
    const items: TOCEntry[] = headings.map((h, i) => {
      const text = (h.textContent || '').trim()
      const id =
        h.id ||
        `toc-${slugify(text) || 'baslik'}-${i}`
      if (!h.id) h.id = id
      // Üstüne biraz padding bırak — sticky header altında kalmasın
      h.style.scrollMarginTop = '88px'
      return {
        id,
        text,
        level: h.tagName === 'H2' ? 2 : 3,
      }
    })
    setEntries(items)
  }, [contentSelector, postId])

  // ── Aktif başlığı izle ─────────────────────────────────────────────
  useEffect(() => {
    if (entries.length === 0) return

    const observer = new IntersectionObserver(
      (records) => {
        // Görünür olan en üstteki başlığı bul
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          const id = visible[0].target.id
          setActiveId(id)
        }
      },
      { rootMargin: '-100px 0px -65% 0px', threshold: 0 }
    )

    entries.forEach((e) => {
      const el = document.getElementById(e.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [entries])

  if (entries.length < 2) return null

  return (
    <>
      {/* ── Trigger — masaüstünde sticky kart, mobilde FAB ──────── */}
      <button
        type="button"
        aria-label="İçindekiler"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-24 right-4 z-overlay flex h-12 w-12 items-center justify-center rounded-full bg-text-primary text-bg-base shadow-lg transition-transform hover:scale-105 active:scale-95',
          'lg:hidden'
        )}
      >
        <ListTree className="h-5 w-5" />
      </button>

      {/* Masaüstü panel — sayfa sağında sticky (1280px+) */}
      <aside
        aria-label="İçindekiler"
        className="pointer-events-none fixed right-6 top-32 z-base hidden w-60 lg:block xl:right-[max(1.5rem,calc((100vw-720px)/2-280px))]"
      >
        <div className="pointer-events-auto rounded-2xl border border-border-subtle bg-bg-card/85 p-4 shadow-md backdrop-blur-xl">
          <p className="mb-3 flex items-center gap-2 text-2xs font-bold uppercase tracking-widest text-text-tertiary">
            <ListTree className="h-3.5 w-3.5" />
            İçindekiler
          </p>
          <ol className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.id} className={e.level === 3 ? 'ml-3' : ''}>
                <a
                  href={`#${e.id}`}
                  className={cn(
                    'group block rounded-md px-2 py-1 text-sm leading-snug transition-colors',
                    activeId === e.id
                      ? 'bg-brand-500/10 font-semibold text-brand-600 dark:text-brand-300'
                      : 'text-text-tertiary hover:bg-bg-subtle hover:text-text-primary'
                  )}
                >
                  {e.text}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* Mobil sheet ── */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-sheet flex items-end lg:hidden">
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="relative z-10 max-h-[70dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-bg-card pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            >
              <div className="flex justify-center pt-2 pb-1">
                <span className="h-1 w-10 rounded-full bg-border-strong/40" />
              </div>
              <header className="flex items-center justify-between px-5 pb-3 pt-1">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <ListTree className="h-4 w-4" />
                  İçindekiler
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Kapat"
                  className="rounded-full p-1.5 text-text-tertiary hover:bg-bg-subtle"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              <ol className="px-3 pb-3 space-y-1">
                {entries.map((e) => (
                  <li key={e.id} className={e.level === 3 ? 'ml-4' : ''}>
                    <a
                      href={`#${e.id}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm leading-snug transition-colors',
                        activeId === e.id
                          ? 'bg-brand-500/10 font-semibold text-brand-600 dark:text-brand-300'
                          : 'text-text-primary hover:bg-bg-subtle'
                      )}
                    >
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className="line-clamp-2">{e.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

function slugify(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}
