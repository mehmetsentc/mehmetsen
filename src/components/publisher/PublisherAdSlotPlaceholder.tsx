import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdSemanticSize, AdSaleStatus } from '@/types/publisherAdInventory'
import { formatPriceMinor } from '@/lib/publisher/adInventoryDomain'

/** Sellable-zone placeholder — NOT a real ad creative / impression. */
export function PublisherAdSlotPlaceholder({
  name,
  semanticSize = 'STANDARD',
  saleStatus,
  priceMinor,
  currency = 'TRY',
  mediaKitHref,
  className,
}: {
  name?: string | null
  semanticSize?: AdSemanticSize | string
  saleStatus?: AdSaleStatus
  priceMinor?: number | null
  currency?: string
  mediaKitHref?: string | null
  className?: string
}) {
  const aspect =
    semanticSize === 'BANNER' || semanticSize === 'WIDE'
      ? 'aspect-[6/1]'
      : semanticSize === 'FULL'
        ? 'aspect-[16/5]'
        : semanticSize === 'NATIVE'
          ? 'aspect-[16/9]'
          : 'aspect-[3/1]'

  const forSale = saleStatus === 'AVAILABLE'

  return (
    <aside
      className={cn(
        'overflow-hidden rounded-xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]',
        className
      )}
      data-ad-slot="inventory-placeholder"
      data-sale-status={saleStatus ?? 'NOT_FOR_SALE'}
      aria-label="Reklam alanı"
    >
      <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-6 text-center', aspect)}>
        <Megaphone className="h-5 w-5 text-[rgb(var(--color-muted))]" aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--color-muted))]">
          Reklam Alanı
        </p>
        {forSale ? (
          <p className="text-sm font-black text-[rgb(var(--color-text))]">Satışa Açık</p>
        ) : (
          <p className="text-sm font-semibold text-[rgb(var(--color-muted))]">Rezerve alan</p>
        )}
        {name ? <p className="text-xs text-[rgb(var(--color-muted))]">{name}</p> : null}
        {forSale && priceMinor != null ? (
          <p className="text-xs font-semibold">{formatPriceMinor(priceMinor, currency)}</p>
        ) : null}
        {forSale && mediaKitHref ? (
          <Link
            href={mediaKitHref}
            className="mt-1 text-xs font-bold text-[rgb(var(--color-brand))] hover:underline"
          >
            İlgileniyorum
          </Link>
        ) : null}
      </div>
    </aside>
  )
}
