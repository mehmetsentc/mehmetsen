'use client'

import { useEffect, useState } from 'react'
import { useStudio } from '@/media-studio/useStudio'
import { useStudioActions } from './studioActions'
import { fieldClass, primaryButton } from './styles'

export function SettingsScreen() {
  const session = useStudio()
  const actions = useStudioActions()
  const [draft, setDraft] = useState(session.settings)
  useEffect(() => {
    setDraft(session.settings)
  }, [session.settings])

  return (
    <form
      className="grid gap-4 pb-10 lg:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        void actions.saveSettings(draft)
      }}
    >
      <Section title="İndirmeler">
        <NumberField
          label="Eşzamanlı indirme"
          min={1}
          max={3}
          value={draft.concurrentDownloads}
          onChange={(value) => setDraft({ ...draft, concurrentDownloads: value })}
        />
        <label className="block py-3 text-sm">
          <span className="text-[rgb(var(--color-muted))]">Varsayılan kalite</span>
          <input
            className={`${fieldClass} mt-1`}
            value={draft.defaultQuality}
            onChange={(event) => setDraft({ ...draft, defaultQuality: event.target.value })}
          />
          <span className="mt-1 block text-xs text-[rgb(var(--color-muted))]">Tercih kaydedilir. Dosya kaynaktaki haliyle iner.</span>
        </label>
      </Section>
      <Section title="Depolama">
        <NumberField
          label="Geçici saklama (saat)"
          min={1}
          max={168}
          value={draft.temporaryHours}
          onChange={(value) => setDraft({ ...draft, temporaryHours: value })}
        />
        <p className="py-3 text-sm font-medium text-[rgb(var(--color-text))]">
          {session.quota.usedLabel} / {session.quota.capLabel}
        </p>
      </Section>
      <Section title="Dosyalar">
        <Check label="Video" checked={draft.includeVideo} onChange={(includeVideo) => setDraft({ ...draft, includeVideo })} />
        <Check label="Görseller" checked={draft.includeImages} onChange={(includeImages) => setDraft({ ...draft, includeImages })} />
        <Check label="Metadata" checked={draft.includeMetadata} onChange={(includeMetadata) => setDraft({ ...draft, includeMetadata })} />
      </Section>
      <Section title="Gelişmiş">
        <Check label="Otomatik yeniden deneme" checked={draft.autoRetry} onChange={(autoRetry) => setDraft({ ...draft, autoRetry })} />
        <NumberField
          label="ZIP saklama (saat)"
          min={1}
          max={168}
          value={draft.zipRetentionHours}
          onChange={(value) => setDraft({ ...draft, zipRetentionHours: value })}
        />
      </Section>
      <div className="lg:col-span-2">
        <button type="submit" className={primaryButton}>
          Kaydet
        </button>
      </div>
    </form>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block py-3 text-sm">
      <span className="text-[rgb(var(--color-muted))]">{label}</span>
      <input
        className={`${fieldClass} mt-1`}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="text-[rgb(var(--color-muted))]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-[rgb(var(--color-card))] p-5 ring-1 ring-[rgb(var(--color-border))]">
      <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}
