import Link from 'next/link'
import type { LibraryItem } from '@/media-studio/types'
import { mediaStudioWorkspacePath } from '@/media-studio/routes'
import { cardClass, primaryButton } from './styles'
import { MediaThumb } from './MediaThumb'
import { StatusBadge } from './StatusBadge'

export function MediaLibraryGrid({ items }: { items: LibraryItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <article key={item.id} className={`${cardClass} overflow-hidden`}>
          <MediaThumb hue={item.thumbHue} className="aspect-[16/10]" label="" />
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-snug text-[rgb(var(--color-text))]">{item.title}</h3>
              <StatusBadge status={item.status} />
            </div>
            <p className="text-sm text-[rgb(var(--color-muted))]">{item.source}</p>
            <p className="text-sm text-[rgb(var(--color-muted))]">
              {item.mediaCount} medya · {item.sizeLabel} · {item.createdLabel}
            </p>
            <Link prefetch={false} href={mediaStudioWorkspacePath(item.workspaceId)} className={`${primaryButton} mt-2 w-full`}>
              Workspace&apos;i Aç
            </Link>
          </div>
        </article>
      ))}
    </div>
  )
}
