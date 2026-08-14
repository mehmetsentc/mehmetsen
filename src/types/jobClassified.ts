import type { JobCategoryId } from '@/lib/cityJobFilters'

export type JobClassifiedType = 'employer' | 'seeker'
export type JobClassifiedStatus = 'pending' | 'approved' | 'rejected'

export type JobClassifiedWorkType =
  | 'Tam Zamanlı'
  | 'Kısmi Zamanlı'
  | 'Vardiya'
  | 'Staj'
  | 'Diğer'

export const JOB_CLASSIFIED_WORK_TYPES: JobClassifiedWorkType[] = [
  'Tam Zamanlı',
  'Kısmi Zamanlı',
  'Vardiya',
  'Staj',
  'Diğer',
]

export const JOB_CLASSIFIED_EMPLOYER_TYPES = ['Özel', 'Kamu', 'Şahıs'] as const
export type JobClassifiedEmployerType = (typeof JOB_CLASSIFIED_EMPLOYER_TYPES)[number]

export const JOB_SEEKER_EXPERIENCE = ['0-1', '1-3', '3-5', '5+'] as const
export type JobSeekerExperience = (typeof JOB_SEEKER_EXPERIENCE)[number]

export const JOB_SEEKER_AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55+'] as const

/** Shared public card fields after approval. */
export interface JobClassified {
  id: string
  type: JobClassifiedType
  status: JobClassifiedStatus
  citySlug: string
  cityName: string
  title: string
  category: JobCategoryId
  workType: JobClassifiedWorkType
  districtSlug: string
  districtLabel: string
  locationNote: string | null
  description: string
  contactEmail: string
  contactPhone: string
  /** Employer */
  companyName: string | null
  employerType: JobClassifiedEmployerType | null
  contactName: string | null
  website: string | null
  openPositions: number | null
  deadlineAt: string | null
  requirements: string | null
  salaryText: string | null
  hideSalary: boolean
  /** Seeker */
  fullName: string | null
  ageRange: string | null
  canRelocate: boolean | null
  experience: JobSeekerExperience | null
  skills: string | null
  education: string | null
  cvUrl: string | null
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
}

export interface EmployerClassifiedInput {
  type: 'employer'
  citySlug: string
  companyName: string
  employerType: JobClassifiedEmployerType
  contactName: string
  contactEmail: string
  contactPhone: string
  website?: string
  title: string
  category: JobCategoryId
  workType: JobClassifiedWorkType
  openPositions?: number
  districtSlug: string
  locationNote?: string
  deadlineAt?: string
  description: string
  requirements?: string
  salaryText?: string
  hideSalary?: boolean
  applyEmail?: string
  applyPhone?: string
  kvkkAccepted: boolean
  website_hp?: string
}

export interface SeekerClassifiedInput {
  type: 'seeker'
  citySlug: string
  fullName: string
  contactEmail: string
  contactPhone: string
  ageRange?: string
  districtSlug: string
  canRelocate?: boolean
  title: string
  category: JobCategoryId
  workType: JobClassifiedWorkType
  experience?: JobSeekerExperience
  description: string
  skills?: string
  education?: string
  salaryText?: string
  hideSalary?: boolean
  cvUrl?: string
  kvkkAccepted: boolean
  website_hp?: string
}

export type JobClassifiedInput = EmployerClassifiedInput | SeekerClassifiedInput
