'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Pencil } from 'lucide-react'
import { useStudio } from '@/media-studio/useStudio'
import { useStudioActions } from './studioActions'
import { AnalysisCard } from './AnalysisCard'
import { ImportPanel } from './ImportPanel'
import { JobRow } from './JobRow'
import { StudioSkeleton } from './StudioSkeleton'
import { MediaThumb } from './MediaThumb'
import { primaryButton, quietButton } from './styles'
import { useStudioLinks } from './studioLinks'

export function ImportScreen({
  initialText = '',
  mode = 'compose',
}: {
  initialText?: string
  mode?: 'compose' | 'result'
}) {
  const session = useStudio()
  const actions = useStudioActions()
  const links = useStudioLinks()
  const [text, setText] = useState(initialText)
  const [pending, setPending] = useState(false)

  const results = session.analyses
  const active = session.jobs.filter((job) => job.status === 'DOWNLOADING')
  const recent = session.jobs.filter((job) => job.status === 'COMPLETED').slice(0, 4)
  const wide = results.length > 1
  const downloadAction = (
    <button
      type="button"
      className={`${primaryButton} w-full sm:w-auto`}
      disabled={session.selectedAnalysisIds.length === 0}
        onClick={() => void actions.enqueue()}
    >
      Seçilenleri İndir
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  )

  return (
    <div className="pb-10">
      {mode === 'compose' && results.length === 0 && !pending ? (
          <ImportPanel
            value={text}
            onChange={setText}
            busy={pending}
            onAnalyze={() => {
              setPending(true)
              void actions.analyze(text).finally(() => setPending(false))
            }}
          />
      ) : null}
      {pending ? (
        <div className="mt-8 max-w-[840px]" aria-live="polite">
          <p className="mb-3 text-sm font-medium text-[rgb(var(--color-text))]">İçerik inceleniyor</p>
          <StudioSkeleton rows={2} />
        </div>
      ) : null}
      {results.length > 0 ? (
        <div className="mb-4">
          <button type="button" className={quietButton} onClick={() => void actions.clearAnalyses()}>
            Yeni bağlantı
          </button>
        </div>
      ) : null}
      {results.length > 0 && wide ? (
        <section>
          <div className="sticky top-0 z-10 -mx-4 mb-3 flex flex-wrap items-center justify-between gap-3 bg-[rgb(var(--color-bg))]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div>
              <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">{results.length} içerik</h2>
              <p className="text-sm text-[rgb(var(--color-text))]/75">{session.selectedAnalysisIds.length} seçili</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={quietButton} onClick={() => actions.selectAll()}>
                Tümünü Seç
              </button>
              {downloadAction}
            </div>
          </div>
          <div className="space-y-2">
            {results.map((item) => (
              <AnalysisCard
                key={item.id}
                density="compact"
                item={item}
                selected={session.selectedAnalysisIds.includes(item.id)}
                assets={session.assetSelection[item.id] ?? []}
                onToggleCard={() => actions.toggleAnalysis(item.id)}
                onToggleAsset={(key) => actions.toggleAsset(item.id, key)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {results.length === 1 ? (
        <AnalysisCard
          item={results[0]}
          selected={session.selectedAnalysisIds.includes(results[0].id)}
          assets={session.assetSelection[results[0].id] ?? []}
          onToggleCard={() => actions.toggleAnalysis(results[0].id)}
          onToggleAsset={(key) => actions.toggleAsset(results[0].id, key)}
          action={results[0].status === 'READY' ? downloadAction : undefined}
        />
      ) : null}
      {mode === 'compose' && results.length === 0 && !pending ? (
        <>
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">Aktif indirmeler</h2>
              <Link href={links.href('/admin/media-studio/jobs')} className="text-sm font-medium text-[rgb(var(--color-text))]">
                Tümü
              </Link>
            </div>
            {active.length > 0 ? (
              <div className="space-y-3">
                {active.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onCancel={() => void actions.cancel(job.id)}
                    onRetry={() => void actions.retry(job.id)}
                    onDelete={() => void actions.deleteJob(job.id)}
                    onDownload={() => actions.openFile(job)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-[rgb(var(--color-surface))] px-4 py-6 text-sm text-[rgb(var(--color-text))]/80">Aktif indirme yok.</p>
            )}
          </section>
          {recent.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-base font-semibold text-[rgb(var(--color-text))]">Son tamamlananlar</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {recent.map((job) => (
                  <article key={job.id} className="min-w-0">
                    <MediaThumb hue={job.thumbHue} className="aspect-video w-full rounded-xl" label="" />
                    <h3 className="mt-2 truncate text-sm font-semibold text-[rgb(var(--color-text))]">{job.title}</h3>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-[rgb(var(--admin-success))]">
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {job.resultLabel ?? 'Tamamlandı'}
                    </p>
                    {job.workspaceId ? (
                      <Link href={links.workspace(job.workspaceId)} className={`${primaryButton} mt-3 min-h-9 w-full px-3`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Düzenle
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
