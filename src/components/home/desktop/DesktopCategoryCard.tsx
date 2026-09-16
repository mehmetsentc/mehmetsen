import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

type DesktopCategoryCardProps = {
  item: NewsItem
  priority?: boolean
}

export function DesktopCategoryCard({ item, priority = false }: DesktopCategoryCardProps) {
  const image = item.imageUrl?.trim()
  const dek = item.summary || item.description
  const clock = formatNewsClockTime(item.publishedAt ?? item.createdAt)

  return (
    <article className="dcp-card">
      {image ? (
        <Link href={newsItemDetailHref(item)} className="dcp-card__media">
          <SafeNewsImage
            src={image}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1024px) 22vw, 50vw"
            className="object-cover"
          />
        </Link>
      ) : null}
      {clock ? <p className="dcp-card__time">{clock}</p> : null}
      <Link href={newsItemDetailHref(item)} className="dcp-card__title">
        {item.title}
      </Link>
      {dek ? <p className="dcp-card__dek">{dek}</p> : null}
    </article>
  )
}
