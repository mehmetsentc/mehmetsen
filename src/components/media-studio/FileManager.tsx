'use client'

import { useState } from 'react'
import type { StudioFileNode } from '@/media-studio/types'
import { fieldClass, ghostButton, quietButton } from './styles'

export function FileManager({
  files,
  onRename,
  onDelete,
  onDownload,
}: {
  files: StudioFileNode[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
}) {
  const [editId, setEditId] = useState<string | null>(null)
  const [value, setValue] = useState('')

  if (files.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[rgb(var(--color-border))] px-6 py-16 text-center">
        <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">Dosya yok.</h3>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
          <tr className="border-b border-[rgb(var(--color-border))]">
            <th className="px-4 py-3 font-semibold">Ad</th>
            <th className="hidden px-3 py-3 font-semibold sm:table-cell">Tür</th>
            <th className="hidden px-3 py-3 font-semibold md:table-cell">Boyut</th>
            <th className="hidden px-3 py-3 font-semibold lg:table-cell">Değişiklik</th>
            <th className="px-3 py-3 font-semibold">
              <span className="sr-only">İşlemler</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id} className="border-b border-[rgb(var(--color-border))] last:border-0">
              <td className="px-4 py-3 font-medium text-[rgb(var(--color-text))]" style={{ paddingLeft: `${16 + file.depth * 16}px` }}>
                {file.name}
              </td>
              <td className="hidden px-3 py-3 text-[rgb(var(--color-muted))] sm:table-cell">{file.type}</td>
              <td className="hidden px-3 py-3 md:table-cell">{file.sizeLabel}</td>
              <td className="hidden px-3 py-3 text-[rgb(var(--color-muted))] lg:table-cell">{file.modifiedLabel}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap justify-end gap-1">
                  <button type="button" className={ghostButton} onClick={() => onDownload(file.id)}>
                    İndir
                  </button>
                  <button
                    type="button"
                    className={ghostButton}
                    onClick={() => {
                      setEditId(file.id)
                      setValue(file.name)
                    }}
                  >
                    Yeniden Adlandır
                  </button>
                  <button type="button" className={ghostButton} onClick={() => onDelete(file.id)}>
                    Sil
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editId ? (
        <form
          className="flex flex-col gap-2 border-t border-[rgb(var(--color-border))] p-4 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            onRename(editId, value)
            setEditId(null)
          }}
        >
          <label className="sr-only" htmlFor="file-rename">
            Yeni dosya adı
          </label>
          <input id="file-rename" className={fieldClass} value={value} onChange={(event) => setValue(event.target.value)} />
          <button type="submit" className={quietButton}>
            Kaydet
          </button>
        </form>
      ) : null}
    </div>
  )
}
