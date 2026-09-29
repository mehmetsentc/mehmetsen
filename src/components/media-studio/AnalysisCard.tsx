'use client'

import { FileText, Film, Image as ImageIcon, Images } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AnalysisItem, AssetChoice } from '@/media-studio/types'
import { focusRing } from './styles'
import { MediaThumb } from './MediaThumb'
import { TechnicalErrorDetails } from './TechnicalErrorDetails'

const CHOICE_ICON: Partial<Record<AssetChoice, LucideIcon>> = {
  video: Film,
  images: Images,
  description: FileText,
  thumbnail: ImageIcon,
  metadata: FileText,
}

const CHOICE_LABEL: Partial<Record<AssetChoice, string>> = {
  thumbnail: 'Kapak',
}

const CHOICE_ORDER: AssetChoice[] = ['video', 'images', 'description', 'thumbnail', 'metadata', 'subtitle', 'audio']

export function AnalysisCard({
  item,
  selected,
  assets,
  onToggleCard,
  onToggleAsset,
  density = 'feature',
  action,
}: {
  item: AnalysisItem
  selected: boolean
  assets: AssetChoice[]
  onToggleCard: () => void
  onToggleAsset: (key: AssetChoice) => void
  density?: 'feature' | 'compact'
  action?: React.ReactNode
}) {
  const ready = item.status === 'READY'
  const choices = CHOICE_ORDER.flatMap((key) => item.assets.filter((asset) => asset.key === key && asset.available))

  if (density === 'compact') {
    return (
      <article className="flex items-center gap-3 rounded-xl bg-[rgb(var(--color-card))] px-3 py-2 ring-1 ring-[rgb(var(--color-border))]">
        {ready ? (
          <input
            type="checkbox"
            className={`h-4 w-4 shrink-0 accent-[rgb(var(--color-brand))] ${focusRing}`}
            checked={selected}
            aria-label={`İçeriği seç: ${item.title}`}
            onChange={onToggleCard}
          />
        ) : (
          <span className="w-4" />
        )}
        <MediaThumb hue={item.thumbHue} className="h-12 w-20 shrink-0 rounded-lg" label="" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[rgb(var(--color-text))]">{item.title}</h3>
          <p className="truncate text-sm text-[rgb(var(--color-text))]/70">
            {item.status === 'FAILED' ? item.errorTitle : `${item.source}${item.durationLabel ? ` · ${item.durationLabel}` : ''}`}
          </p>
        </div>
        {ready ? (
          <div className="hidden items-center gap-2 lg:flex">
            {choices.slice(0, 4).map((asset) => {
              const label = CHOICE_LABEL[asset.key] ?? asset.label
              const on = assets.includes(asset.key)
              return (
                <button
                  key={asset.key}
                  type="button"
                  aria-pressed={on}
                  className={`rounded-lg px-2 py-1 text-xs font-medium ${focusRing} ${
                    on ? 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'
                  }`}
                  onClick={() => onToggleAsset(asset.key)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <article className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,400px)]">
      <MediaThumb hue={item.thumbHue} className="aspect-video w-full rounded-2xl" label="" />
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-[rgb(var(--color-text))]">{item.title}</h2>
        <p className="mt-2 text-sm text-[rgb(var(--color-text))]/80">
          {item.source}
          {item.durationLabel ? ` · ${item.durationLabel}` : ''}
          {item.qualityLabel ? ` · ${item.qualityLabel}` : ''}
        </p>
        {item.status === 'FAILED' && item.errorTitle ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-[rgb(var(--admin-danger))]">{item.errorTitle}</p>
            {item.errorDetail ? <TechnicalErrorDetails detail={item.errorDetail} /> : null}
          </div>
        ) : null}
        {choices.length > 0 ? (
          <fieldset className="mt-5 grid gap-2" disabled={!ready}>
            <legend className="sr-only">{item.title} parçaları</legend>
            {choices.map((asset) => {
              const Icon = CHOICE_ICON[asset.key] ?? FileText
              const label = CHOICE_LABEL[asset.key] ?? asset.label
              return (
                <label key={asset.key} className="flex items-center gap-3 rounded-xl bg-[rgb(var(--color-surface))] px-3 py-3 text-sm font-medium text-[rgb(var(--color-text))]">
                  <input
                    type="checkbox"
                    className={`h-4 w-4 accent-[rgb(var(--color-brand))] ${focusRing}`}
                    checked={assets.includes(asset.key)}
                    onChange={() => onToggleAsset(asset.key)}
                  />
                  <Icon className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden="true" />
                  <span>{label}</span>
                </label>
              )
            })}
          </fieldset>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </article>
  )
}
