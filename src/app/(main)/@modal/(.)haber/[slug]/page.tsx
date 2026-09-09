import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ArticleCopyGuard } from '@/components/news/ArticleCopyGuard'
import { NewsArticleStatic } from '@/components/news/NewsArticleStatic'
import { NewsArticleInteractive } from '@/components/news/NewsArticleInteractive'
import { getNewsBySlug } from '@/services/newsService.server'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { canResolveArticleDetail, classifyPublicRead, publicReadMetaFromPost } from '@/services/editorial/publicReadPolicy'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { ArticleLiftShell } from '@/components/articleLift/ArticleLiftShell'

// ISR note: this route shares the same 60s revalidate window as the
// canonical /haber/[slug] page it intercepts (see that file) so the two
// never disagree about freshness.
export const revalidate = 60

// Separate `cache()` instance from the canonical page's — Next.js request
// memoization is per-module, and this is a distinct module (a distinct
// route segment), so this call is NOT a duplicate fetch of the canonical
// page's `getCachedNews`. It exists so THIS route doesn't fetch the same
// post twice if something within it were to read the post more than once.
const getCachedNews = cache((slug: string) => getNewsBySlug(slug))

type PageProps = {
  params: Promise<{ slug: string }>
}

/**
 * LP7R.2 Article Lift — intercepted route.
 *
 * This file exists ONLY because it sits inside the `@modal` parallel-route
 * slot's `(.)haber/[slug]` intercepting-route folder. Next.js's own
 * routing rules are what give us the entire "canonical URL rule" for free:
 *
 * - A click on a Publisher Newspaper card that uses <Link> (soft, client-side
 *   navigation) has this route intercepted and rendered here, into the
 *   `@modal` slot, ON TOP OF the already-mounted Publisher Newspaper page
 *   underneath (which never unmounts) — this is the "Lift".
 * - A direct visit, a hard refresh, or a shared URL to the exact same
 *   /haber/[slug] path bypasses interception entirely (Next.js's documented
 *   behavior) and renders the REAL canonical
 *   src/app/(main)/haber/[slug]/page.tsx instead, with its full metadata,
 *   JSON-LD, canonical tag, and SEO context untouched.
 *
 * So there is exactly one canonical URL and exactly one canonical
 * page.tsx that owns SEO — this file never emits its own <title>,
 * metadata, or JSON-LD, and must not: doing so would create a second
 * competing "canonical" surface for the same article, which is exactly
 * what the spec's Article URL rule forbids.
 *
 * Deliberately NOT reused here (see Task 1 architecture audit): seoContext,
 * adSlots, prerollAd, ArticlePageChrome (scroll progress + swipe-nav chrome
 * that assumes it owns the full page). The Lift is a reading surface for
 * the article body/media/social actions — not a second SEO-bearing page.
 */
export default async function ArticleLiftInterceptedPage({ params }: PageProps) {
  const { slug: rawSlug } = await params
  let slug = rawSlug
  try {
    slug = decodeURIComponent(rawSlug)
  } catch {}

  let post = null
  try {
    post = await getCachedNews(slug)
  } catch {
    // Fall through to notFound() below, same as the canonical page.
  }

  if (!post) notFound()
  if (!isPubliclyVisibleStatus(post.status)) notFound()

  const readClass = classifyPublicRead(publicReadMetaFromPost(post))
  if (!canResolveArticleDetail(readClass)) notFound()

  // Deliberately NOT redirecting on slug mismatch here (unlike the canonical
  // page's permanentRedirect): a redirect inside an intercepted parallel
  // route would fight the underlying Publisher Newspaper page's own URL
  // rather than gracefully closing the Lift. A slug-mismatched deep link
  // reaching this file at all is already an edge case the canonical page
  // itself will correct on the next direct visit/refresh.

  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug

  return (
    <ArticleLiftShell articleId={post.id}>
      <ArticleCopyGuard />
      <NewsArticleStatic post={post} />
      <NewsArticleInteractive post={post} citySlug={citySlug} />
    </ArticleLiftShell>
  )
}
