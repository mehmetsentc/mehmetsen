'use client'

import type { LibraryFilter, LibrarySort } from '@/media-studio/types'
import { setLibraryControls, updateStudioSession, visibleLibrary } from '@/media-studio/session'
import { useStudio } from '@/media-studio/useStudio'
import { fieldClass, focusRing, quietButton } from './styles'
import { EmptyState } from './EmptyState'
import { MediaLibraryGrid } from './MediaLibraryGrid'
import { MediaLibraryList } from './MediaLibraryList'
import { StudioSkeleton } from './StudioSkeleton'
import { useStudioReveal } from './useStudioReveal'

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'today', label: 'Bugün' },
  { id: 'video', label: 'Video' },
  { id: 'images', label: 'Görseller' },
  { id: 'draft', label: 'Taslak' },
  { id: 'imported', label: "NaHaber'e Aktarıldı" },
  { id: 'saved', label: 'Saklananlar' },
  { id: 'expiring', label: 'Süresi Dolacaklar' },
]

export function LibraryScreen() {
  const session = useStudio()
  const ready = useStudioReveal()
  const items = visibleLibrary(session)

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="min-w-0 flex-1 text-sm font-medium text-[rgb(var(--color-text))]">
          <span className="sr-only">Ara</span>
          <input
            className={fieldClass}
            placeholder="Başlık veya kaynak ara"
            value={session.libraryQuery}
            onChange={(event) =>
              updateStudioSession((current) => setLibraryControls(current, { libraryQuery: event.target.value }))
            }
          />
        </label>
        <label className="text-sm font-medium text-[rgb(var(--color-text))]">
          <span className="sr-only">Filtre</span>
          <select
            className={fieldClass}
            value={session.libraryFilter}
            aria-label="Filtre"
            onChange={(event) =>
              updateStudioSession((current) =>
                setLibraryControls(current, { libraryFilter: event.target.value as LibraryFilter })
              )
            }
          >
            {FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[rgb(var(--color-text))]">
          <span className="sr-only">Sırala</span>
          <select
            className={fieldClass}
            value={session.librarySort}
            aria-label="Sırala"
            onChange={(event) =>
              updateStudioSession((current) =>
                setLibraryControls(current, { librarySort: event.target.value as LibrarySort })
              )
            }
          >
            <option value="newest">En Yeni</option>
            <option value="oldest">En Eski</option>
            <option value="size">Boyut</option>
            <option value="name">İsim</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className={session.libraryView === 'grid' ? quietButton : `${quietButton} opacity-70`}
            aria-pressed={session.libraryView === 'grid'}
            onClick={() => updateStudioSession((current) => setLibraryControls(current, { libraryView: 'grid' }))}
          >
            Izgara
          </button>
          <button
            type="button"
            className={`${session.libraryView === 'list' ? quietButton : `${quietButton} opacity-70`} ${focusRing}`}
            aria-pressed={session.libraryView === 'list'}
            onClick={() => updateStudioSession((current) => setLibraryControls(current, { libraryView: 'list' }))}
          >
            Liste
          </button>
        </div>
      </div>
      {!ready ? <StudioSkeleton rows={4} /> : null}
      {ready && items.length === 0 ? (
        <EmptyState
          title="Henüz medya yok."
          body="İlk içeriğinizi içe aktararak başlayın."
          actionHref="/admin/media-studio"
          actionLabel="Medya İçe Aktar"
        />
      ) : null}
      {ready && items.length > 0 && session.libraryView === 'grid' ? <MediaLibraryGrid items={items} /> : null}
      {ready && items.length > 0 && session.libraryView === 'list' ? <MediaLibraryList items={items} /> : null}
    </div>
  )
}
