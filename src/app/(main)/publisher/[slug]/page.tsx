import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { publisherService } from '@/services/publisher/publisherService'
import { PublisherProfileClient } from '@/components/publisher/PublisherProfileClient'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isPublisherPlatformEnabled()) {
    return { title: 'Sayfa bulunamadı', robots: { index: false, follow: false } }
  }
  const slug = decodeSlug((await params).slug)
  if (!hasDatabaseUrl()) {
    return { title: slug, robots: { index: false, follow: false } }
  }
  const publisher = await publisherService.getPublicPublisherBySlug(slug)
  if (!publisher) return { title: 'Yayın bulunamadı', robots: { index: false, follow: false } }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = `${publisher.displayName} — Yayın Kuruluşu`
  const description =
    publisher.description?.trim() ||
    `${publisher.displayName} haberleri ve içerikleri ${siteName} üzerinde.`
  const canonical = `${siteUrl}${ROUTES.PUBLISHER(publisher.slug)}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      type: 'profile',
      locale: 'tr_TR',
      siteName,
      ...(publisher.logoUrl ? { images: [{ url: publisher.logoUrl }] } : {}),
    },
  }
}

export default async function PublisherProfilePage({ params }: Props) {
  if (!isPublisherPlatformEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()

  const slug = decodeSlug((await params).slug)
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound()

  const publisher = await publisherService.getPublicPublisherBySlug(slug)
  if (!publisher) notFound()

  const fullRecord = await publisherService.getPublisherBySlug(slug)
  const articlePage = fullRecord
    ? await publisherService.getPublisherArticles(fullRecord.id, 24)
    : { items: [], nextCursor: null }

  return (
    <PublisherProfileClient
      publisher={publisher}
      articles={articlePage.items}
    />
  )
}
