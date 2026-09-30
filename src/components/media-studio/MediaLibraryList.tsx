import Link from 'next/link'
import type { LibraryItem } from '@/media-studio/types'
import { mediaStudioWorkspacePath } from '@/media-studio/routes'
import { ghostButton } from './styles'
import { MediaThumb } from './MediaThumb'
import { StatusBadge } from './StatusBadge'

export function MediaLibraryList({ items }: { items: LibraryItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
          <tr className="border-b border-[rgb(var(--color-border))]">
            <th className="px-4 py-3 font-semibold">İçerik</th>
            <th className="px-3 py-3 font-semibold">Kaynak</th>
            <th className="px-3 py-3 font-semibold">Medya</th>
            <th className="px-3 py-3 font-semibold">Boyut</th>
            <th className="px-3 py-3 font-semibold">Tarih</th>
            <th className="px-3 py-3 font-semibold">Saklama</th>
            <th className="px-3 py-3 font-semibold">Durum</th>
            <th className="px-3 py-3 font-semibold">
              <span className="sr-only">İşlem</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[rgb(var(--color-border))] last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <MediaThumb hue={item.thumbHue} className="h-12 w-16 shrink-0 rounded-lg" label="" />
                  <span className="font-semibold text-[rgb(var(--color-text))]">{item.title}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-[rgb(var(--color-muted))]">{item.source}</td>
              <td className="px-3 py-3 tabular-nums">{item.mediaCount}</td>
              <td className="px-3 py-3">{item.sizeLabel}</td>
              <td className="px-3 py-3 text-[rgb(var(--color-muted))]">{item.createdLabel}</td>
              <td className="px-3 py-3">{item.retentionLabel}</td>
              <td className="px-3 py-3">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-3 py-3">
                <Link prefetch={false} href={mediaStudioWorkspacePath(item.workspaceId)} className={ghostButton}>
                  Aç
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
