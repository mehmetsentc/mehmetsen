import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Newspaper } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'
import { getPostsBySource } from '@/services/newsService.server'
import { formatPublicSourceLabel } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'

export const revalidate = 300

interface Props {
  params: Promise<{ source: string }>
}

function decodeSource(raw: string): string {
  try {
    return formatPublicSourceLabel(decodeURIComponent(raw))
  } catch {
    return formatPublicSourceLabel(raw)
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const source = decodeSource((await params).source)
  if (!source) return { title: 'Kaynak bulunamadı', robots: { index: false, follow: false } }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = `${source} — Kaynak Haberleri`
  const description = `${source} kaynaklı, ${siteName} üzerinde yayımlanan tüm haberler.`
  const canonical = `${siteUrl}${ROUTES.SOURCE_PROFILE(source)}`

  return {
    title,
    description,
    // Kaynak sayfaları publisher/yazar profillerinin aksine doğrulanmış bir
    // kimlik değil — arama motorlarında ayrı bir "yayıncı sayfası" gibi
    // indekslenmesin, iç navigasyon amaçlı kalsın.
    robots: { index: false, follow: true },
    alternates: { canonical },
  }
}

export default async function SourceProfilePage({ params }: Props) {
  const source = decodeSource((await params).source)
  if (!source) notFound()

  const posts = await getPostsBySource(source, 40)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-start gap-4 border-b border-[rgb(var(--color-border))] pb-6">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]">
          <Newspaper className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
            Kaynak
          </p>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[rgb(var(--color-text))] sm:text-3xl">
            {source}
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            {siteName} üzerinde bu kaynaktan yayımlanan haberler
          </p>
        </div>
      </header>

      {posts.length === 0 ? (
        <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
          Bu kaynaktan henüz görüntülenecek haber yok.
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
    </div>
  )
}
