import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

type DesktopCategoryCardProps = {
  item: NewsItem
  priority?: boolean
}

export function DesktopCategoryCard({ item, priority = false }: DesktopCategoryCardProps) {
  return (
    <Link href={newsItemDetailHref(item)} className="dcp-card">
      <span className="dcp-card__media">
        <SafeNewsImage
          src={item.imageUrl || FEED_FALLBACK_LOGO}
          alt={item.title}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 22vw, 50vw"
          className="object-cover"
        />
      </span>
      <span className="dcp-card__title">{item.title}</span>
    </Link>
  )
}
