import type { JobListing } from '@/types/jobListing'

/**
 * CITY-SERVICES-1 — İŞKUR publishes one row per vacancy, so the same employer often has
 * «Şoför (Yolcu Taşıma)» five times with different ids. Show one card with «5 kadro».
 */
export type GroupedJob = JobListing & { mergedCount: number; mergedIds: string[] }

export function jobGroupKey(job: Pick<JobListing, 'title' | 'employer' | 'district' | 'locationLabel'>): string {
  const norm = (s: string | null | undefined) =>
    (s ?? '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[^a-z0-9çğıöşü]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return [norm(job.title), norm(job.employer), norm(job.district || job.locationLabel)].join('|')
}

export function groupDuplicateJobs(jobs: JobListing[]): GroupedJob[] {
  const byKey = new Map<string, GroupedJob>()
  const out: GroupedJob[] = []
  for (const job of jobs) {
    const key = jobGroupKey(job)
    const hit = byKey.get(key)
    if (!hit) {
      const g: GroupedJob = { ...job, mergedCount: 1, mergedIds: [job.id] }
      byKey.set(key, g)
      out.push(g)
      continue
    }
    hit.mergedCount += 1
    hit.mergedIds.push(job.id)
    const a = hit.openPositions ?? 1
    const b = job.openPositions ?? 1
    hit.openPositions = a + b
    if (job.deadlineAt && (!hit.deadlineAt || job.deadlineAt > hit.deadlineAt)) hit.deadlineAt = job.deadlineAt
  }
  return out
}

/** Total vacancies («kadro») a card stands for. */
export function jobVacancies(job: Pick<GroupedJob, 'openPositions' | 'mergedCount'>): number {
  return Math.max(job.mergedCount ?? 1, job.openPositions ?? 0, 1)
}

/** Featured strip: most vacancies first, then newest; one card per employer. */
export function pickFeaturedJobs(jobs: GroupedJob[], limit = 8): GroupedJob[] {
  const seen = new Set<string>()
  return [...jobs]
    .sort((a, b) => {
      const v = jobVacancies(b) - jobVacancies(a)
      if (v) return v
      return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
    })
    .filter((j) => {
      const emp = (j.employer ?? j.id).toLocaleLowerCase('tr-TR')
      if (seen.has(emp)) return false
      seen.add(emp)
      return true
    })
    .slice(0, limit)
}

/** Listings published in the last `days` days. */
export function countRecentJobs(jobs: Pick<JobListing, 'publishedAt'>[], now: Date = new Date(), days = 7): number {
  const t = now.getTime() - days * 24 * 60 * 60 * 1000
  return jobs.filter((j) => j.publishedAt && Date.parse(j.publishedAt) >= t).length
}
