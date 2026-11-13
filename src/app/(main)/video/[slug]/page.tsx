import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buildPostShareUrl, getSiteUrl } from '@/lib/seo'
import { getNewsBySlug } from '@/services/newsService.server'
import { articleRobots, getReelBySlug } from '@/lib/seo/reelWatch.server'
import { buildReelVideoJsonLd, reelWatchPath } from '@/lib/seo/reelWatch'
import { ROUTES } from '@/constants/routes'

/**
 * REELS-SEO-1 — reel watch page: the video is the page's main content so Google
 * can index it (Video tab / video results). Robots follow the story's own
 * decision (read policy + AI quality gate); the story stays the text canonical.
 */
export const revalidate = 3600
export function generateStaticParams() {
  return []
}

type PageProps = { params: Promise<{ slug: string }> }

const load = cache(async (rawSlug: string) => {
  let slug = rawSlug
  try {
    slug = decodeURIComponent(rawSlug)
  } catch {}
  const [reel, post] = await Promise.all([getReelBySlug(slug), getNewsBySlug(slug)])
  if (!reel || !post) return null
  const robots = articleRobots(post)
  if (!robots.resolvable) return null
  return { slug, reel, post, robots }
})

function summaryOf(post: { seoDescription?: string; summary?: string; spot?: string; title: string }): string {
  return (post.seoDescription?.trim() || post.summary?.trim() || post.spot?.trim() || post.title).slice(0, 300)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await load((await params).slug)
  if (!data) return { title: 'Video bulunamadı', robots: { index: false, follow: false } }
  const { slug, reel, post, robots } = data
  const url = `${getSiteUrl()}${reelWatchPath(slug)}`
  const title = `${post.title.trim().slice(0, 60)} | Video`
  const description = summaryOf(post).slice(0, 160)
  const poster = reel.coverUrl || post.coverImageUrl || undefined
  return {
    title,
    description,
    robots: robots.index ? { index: true, follow: true } : { index: false, follow: robots.follow },
    alternates: { canonical: url },
    openGraph: {
      type: 'video.other',
      locale: 'tr_TR',
      url,
      title,
      description,
      videos: [{ url: reel.url, type: 'video/mp4', width: 1080, height: 1920 }],
      ...(poster ? { images: [{ url: poster }] } : {}),
    },
  }
}

export default async function ReelWatchPage({ params }: PageProps) {
  const data = await load((await params).slug)
  if (!data) notFound()
  const { slug, reel, post } = data
  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const pageUrl = `${siteUrl}${reelWatchPath(slug)}`
  const articleUrl = buildPostShareUrl(post)
  const poster = reel.coverUrl || post.coverImageUrl || null
  const description = summaryOf(post)
  const jsonLd = buildReelVideoJsonLd({
    title: post.title,
    description,
    pageUrl,
    articleUrl,
    videoUrl: reel.url,
    thumbnailUrl: poster,
    uploadDate: reel.createdAt || post.publishedAt || post.createdAt,
    seconds: reel.seconds,
    siteUrl,
    siteName,
  })

  return (
    <main className="mx-auto w-full max-w-[34rem] px-4 pb-16 pt-4" data-testid="reel-watch-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <h1 className="mb-3 font-serif text-2xl font-bold leading-tight">{post.title}</h1>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[24rem] overflow-hidden rounded-xl bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={reel.url}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
      <p className="mt-4 text-base leading-relaxed">{description}</p>
      <p className="mt-4">
        <Link href={ROUTES.NEWS_DETAIL(slug)} className="font-semibold text-[rgb(var(--color-accent,220_38_38))] underline">
          Haberin tamamını oku
        </Link>
      </p>
    </main>
  )
}
