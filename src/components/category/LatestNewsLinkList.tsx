import { getNewsSitemapEntries } from '@/lib/sitemap/newsSitemapLoader'

/** How many of the newest indexable stories the crawl hub lists. */
export const LATEST_NEWS_LINK_LIMIT = 50

export type LatestNewsLink = { slug: string; title: string; publishedMs: number }

/**
 * Newest first, de-duplicated by slug. Uses the news-sitemap window, which is
 * already cached and limited to indexable (CANONICAL / SYSTEM_ALERT) articles,
 * so this adds no Firestore reads of its own.
 */
export function pickLatestNewsLinks(
  entries: LatestNewsLink[],
  limit = LATEST_NEWS_LINK_LIMIT
): LatestNewsLink[] {
  const seen = new Set<string>()
  return [...entries]
    .filter((e) => e.slug && e.title)
    .sort((a, b) => b.publishedMs - a.publishedMs)
    .filter((e) => (seen.has(e.slug) ? false : (seen.add(e.slug), true)))
    .slice(0, limit)
}

function formatTime(ms: number): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

/**
 * Server-rendered crawl hub for /kategori/son-dakika: plain <a href> links to
 * the newest stories so crawlers find new URLs from one page (SEO-8 P0-2).
 */
/** SEO-17: load the links (server). Never throws; empty on any read problem. */
export async function loadLatestNewsLinks(opts: { citySlug?: string; limit?: number } = {}): Promise<LatestNewsLink[]> {
  try {
    const entries = await getNewsSitemapEntries()
    const scoped = opts.citySlug ? entries.filter((e) => e.citySlug === opts.citySlug) : entries
    return pickLatestNewsLinks(scoped, opts.limit ?? LATEST_NEWS_LINK_LIMIT)
  } catch {
    return []
  }
}

export async function LatestNewsLinkList({
  heading = 'Son eklenen haberler',
  citySlug,
  limit = LATEST_NEWS_LINK_LIMIT,
}: {
  heading?: string
  /** SEO-17: only this province's stories (e.g. /yerel/canakkale). */
  citySlug?: string
  limit?: number
}) {
  const links = await loadLatestNewsLinks({ citySlug, limit })
  return <LatestNewsLinkListView heading={heading} links={links} />
}

/** Synchronous view so pages can await the data themselves. */
export function LatestNewsLinkListView({ heading, links }: { heading: string; links: LatestNewsLink[] }) {
  if (links.length === 0) return null
  return (
    <section
      aria-label={heading}
      className="mx-auto w-full max-w-5xl px-4 py-6"
      data-seo-latest-links=""
    >
      <h2 className="mb-3 text-lg font-black tracking-tight text-[rgb(var(--color-text))]">{heading}</h2>
      <ol className="divide-y divide-[rgb(var(--color-border))]">
        {links.map((link) => (
          <li key={link.slug} className="flex gap-3 py-2 text-sm">
            <time
              dateTime={new Date(link.publishedMs).toISOString()}
              className="w-24 shrink-0 tabular-nums text-[rgb(var(--color-muted))]"
            >
              {formatTime(link.publishedMs)}
            </time>
            <a
              href={`/haber/${encodeURIComponent(link.slug)}`}
              className="font-semibold text-[rgb(var(--color-text))] hover:underline"
            >
              {link.title}
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
