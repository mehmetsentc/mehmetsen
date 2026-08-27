import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { hasDatabaseUrl } from '@/db'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherAdPublicListingEnabled } from '@/lib/publisher/adInventoryFlags'
import { publisherService } from '@/services/publisher/publisherService'
import { publisherAdInventoryService } from '@/services/publisher/publisherAdInventoryService'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'
import { PublisherAdSlotPlaceholder } from '@/components/publisher/PublisherAdSlotPlaceholder'
import { formatPriceMinor } from '@/lib/publisher/adInventoryDomain'
import { AD_FORMAT_LABELS, AD_SALE_STATUS_LABELS } from '@/types/publisherAdInventory'
import { ROUTES } from '@/constants/routes'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug.trim().toLowerCase()
  return {
    title: `Reklam Alanları — ${slug}`,
    robots: { index: false, follow: false },
  }
}

export default async function PublisherReklamMediaKitPage({ params }: Props) {
  if (!isPublisherPlatformEnabled() || !isPublisherAdPublicListingEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()

  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherService.getPublicPublisherBySlug(slug)
  if (!publisher) notFound()

  const full = await publisherService.getPublisherBySlug(slug)
  if (!full) notFound()

  const [inventory, followerCount, articles] = await Promise.all([
    publisherAdInventoryService.listPublicSellable(full.id),
    socialGraphRepository.getPublisherFollowerCount(full.id).catch(() => 0),
    publisherService.getPublisherArticles(full.id, 1),
  ])

  // Approximate article count from first page + whether more exist
  const articleCount = articles.items.length + (articles.nextCursor ? 1 : 0)
  // Prefer accurate count if service exposes it — fallback to listed length
  let articleTotal = articles.items.length
  try {
    const more = await publisherService.getPublisherArticles(full.id, 200)
    articleTotal = more.items.length
  } catch {
    articleTotal = articleCount
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        Medya kiti · Satılabilir alanlar
      </p>
      <h1 className="mt-2 text-3xl font-black">{publisher.displayName}</h1>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
        Gerçek metrikler. Satın alma / ödeme yok — yalnızca ilgi bildirimi.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4">
          <dt className="text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">Takipçi</dt>
          <dd className="mt-1 text-2xl font-black">{followerCount.toLocaleString('tr-TR')}</dd>
        </div>
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4">
          <dt className="text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">Haber</dt>
          <dd className="mt-1 text-2xl font-black">{articleTotal.toLocaleString('tr-TR')}</dd>
        </div>
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4">
          <dt className="text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">Açık alan</dt>
          <dd className="mt-1 text-2xl font-black">{inventory.length}</dd>
        </div>
      </dl>

      <div className="mt-8 space-y-4">
        {inventory.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Şu an satışa açık alan yok.</p>
        ) : (
          inventory.map((item) => (
            <div key={item.id} className="space-y-2 rounded-xl border border-[rgb(var(--color-border))] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">{item.name}</h2>
                <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                  {AD_SALE_STATUS_LABELS[item.saleStatus]} · {AD_FORMAT_LABELS[item.format]}
                </span>
              </div>
              <PublisherAdSlotPlaceholder
                name={item.name}
                semanticSize={item.semanticSize}
                saleStatus={item.saleStatus}
                priceMinor={item.priceMinor}
                currency={item.currency}
              />
              <p className="text-xs text-[rgb(var(--color-muted))]">
                {item.placementScope}
                {item.priceMinor != null
                  ? ` · ${formatPriceMinor(item.priceMinor, item.currency)}`
                  : ' · Fiyat için iletişime geçin'}
              </p>
              <a
                href={`mailto:reklam@nahaber.com?subject=${encodeURIComponent(`İlgileniyorum: ${publisher.displayName} — ${item.name}`)}&body=${encodeURIComponent(`Merhaba,\n\n${publisher.displayName} yayınındaki "${item.name}" reklam alanı ile ilgileniyorum.\nEnvanter ID: ${item.id}\n\n`)}`}
                className="inline-flex rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-bold text-white"
              >
                İlgileniyorum
              </a>
            </div>
          ))
        )}
      </div>

      <p className="mt-8 text-sm">
        <Link href={ROUTES.PUBLISHER(slug)} className="font-semibold text-[rgb(var(--color-brand))]">
          ← Yayın profiline dön
        </Link>
      </p>
    </div>
  )
}
