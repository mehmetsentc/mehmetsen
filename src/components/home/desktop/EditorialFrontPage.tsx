import type { ReactNode } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

/**
 * Desktop editorial front page (lg+ only — callers render it inside the
 * desktop branch). Shared by the national home (client) and city homes
 * (server), so it stays a plain server-compatible module.
 *
 * Hierarchy follows BBC / NYT / Guardian: one lead story, two side stories,
 * a row of cards, a text-only headline strip, a numbered most-read rail,
 * then category sections that rotate density instead of 12 identical boxes.
 * Items never repeat across blocks; stories without images get text-only
 * treatments (no empty placeholder tiles).
 */

export interface EditorialSection {
  id: string
  title: string
  href: string
  items: NewsItem[]
}

type Imaged = NewsItem & { imageUrl: string }

function hasImage(item: NewsItem | null | undefined): item is Imaged {
  return Boolean(item?.imageUrl?.trim())
}

function itemSummary(item: NewsItem): string {
  return (item.summary || item.description || '').trim()
}

const META_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
})

/** "31 Eki 14:20" — fixed timezone so SSR and hydration agree. */
export function editorialTime(item: NewsItem): string | null {
  const raw = item.publishedAt ?? item.createdAt
  if (!raw) return null
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return null
  return META_FORMAT.format(parsed)
}

class Allocator {
  private used = new Set<string>()

  constructor(initial: Iterable<string> = []) {
    for (const id of initial) this.used.add(id)
  }

  take(pool: NewsItem[], count: number, opts: { image?: boolean } = {}): NewsItem[] {
    const out: NewsItem[] = []
    for (const item of pool) {
      if (out.length >= count) break
      if (!item?.id || this.used.has(item.id)) continue
      if (opts.image && !hasImage(item)) continue
      this.used.add(item.id)
      out.push(item)
    }
    return out
  }

  available(pool: NewsItem[]): NewsItem[] {
    return pool.filter((item) => item?.id && !this.used.has(item.id))
  }
}

function EdMeta({ item, showCategory = true }: { item: NewsItem; showCategory?: boolean }) {
  const time = editorialTime(item)
  const category = showCategory ? newsItemCategoryLabel(item) : ''
  if (!time && !category) return null
  return (
    <p className="ed-meta">
      {time ? <time dateTime={item.publishedAt ?? item.createdAt}>{time}</time> : null}
      {time && category ? <span aria-hidden> · </span> : null}
      {category ? <span className="ed-meta__cat">{category}</span> : null}
    </p>
  )
}

function EdMedia({ item, sizes, ratio = 'wide', priority }: {
  item: Imaged
  sizes: string
  ratio?: 'wide' | 'lead' | 'square'
  priority?: boolean
}) {
  return (
    <Link
      prefetch={false}
      href={newsItemDetailHref(item)}
      className={cn('ed-media', `ed-media--${ratio}`)}
      tabIndex={-1}
      aria-hidden
    >
      <SafeNewsImage src={item.imageUrl} alt="" fill sizes={sizes} priority={priority} className="object-cover" />
    </Link>
  )
}

export function EdCard({
  item,
  size = 'md',
  showDek = true,
  sizes = '300px',
}: {
  item: NewsItem
  size?: 'lg' | 'md' | 'sm'
  showDek?: boolean
  sizes?: string
}) {
  const dek = showDek ? itemSummary(item) : ''
  return (
    <article className={cn('ed-card', `ed-card--${size}`, !hasImage(item) && 'ed-card--text')}>
      {hasImage(item) ? <EdMedia item={item} sizes={sizes} /> : null}
      <h3 className="ed-card__title">
        <Link prefetch={false} href={newsItemDetailHref(item)}>
          {item.seoTitle || item.title}
        </Link>
      </h3>
      {dek ? <p className="ed-card__dek">{dek}</p> : null}
      <EdMeta item={item} />
    </article>
  )
}

export function EdHeadlineList({ items, numbered = false }: { items: NewsItem[]; numbered?: boolean }) {
  if (items.length === 0) return null
  const List = numbered ? 'ol' : 'ul'
  return (
    <List className={cn('ed-list', numbered && 'ed-list--numbered')}>
      {items.map((item, index) => (
        <li key={item.id} className="ed-list__item">
          {numbered ? <span className="ed-list__rank" aria-hidden>{index + 1}</span> : null}
          <div className="min-w-0">
            <Link prefetch={false} href={newsItemDetailHref(item)} className="ed-list__title">
              {item.title}
            </Link>
            {numbered ? null : <EdMeta item={item} />}
          </div>
        </li>
      ))}
    </List>
  )
}

export function EdSectionHead({ title, href, more = 'Tümü' }: { title: string; href?: string; more?: string }) {
  return (
    <header className="ed-section__head">
      <h2 className="ed-section__title">
        {href ? (
          <Link prefetch={false} href={href}>
            {title}
          </Link>
        ) : (
          title
        )}
      </h2>
      {href ? (
        <Link prefetch={false} href={href} className="ed-section__more">
          {more} <span aria-hidden>›</span>
        </Link>
      ) : null}
    </header>
  )
}

