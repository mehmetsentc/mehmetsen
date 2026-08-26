import { ROUTES } from '@/constants/routes'
import { getSiteUrl, buildPostShareUrl } from '@/lib/seo'
import type { Post } from '@/types/post'

/** Article detail pages always use canonical /haber/[slug] URL. */
export function articleCanonicalUrl(post: Pick<Post, 'id' | 'slug'>): string {
  return buildPostShareUrl(post)
}

export function publisherCanonicalUrl(slug: string): string {
  return `${getSiteUrl()}${ROUTES.PUBLISHER(slug)}`
}

export function cityCanonicalUrl(citySlug: string): string {
  return `${getSiteUrl()}${ROUTES.LOCAL_CITY(citySlug)}`
}

export function districtCanonicalUrl(citySlug: string, districtSlug: string): string {
  return `${getSiteUrl()}/yerel/${encodeURIComponent(citySlug)}/${encodeURIComponent(districtSlug)}`
}

export function categoryCanonicalUrl(categorySlug: string): string {
  return `${getSiteUrl()}${ROUTES.CATEGORY(categorySlug)}`
}

export function topicCanonicalUrl(tagSlug: string): string {
  return `${getSiteUrl()}${ROUTES.TAG(tagSlug)}`
}

export function eventCanonicalUrl(eventSlug: string): string {
  return `${getSiteUrl()}${ROUTES.EVENT(eventSlug)}`
}
