'use client'

import { filterJobs } from '@/media-studio/session'
import { useStudio } from '@/media-studio/useStudio'
import { useStudioActions } from './studioActions'
import { cardClass, ghostButton, quietButton } from './styles'
import { EmptyState } from './EmptyState'
import { MediaThumb } from './MediaThumb'
import { TechnicalErrorDetails } from './TechnicalErrorDetails'
import Link from 'next/link'
import { mediaStudioWorkspacePath } from '@/media-studio/routes'

export function FailedScreen() {
  const session = useStudio()
  const actions = useStudioActions()
  const jobs = filterJobs(session.jobs, 'FAILED')

  if (jobs.length === 0) {
    return (
      <EmptyState title="Başarısız işlem yok." body="Kuyruktaki işler sorunsuz görünüyor." actionHref="/admin/media-studio/jobs" actionLabel="İndirmelere git" />
    )
  }

  return (
    <div className="space-y-3 pb-8">
      {jobs.map((job) => (
        <article key={job.id} className={`${cardClass} grid gap-4 p-4 sm:grid-cols-[112px_minmax(0,1fr)]`}>
          <MediaThumb hue={job.thumbHue} src={job.thumbUrl} className="aspect-video rounded-xl" label="" />
          <div>
            <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">{job.title}</h2>
            <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
              {job.source} · {job.createdLabel}
            </p>
            <p className="mt-3 text-sm font-medium text-[rgb(var(--admin-danger))]">
              {job.errorTitle ?? 'İşlem tamamlanamadı.'}
            </p>
            {job.errorDetail ? <TechnicalErrorDetails detail={job.errorDetail} /> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={quietButton} onClick={() => void actions.retry(job.id)}>
                Tekrar Dene
              </button>
              {job.workspaceId ? (
                <Link prefetch={false} href={mediaStudioWorkspacePath(job.workspaceId)} className={quietButton}>
                  Workspace&apos;i Aç
                </Link>
              ) : null}
              <button type="button" className={ghostButton} onClick={() => void actions.deleteJob(job.id)}>
                Sil
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