/** Lead band: headline + dek left, large image centre, two side stories right. */
export function EdLeadBand({ lead, side, headingLevel = 2 }: {
  lead: NewsItem
  side: NewsItem[]
  headingLevel?: 1 | 2
}) {
  const dek = itemSummary(lead)
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <section className={cn('ed-lead', !hasImage(lead) && 'ed-lead--text')} aria-label="Manşet">
      <div className="ed-lead__text">
        {newsItemCategoryLabel(lead) ? <p className="ed-kicker">{newsItemCategoryLabel(lead)}</p> : null}
        <Heading className="ed-lead__title">
          <Link prefetch={false} href={newsItemDetailHref(lead)}>
            {lead.seoTitle || lead.title}
          </Link>
        </Heading>
        {dek ? <p className="ed-lead__dek">{dek}</p> : null}
        <EdMeta item={lead} showCategory={false} />
      </div>
      {hasImage(lead) ? (
        <div className="ed-lead__media">
          <EdMedia item={lead} ratio="lead" sizes="(min-width: 1280px) 540px, 45vw" priority />
        </div>
      ) : null}
      {side.length > 0 ? (
        <div className="ed-lead__side">
          {side.map((item) => (
            <EdCard key={item.id} item={item} size="sm" showDek={false} sizes="300px" />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** Chronological river: square thumb left, serif headline, dek, meta. */
export function EdRiver({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null
  return (
    <ol className="ed-river">
      {items.map((item) => (
        <li key={item.id} className={cn('ed-river__item', !hasImage(item) && 'ed-river__item--text')}>
          {hasImage(item) ? <EdMedia item={item} ratio="square" sizes="132px" /> : null}
          <div className="min-w-0">
            <h3 className="ed-card__title">
              <Link prefetch={false} href={newsItemDetailHref(item)}>
                {item.seoTitle || item.title}
              </Link>
            </h3>
            {itemSummary(item) ? <p className="ed-card__dek">{itemSummary(item)}</p> : null}
            <EdMeta item={item} showCategory={false} />
          </div>
        </li>
      ))}
    </ol>
  )
}

type SectionVariant = 'a' | 'b' | 'c'

interface SectionPlan {
  section: EditorialSection
  variant: SectionVariant
  lead: NewsItem[]
  rest: NewsItem[]
}

/** Rotate densities A → B → C; fall back to whatever the section can fill. */
function planSection(
  section: EditorialSection,
  preferred: SectionVariant,
  alloc: Allocator
): SectionPlan | null {
  const pool = alloc.available(section.items)
  const imaged = pool.filter(hasImage)
  const order: SectionVariant[] =
    preferred === 'a' ? ['a', 'c', 'b'] : preferred === 'b' ? ['b', 'a', 'c'] : ['c', 'a', 'b']
  for (const variant of order) {
    if (variant === 'a' && imaged.length >= 1 && pool.length >= 3) {
      const lead = alloc.take(imaged, 1)
      return { section, variant, lead, rest: alloc.take(pool, 4) }
    }
    if (variant === 'b' && imaged.length >= 4) {
      return { section, variant, lead: alloc.take(imaged, 4), rest: [] }
    }
    if (variant === 'c' && imaged.length >= 2 && pool.length >= 3) {
      const lead = alloc.take(imaged, 2)
      return { section, variant, lead, rest: alloc.take(pool, 3) }
    }
  }
  return null
}

function EdSectionBlock({ plan }: { plan: SectionPlan }) {
  const { section, variant, lead, rest } = plan
  return (
    <section className={cn('ed-section', `ed-section--${variant}`)} aria-label={section.title}>
      <EdSectionHead title={section.title} href={section.href} />
      {variant === 'a' ? (
        <div className="ed-grid ed-grid--a">
          <EdCard item={lead[0]} size="lg" sizes="(min-width: 1280px) 620px, 50vw" />
          <EdHeadlineList items={rest} />
        </div>
      ) : variant === 'b' ? (
        <div className="ed-grid ed-grid--4">
          {lead.map((item) => (
            <EdCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="ed-grid ed-grid--c">
          {lead.map((item) => (
            <EdCard key={item.id} item={item} sizes="(min-width: 1280px) 400px, 33vw" />
          ))}
          <EdHeadlineList items={rest} />
        </div>
      )}
    </section>
  )
}

export function EditorialFrontPage({
  leadPool,
  mostRead,
  mostReadTitle = 'En çok okunan',
  columnists = [],
  sections,
  local,
  videos = [],
  videoHref = '/video',
  afterLead,
  railExtra,
  afterSections,
  className,
  testId = 'desktop-portal-home',
  cityPortal,
}: {
  /** Top stories in editorial order (featured pins first). */
  leadPool: NewsItem[]
  mostRead: NewsItem[]
  mostReadTitle?: string
  columnists?: NewsItem[]
  sections: EditorialSection[]
  local?: EditorialSection | null
  videos?: NewsItem[]
  videoHref?: string
  /** Full-width slot under the lead band (city service strip, events). */
  afterLead?: ReactNode
  /** Extra right-rail widget under most read (markets). */
  railExtra?: ReactNode
  afterSections?: ReactNode
  className?: string
  testId?: string
  cityPortal?: boolean
}) {
  const alloc = new Allocator()
  const leadImaged = leadPool.filter(hasImage)
  const lead = alloc.take(leadImaged, 1)[0] ?? null
  const side = alloc.take(leadImaged, 2)
  const cards = alloc.take(leadImaged, 4)
  const strip = alloc.take(leadPool, 5)
  const ranked = mostRead.slice(0, 10)
  const opinion = columnists.slice(0, 4)

  const localCards = local ? alloc.take(local.items, 4, { image: true }) : []

  const plans: SectionPlan[] = []
  const leftovers: EditorialSection[] = []
  const variants: SectionVariant[] = ['a', 'b', 'c']
  for (const section of sections) {
    const plan = planSection(section, variants[plans.length % variants.length], alloc)
    if (plan) plans.push(plan)
    else leftovers.push(section)
  }
  const more = leftovers
    .map((section) => ({ section, items: alloc.take(section.items, 3) }))
    .filter((entry) => entry.items.length > 0)
    .slice(0, 4)
  const videoTiles = alloc.take(videos, 4, { image: true })

  return (
    <div
      className={cn('desktop-portal-home ed-front', className)}
      data-testid={testId}
      data-ed-rev="editorial-20261031"
      data-city-portal={cityPortal ? '1' : undefined}
    >
      {lead ? <EdLeadBand lead={lead} side={side} /> : null}

      <div className="ed-main">
        <div className="ed-main__body">
          {cards.length > 0 ? (
            <div className="ed-grid ed-grid--4 ed-main__cards">
              {cards.map((item) => (
                <EdCard key={item.id} item={item} sizes="240px" />
              ))}
            </div>
          ) : null}
          {strip.length > 0 ? (
            <ul className="ed-strip" aria-label="Diğer başlıklar">
              {strip.map((item) => (
                <li key={item.id}>
                  <Link prefetch={false} href={newsItemDetailHref(item)}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <aside className="ed-main__rail" aria-label={mostReadTitle}>
          {ranked.length > 0 ? (
            <section className="ed-rail-block">
              <h2 className="ed-rail-block__title">{mostReadTitle}</h2>
              <EdHeadlineList items={ranked} numbered />
            </section>
          ) : null}
          {opinion.length > 0 ? (
            <section className="ed-rail-block">
              <h2 className="ed-rail-block__title">Yazarlar</h2>
              <EdHeadlineList items={opinion} />
            </section>
          ) : null}
          {railExtra}
        </aside>
      </div>

      {afterLead}

      {local && localCards.length >= 2 ? (
        <section className="ed-section ed-section--local" aria-label={local.title}>
          <EdSectionHead title={local.title} href={local.href} more="Tüm yerel haberler" />
          <div className="ed-grid ed-grid--4">
            {localCards.map((item) => (
              <EdCard key={item.id} item={item} sizes="240px" />
            ))}
          </div>
        </section>
      ) : null}

      {plans.map((plan) => (
        <EdSectionBlock key={plan.section.id} plan={plan} />
      ))}

      {more.length > 0 ? (
        <section className="ed-section ed-section--more" aria-label="Daha fazlası">
          <EdSectionHead title="Daha fazlası" />
          <div className="ed-grid ed-grid--more" data-cols={more.length}>
            {more.map(({ section, items }) => (
              <div key={section.id} className="ed-more-col">
                <h3 className="ed-more-col__title">
                  <Link prefetch={false} href={section.href}>
                    {section.title}
                  </Link>
                </h3>
                <EdHeadlineList items={items} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {videoTiles.length >= 2 ? (
        <section className="ed-video" aria-label="Video">
          <EdSectionHead title="Video" href={videoHref} more="Tüm videolar" />
          <div className="ed-grid ed-grid--4">
            {videoTiles.map((item) => (
              <article key={item.id} className="ed-card ed-card--video">
                <Link
                  prefetch={false}
                  href={newsItemDetailHref(item)}
                  className="ed-media ed-media--wide"
                  tabIndex={-1}
                  aria-hidden
                >
                  <SafeNewsImage src={(item as Imaged).imageUrl} alt="" fill sizes="240px" className="object-cover" />
                  <span className="ed-video__play">
                    <Play className="h-4 w-4 fill-current" />
                  </span>
                </Link>
                <h3 className="ed-card__title">
                  <Link prefetch={false} href={newsItemDetailHref(item)}>
                    {item.title}
                  </Link>
                </h3>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {afterSections}
    </div>
  )
}
