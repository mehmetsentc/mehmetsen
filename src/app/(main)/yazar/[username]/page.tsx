import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Globe, MapPin } from 'lucide-react'
import { SiteContainer } from '@/components/layout/SiteContainer'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'
import { editorIdentityLabel } from '@/lib/profile/identityLabels'
import { aiDeskPublicName } from '@/lib/seo/publicAuthorIdentity'
import {
  getAuthorByUsername,
  getPostsByAuthorId,
} from '@/services/newsService.server'
import { AuthorProfileClient } from '@/components/author/AuthorProfileClient'

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
  const publicName = author.isAI ? aiDeskPublicName(author.username, siteName) : author.displayName
  const roleLabel = author.isAI ? 'NaHaber AI Editörü' : 'Yazar'
  const title = `${publicName} — ${roleLabel}`
  const description = author.isAI
    ? `${publicName} — NaHaber yapay zeka editoryal masası.`
    : author.bio?.trim() || `${author.displayName} tarafından ${siteName} üzerinde yayımlanan içerikler.`
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
  const publicName = author.isAI ? aiDeskPublicName(author.username, siteName) : author.displayName
  const profileUrl = `${siteUrl}${ROUTES.AUTHOR(author.username)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${publicName} — ${author.isAI ? 'AI Editör' : 'Yazar'}`,
    url: profileUrl,
    mainEntity: author.isAI
      ? {
          '@type': 'Organization',
          name: publicName,
          url: profileUrl,
          description: `${publicName} — NaHaber yapay zeka editoryal masası.`,
        }
      : {
          '@type': 'Person',
          name: publicName,
          url: profileUrl,
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
      <SiteContainer className="py-5 sm:py-6" data-profile-view="editor">
        <header className="mb-5 flex items-start gap-3 border-b border-[rgb(var(--color-border))] pb-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--color-brand))]/10 text-lg font-bold text-[rgb(var(--color-brand))]">
            {author.photoURL ? (
              <SafeNewsImage
                src={author.photoURL}
                alt={publicName}
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden>{publicName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--color-brand))]">
              {editorIdentityLabel(author)}
            </p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[rgb(var(--color-text))] sm:text-3xl">
              {publicName}
            </h1>
            <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">@{author.username}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--color-muted))]">
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

        <AuthorProfileClient author={author} posts={posts} />
      </SiteContainer>
    </>
  )
}
