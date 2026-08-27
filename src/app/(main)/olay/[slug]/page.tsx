import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import {
  evaluateEventSeo,
  robotsFromEligibility,
} from '@/lib/seo/seoEligibility'
import { eventMetaDescription, eventMetaTitle } from '@/lib/seo/metaTemplates'
import { eventCanonicalUrl } from '@/lib/seo/canonical'
import { buildEventPageJsonLd, buildCollectionBreadcrumbJsonLd } from '@/lib/seo/structuredData'
import { recordSeoIndexable } from '@/lib/seo/observability'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { eventPageService } from '@/services/seo/eventPageService'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isEventPagesEnabled()) {
    return { title: 'Sayfa bulunamadı', robots: { index: false, follow: false } }
  }

  const slug = decodeURIComponent((await params).slug).trim().toLowerCase()
  const event = await eventPageService.getBySlug(slug)
  if (!event) {
    return { title: 'Olay bulunamadı', robots: { index: false, follow: false } }
  }

  const eligibility = evaluateEventSeo({
    canonicalTitle: event.canonicalTitle,
    sourceCount: event.uniqueSourceCount,
    clusterConfidence: event.clusterConfidence,
    eventStatus: event.eventStatus,
    aiEligibility: event.aiEligibility,
  })
  recordSeoIndexable('event', eligibility.indexable, eligibility.noindexReason)

  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = eventMetaTitle(event.canonicalTitle)
  const description = eventMetaDescription(event.canonicalTitle, event.uniqueSourceCount)
  const canonical = eventCanonicalUrl(event.slug)
  const robots = robotsFromEligibility(eligibility)

  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      type: 'article',
      locale: 'tr_TR',
      siteName,
      images: [{ url: buildCategoryOgUrl(title, 'Olay'), width: 1200, height: 630 }],
    },
  }
}

export default async function EventPage({ params }: Props) {
  if (!isEventPagesEnabled()) notFound()

  const slug = decodeURIComponent((await params).slug).trim().toLowerCase()
  const event = await eventPageService.getBySlug(slug)
  if (!event) notFound()

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const pageUrl = `${siteUrl}${ROUTES.EVENT(event.slug)}`

  const jsonLd = buildEventPageJsonLd({
    slug: event.slug,
    canonicalTitle: event.canonicalTitle,
    summary: event.summary,
    sourceCount: event.uniqueSourceCount,
    dateModified: event.lastSeenAt.toISOString(),
  })

  const breadcrumbJsonLd = buildCollectionBreadcrumbJsonLd([
    { name: 'Haberler', item: `${siteUrl}${ROUTES.FEED}` },
    { name: event.canonicalTitle, item: pageUrl },
  ])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[rgb(var(--color-muted))]">
          <Link href={ROUTES.FEED} className="hover:underline">
            Ana Sayfa
          </Link>
          <span className="mx-2">/</span>
          <span className="text-[rgb(var(--color-text))]">{event.canonicalTitle}</span>
        </nav>

        <article>
          <h1 className="font-serif text-3xl font-black text-[rgb(var(--color-text))]">
            {event.canonicalTitle}
          </h1>
          <p className="mt-3 text-sm text-[rgb(var(--color-muted))]">
            Bu olay{' '}
            <strong className="text-[rgb(var(--color-text))]">{event.uniqueSourceCount} kaynak</strong>{' '}
            tarafından aktarıldı
            {event.latestArticleAt
              ? ` · Son güncelleme ${format(event.latestArticleAt, 'd MMMM yyyy HH:mm', { locale: tr })}`
              : null}
          </p>

          {event.summary ? (
            <p className="mt-6 text-lg leading-relaxed text-[rgb(var(--color-text))]">{event.summary}</p>
          ) : null}

          <section className="mt-10">
            <h2 className="mb-4 text-lg font-bold text-[rgb(var(--color-text))]">Zaman çizelgesi</h2>
            <ol className="space-y-4 border-l-2 border-[rgb(var(--color-border))] pl-4">
              {event.timeline.map((item) => (
                <li key={item.articleId} className="relative">
                  <div className="absolute -left-[calc(1rem+5px)] top-2 h-2.5 w-2.5 rounded-full bg-[rgb(var(--color-brand))]" />
                  <p className="font-medium text-[rgb(var(--color-text))]">{item.title}</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    {item.sourceName ?? 'Kaynak'}
                    {item.publishedAt
                      ? ` · ${format(item.publishedAt, 'd MMM yyyy HH:mm', { locale: tr })}`
                      : null}
                  </p>
                  {item.url ? (
                    <a
                      href={item.url}
                      rel="nofollow noopener noreferrer"
                      target="_blank"
                      className="mt-1 inline-block text-xs text-[rgb(var(--color-brand))] hover:underline"
                    >
                      Orijinal kaynak
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </article>
      </main>
    </>
  )
}
