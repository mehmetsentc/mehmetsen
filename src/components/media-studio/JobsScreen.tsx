'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { JobFilter } from '@/media-studio/session'
import { filterJobs } from '@/media-studio/session'
import { useStudioActions } from './studioActions'
import { useStudio } from '@/media-studio/useStudio'
import { batchOverview, statusLabel } from '@/media-studio/format'
import { focusRing } from './styles'
import { DownloadMeter } from './DownloadMeter'
import { EmptyState } from './EmptyState'
import { JobRow } from './JobRow'
import { useStudioReveal } from './useStudioReveal'
import { StudioSkeleton } from './StudioSkeleton'
import type { StudioJob } from '@/media-studio/types'

const FILTERS: JobFilter[] = ['ALL', 'DOWNLOADING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']
export function JobsScreen({ immediate = false }: { immediate?: boolean }) {
  const session = useStudio()
  const revealed = useStudioReveal()
  const ready = immediate || revealed
  const [filter, setFilter] = useState<JobFilter>('ALL')
  const [queueOpen, setQueueOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [troubleOpen, setTroubleOpen] = useState(false)
  const jobs = useMemo(() => filterJobs(session.jobs, filter), [session.jobs, filter])
  const overview = batchOverview(session.jobs)
  const grouped = filter === 'ALL' && overview.total > 1
  const activeJobs = session.jobs.filter((job) => job.status === 'DOWNLOADING' || job.status === 'PROCESSING')
  const queued = session.jobs.filter((job) => job.status === 'QUEUED')
  const done = session.jobs.filter((job) => job.status === 'COMPLETED' || job.status === 'PARTIAL')
  const trouble = session.jobs.filter((job) => job.status === 'FAILED' || job.status === 'CANCELLED')

  return (
    <div className="space-y-6 pb-8">
      {overview.total > 1 ? (
        <DownloadMeter
          label="Genel ilerleme"
          percent={overview.percent}
          amount={`${overview.completed} / ${overview.total} tamamlandı`}
          stats={[
            { label: 'Aktif', value: overview.active },
            { label: 'Bekleyen', value: overview.queued },
            { label: 'Hata', value: overview.failed },
          ]}
        />
      ) : null}
      {grouped || session.jobs.length === 1 ? null : (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--color-text))]">
          Filtre
          <select
            className={`h-9 rounded-lg bg-[rgb(var(--color-surface))] px-2 text-sm ${focusRing}`}
            value={filter}
            onChange={(event) => setFilter(event.target.value as JobFilter)}
          >
            {FILTERS.map((item) => (
              <option key={item} value={item}>
                {item === 'ALL' ? 'Tümü' : statusLabel(item)}
              </option>
            ))}
          </select>
        </label>
      )}
      {!ready ? <StudioSkeleton rows={3} /> : null}
      {ready && !grouped && jobs.length === 0 ? (
        <EmptyState title="Bu durumda iş yok." body="Filtreyi değiştirin veya yeni bir içe aktarma başlatın." actionHref="/admin/media-studio" actionLabel="Yeni indirme" />
      ) : null}
      {ready && grouped ? (
        <div className="space-y-6">
          <JobGroup title="Şu anda indiriliyor" count={activeJobs.length} open jobs={activeJobs} />
          <JobGroup title="Kuyruk" count={queued.length} open={queueOpen} onToggle={() => setQueueOpen((value) => !value)} jobs={queued} />
          <JobGroup title="Tamamlananlar" count={done.length} open={doneOpen} onToggle={() => setDoneOpen((value) => !value)} jobs={done} />
          {trouble.length > 0 ? (
            <JobGroup title="Sorunlu" count={trouble.length} open={troubleOpen} onToggle={() => setTroubleOpen((value) => !value)} jobs={trouble} />
          ) : null}
        </div>
      ) : null}
      {ready && !grouped ? (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobLine key={job.id} job={job} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function JobGroup({
  title,
  count,
  open,
  onToggle,
  jobs,
}: {
  title: string
  count: number
  open: boolean
  onToggle?: () => void
  jobs: StudioJob[]
}) {
  const collapsible = Boolean(onToggle)
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[rgb(var(--color-text))]">
          {title}
          <span className="ml-2 text-sm font-medium text-[rgb(var(--color-muted))]">{count}</span>
        </h2>
        {collapsible ? (
          <button type="button" className={`inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-text))] ${focusRing}`} onClick={onToggle} aria-expanded={open}>
            {open ? 'Gizle' : 'Göster'}
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className={title === 'Şu anda indiriliyor' ? 'space-y-3' : 'divide-y divide-[rgb(var(--color-border))]'}>
          {jobs.map((job) => (
            <JobLine key={job.id} job={job} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function JobLine({ job }: { job: StudioJob }) {
  const actions = useStudioActions()
  return (
    <JobRow
      job={job}
      onCancel={() => void actions.cancel(job.id)}
      onRetry={() => void actions.retry(job.id)}
      onDelete={() => void actions.deleteJob(job.id)}
      onDownload={() => actions.openFile(job)}
    />
  )
}
