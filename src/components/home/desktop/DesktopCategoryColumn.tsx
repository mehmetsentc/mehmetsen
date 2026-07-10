import { getCategoryLabel } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { ImageStory, SidebarTextStory } from '@/components/home/desktop/DesktopStoryBlocks'
import type { NewsItem } from '@/types/newsItem'

interface DesktopCategoryColumnProps {
  categoryId: string
  items: NewsItem[]
}

function CategoryColumnBody({ items }: { items: NewsItem[] }) {
  const [lead, ...rest] = items

  return (
    <div className="space-y-0">
      {lead ? <ImageStory item={lead} aspect="video" showSummary /> : null}
      {rest.slice(0, 3).map((item) => (
        <SidebarTextStory key={item.id} item={item} />
      ))}
    </div>
  )
}

export function DesktopCategoryColumn({ categoryId, items }: DesktopCategoryColumnProps) {
  if (items.length === 0) return null

  return (
    <div className="min-w-0">
      <DesktopSectionHeader title={getCategoryLabel(categoryId)} href={ROUTES.CATEGORY(categoryId)} />
      <CategoryColumnBody items={items} />
    </div>
  )
}

/** Kategori verisi yoksa satırı doldurmak için öne çıkan haber sütunu. */
export function DesktopFeaturedColumn({
  title,
  items,
  href = ROUTES.CATEGORY('gundem'),
}: {
  title: string
  items: NewsItem[]
  href?: string
}) {
  if (items.length === 0) return null

  return (
    <div className="min-w-0">
      <DesktopSectionHeader title={title} href={href} />
      <CategoryColumnBody items={items} />
    </div>
  )
}
