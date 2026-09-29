'use client'

import { useEffect, useState } from 'react'
import type { WorkspaceText } from '@/media-studio/types'
import { textsDiffer } from '@/media-studio/session'
import { fieldClass, primaryButton, quietButton } from './styles'

const FIELDS: { key: keyof WorkspaceText; label: string; multiline?: boolean; readOnly?: boolean }[] = [
  { key: 'title', label: 'Başlık' },
  { key: 'description', label: 'Açıklama', multiline: true },
  { key: 'caption', label: 'Caption', multiline: true },
  { key: 'tags', label: 'Tags' },
  { key: 'notes', label: 'Notes', multiline: true },
  { key: 'source', label: 'Source' },
  { key: 'originalUrl', label: 'Original URL', readOnly: true },
]

export function MetadataEditor({
  original,
  edited,
  saved,
  onChange,
  onSave,
}: {
  original: WorkspaceText
  edited: WorkspaceText
  saved: WorkspaceText
  onChange: (key: keyof WorkspaceText, value: string) => void
  onSave: () => void
}) {
  const dirty = textsDiffer(edited, saved)
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  return (
    <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[rgb(var(--color-text))]">Metin</h3>
          {FIELDS.map((field) => (
            <label key={field.key} className="block text-sm font-medium text-[rgb(var(--color-text))]">
              {field.label}
              {field.multiline ? (
                <textarea
                  className={`${fieldClass} mt-1.5 min-h-[96px]`}
                  value={edited[field.key]}
                  readOnly={field.readOnly}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              ) : (
                <input
                  className={`${fieldClass} mt-1.5`}
                  value={edited[field.key]}
                  readOnly={field.readOnly}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              )}
            </label>
          ))}
      </div>
      <aside className="rounded-2xl bg-[rgb(var(--color-surface))] p-4 lg:sticky lg:top-4">
        <h4 className="text-sm font-semibold text-[rgb(var(--color-text))]">Kayıt</h4>
        {dirty ? (
          <p className="mt-2 text-sm font-medium text-[rgb(var(--admin-warning))]">Kaydedilmemiş değişiklikler</p>
        ) : (
          <p className="mt-2 text-sm text-[rgb(var(--color-text))]/80">Kayıtlı</p>
        )}
        <button type="button" className={`${primaryButton} mt-4 w-full`} onClick={onSave} disabled={!dirty}>
          Kaydet
        </button>
        <button type="button" className={`${quietButton} mt-2 w-full`} onClick={() => setShowOriginal((value) => !value)} aria-pressed={showOriginal}>
          {showOriginal ? 'Orijinali gizle' : 'Orijinali göster'}
        </button>
        {showOriginal ? (
          <div className="mt-4 space-y-3">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <p className="text-xs text-[rgb(var(--color-muted))]">{field.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--color-text))]">{original[field.key] || '—'}</p>
              </div>
            ))}
          </div>
        ) : null}
      </aside>
    </section>
  )
}
