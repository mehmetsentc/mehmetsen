import Link from 'next/link'
import { Building2, MapPin, Users } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { jobCategoryLabel, resolveJobCategory } from '@/lib/cityJobFilters'
import { jobVacancies, type GroupedJob } from '@/lib/cityServices/jobGrouping'
import { JobCategoryIcon } from './JobCategoryIcon'

/** CITY-SERVICES-1 — swipeable «Öne çıkan işler»: most vacancies first, one per employer. */
export function CityFeaturedJobs({
  jobs,
  placeOf,
}: {
  jobs: GroupedJob[]
  placeOf: (job: GroupedJob) => string | null
}) {
  if (jobs.length < 2) return null
  return (
    <section className="mb-5" aria-label="Öne çıkan işler">
      <div className="mb-2 flex items-end justify-between">
        <h2 className="text-base font-black text-[rgb(var(--color-text))]">Öne çıkan işler</h2>
        <span className="text-[11px] font-semibold text-[rgb(var(--color-muted))]">Kaydır →</span>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide md:mx-0 md:px-0">
        {jobs.map((job) => {
          const cat = resolveJobCategory(job)
          const n = jobVacancies(job)
          const place = placeOf(job)
          return (
            <li key={job.id} className="w-[72%] max-w-[270px] shrink-0 snap-start sm:w-[45%] md:w-[32%]">
              <Link
                prefetch={false}
                href={ROUTES.CITY_JOB_DETAIL(job.id)}
                className="flex h-full flex-col rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3.5 shadow-sm transition-colors hover:border-[rgb(var(--color-brand))]/45"
              >
                <div className="flex items-start justify-between gap-2">
                  <JobCategoryIcon category={cat} size={44} />
                  {n > 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-300">
                      <Users className="h-3 w-3" />
                      {n} kadro
                    </span>
                  ) : null}
                </div>
                <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  {jobCategoryLabel(cat)}
                </p>
                <h3 className="mt-0.5 line-clamp-2 text-[15px] font-black leading-snug text-[rgb(var(--color-text))]">
                  {job.title}
                </h3>
                {job.employer ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-[rgb(var(--color-text-secondary))]">
                    <Building2 className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="truncate">{job.employer}</span>
                  </p>
                ) : null}
                {place ? (
                  <p className="mt-auto flex items-center gap-1 pt-2 text-xs text-[rgb(var(--color-muted))]">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {place}
                  </p>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
