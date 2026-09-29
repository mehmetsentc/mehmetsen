'use client'

import { useState } from 'react'
import { ArrowRight, Link2, Plus } from 'lucide-react'
import { parseImportText } from '@/media-studio/urlInput'
import { focusRing, primaryButton } from './styles'

export function ImportPanel({
  value,
  onChange,
  onAnalyze,
  busy,
}: {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void
  busy?: boolean
}) {
  const draft = parseImportText(value)
  const [expanded, setExpanded] = useState(() => value.includes('\n'))
  const [hot, setHot] = useState(false)
  const invalid = draft.lines.filter((line) => !line.valid)
  const multi = expanded || value.includes('\n')

  const analyze = () => {
    if (draft.urlCount === 0) {
      document.getElementById('media-studio-urls')?.focus()
      return
    }
    onAnalyze()
  }

  return (
    <section className="w-full max-w-[840px]">
      <label htmlFor="media-studio-urls" className="sr-only">
        Bağlantı
      </label>
      <div
        className={`flex items-center gap-2 rounded-2xl bg-[rgb(var(--color-card))] py-2 pl-4 pr-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-[rgb(var(--color-border))] transition ${
          hot ? 'ring-2 ring-[rgb(var(--color-brand))]' : 'focus-within:ring-2 focus-within:ring-[rgb(var(--color-brand))]'
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setHot(true)
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(event) => {
          event.preventDefault()
          setHot(false)
          const text = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')
          if (!text.trim()) return
          if (text.includes('\n')) setExpanded(true)
          onChange(value.trim() ? `${value.trim()}\n${text.trim()}` : text.trim())
        }}
      >
        <Link2 className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" aria-hidden="true" />
        {multi ? (
          <textarea
            id="media-studio-urls"
            value={value}
            rows={4}
            onChange={(event) => onChange(event.target.value)}
            placeholder={'https://...\nhttps://...'}
            className={`max-h-40 min-h-24 w-full resize-none bg-transparent py-2 text-base text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))] ${focusRing}`}
          />
        ) : (
          <input
            id="media-studio-urls"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData('text')
              if (!text.includes('\n')) return
              event.preventDefault()
              setExpanded(true)
              onChange(text.trim())
            }}
            placeholder="https://video-veya-icerik-linki..."
            className={`h-10 w-full bg-transparent text-base text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))] ${focusRing}`}
          />
        )}
        <button type="button" className={`${primaryButton} min-h-10 shrink-0 px-4`} onClick={analyze} disabled={busy}>
          Analiz
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {!multi ? (
        <button
          type="button"
          className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-text))] ${focusRing}`}
          onClick={() => setExpanded(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Birden fazla bağlantı ekle
        </button>
      ) : (
        <p className="mt-3 text-sm text-[rgb(var(--color-muted))]">Her satıra bir bağlantı.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-sm" aria-live="polite">
        {draft.urlCount > 1 ? <span className="font-medium text-[rgb(var(--color-text))]">{draft.urlCount} bağlantı</span> : null}
        {draft.duplicateCount > 0 ? <span className="text-[rgb(var(--admin-warning))]">{draft.duplicateCount} tekrar</span> : null}
        {draft.invalidCount > 0 ? <span className="text-[rgb(var(--admin-danger))]">{draft.invalidCount} geçersiz</span> : null}
      </div>
      {invalid.length > 0 ? (
        <ul className="mt-1 space-y-1 text-sm text-[rgb(var(--admin-danger))]">
          {invalid.slice(0, 3).map((line) => (
            <li key={line.raw}>{line.raw}</li>
          ))}
        </ul>
      ) : null}
      <p className="sr-only">Bağlantıları bu alana sürükleyebilirsiniz. Dosya indirilmez.</p>
    </section>
  )
}
