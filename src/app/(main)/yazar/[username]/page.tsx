import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Globe, MapPin, User } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'
import { getCategoryLabel } from '@/lib/newsMapper'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import {
  getAuthorByUsername,
  getPostsByAuthorId,
} from '@/services/newsService.server'

export const revalidate = 180

interface Props {
  params: Promise<{ username: string }>
}

function decodeUsername(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLocaleLowerCase('tr-TR')
  } catch {
    return raw.trim().toLocaleLowerCase('tr-TR')
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const username = decodeUsername((await params).username)
  const author = await getAuthorByUsername(username)
  if (!author) return { title: 'Yazar bulunamadı', robots: { index: false, follow: false } }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = `${author.displayName} — Yazar`
  const description =
    author.bio?.trim() ||
    `${author.displayName} tarafından ${siteName} üzerinde yayımlanan haberler.`
  const canonical = `${siteUrl}${ROUTES.AUTHOR(author.username)}`

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      type: 'profile',
      locale: 'tr_TR',
      siteName,
    },
    twitter: {
      card: 'summary',
      site: '@nahabercom',
      title,
      description,
    },
  }
}

export default async function AuthorPage({ params }: Props) {
  const username = decodeUsername((await params).username)
  if (!username || !/^[a-z0-9._-]{2,40}$/i.test(username)) notFound()

  const author = await getAuthorByUsername(username)
  if (!author) notFound()

  const posts = await getPostsByAuthorId(author.uid, 40)
  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${author.displayName} — Yazar`,
    url: `${siteUrl}${ROUTES.AUTHOR(author.username)}`,
    mainEntity: {
      '@type': 'Person',
      name: author.displayName,
      url: `${siteUrl}${ROUTES.AUTHOR(author.username)}`,
      ...(author.photoURL ? { image: author.photoURL } : {}),
      ...(author.bio ? { description: author.bio } : {}),
      ...(author.website ? { sameAs: [author.website] } : {}),
      worksFor: { '@type': 'NewsMediaOrganization', name: siteName },
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-8 flex items-start gap-4 border-b border-[rgb(var(--color-border))] pb-6">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]">
            {author.photoURL ? (
              // Native img: author avatars come from arbitrary hosts (Firebase Auth,
              // Google, Apple) that are not all allow-listed in next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.photoURL}
                alt={author.displayName}
                width={64}
                height={64}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <User className="h-7 w-7" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
              Yazar
            </p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[rgb(var(--color-text))] sm:text-3xl">
              {author.displayName}
              {author.isVerified ? (
                <span className="ml-2 align-middle text-sm font-semibold text-[rgb(var(--color-brand))]">
                  ✓
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">@{author.username}</p>
            {author.bio ? (
              <p className="mt-3 text-sm leading-relaxed text-[rgb(var(--color-text))]">
                {author.bio}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[rgb(var(--color-muted))]">
              {author.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {author.location}
                </span>
              ) : null}
              {author.website ? (
                <a
                  href={author.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[rgb(var(--color-brand))] hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" aria-hidden />
                  Web sitesi
                </a>
              ) : null}
              {author.department ? <span>{author.department}</span> : null}
            </div>
          </div>
        </header>

        <section aria-label="Yazarın haberleri">
          <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">
            Haberler ({posts.length})
          </h2>
          {posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
              Bu yazarın henüz yayımlanmış haberi yok.
            </p>
          ) : (
            <ul className="space-y-4">
              {posts.map((post) => {
                const image =
                  post.coverImageUrl?.trim() ||
                  post.mediaItems?.find((m) => m.type === 'image')?.url ||
                  null
                return (
                  <li key={post.id}>
                    <Link
                      href={ROUTES.NEWS_DETAIL(post.slug)}
                      className="flex gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 transition-colors hover:border-[rgb(var(--color-brand))]/40"
                    >
                      {image ? (
                        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-border))]">
                          <SafeNewsImage
                            src={image}
                            alt={post.title}
                            fill
                            className="object-cover"
                            sizes="112px"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                          {getCategoryLabel(post.categoryId)}
                        </p>
                        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">
                          {post.title}
                        </h3>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}
