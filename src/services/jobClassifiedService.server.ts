import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { JobClassified, JobClassifiedStatus, JobClassifiedType } from '@/types/jobClassified'
import type { JobCategoryId } from '@/lib/cityJobFilters'
import type { JobClassifiedEmployerType, JobClassifiedWorkType, JobSeekerExperience } from '@/types/jobClassified'

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  return null
}

function tsToIso(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString()
    } catch {
      return null
    }
  }
  return null
}

export function mapJobClassifiedDoc(
  id: string,
  data: Record<string, unknown>
): JobClassified | null {
  const type = data.type as JobClassifiedType | undefined
  const status = data.status as JobClassifiedStatus | undefined
  const citySlug = asString(data.citySlug)
  const title = asString(data.title)
  if (!type || !status || !citySlug || !title) return null

  return {
    id,
    type,
    status,
    citySlug,
    cityName: asString(data.cityName) ?? citySlug,
    title,
    category: (asString(data.category) as JobCategoryId) || 'other',
    workType: (asString(data.workType) as JobClassifiedWorkType) || 'Tam Zamanlı',
    districtSlug: asString(data.districtSlug) ?? 'merkez',
    districtLabel: asString(data.districtLabel) ?? 'İl Merkezi',
    locationNote: asString(data.locationNote),
    description: asString(data.description) ?? '',
    contactEmail: asString(data.contactEmail) ?? '',
    contactPhone: asString(data.contactPhone) ?? '',
    companyName: asString(data.companyName),
    employerType: asString(data.employerType) as JobClassifiedEmployerType | null,
    contactName: asString(data.contactName),
    website: asString(data.website),
    openPositions: asNumber(data.openPositions),
    deadlineAt: asString(data.deadlineAt),
    requirements: asString(data.requirements),
    salaryText: asString(data.salaryText),
    hideSalary: asBool(data.hideSalary) === true,
    fullName: asString(data.fullName),
    ageRange: asString(data.ageRange),
    canRelocate: asBool(data.canRelocate),
    experience: asString(data.experience) as JobSeekerExperience | null,
    skills: asString(data.skills),
    education: asString(data.education),
    cvUrl: asString(data.cvUrl),
    createdAt: tsToIso(data.createdAt) ?? new Date().toISOString(),
    reviewedAt: tsToIso(data.reviewedAt),
    reviewedBy: asString(data.reviewedBy),
  }
}

const APPROVED_LIMIT = 80

export async function getApprovedJobClassifiedsServer(
  citySlug: string,
  type?: JobClassifiedType
): Promise<JobClassified[]> {
  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(Collections.JOB_CLASSIFIEDS)
      .where('citySlug', '==', citySlug)
      .where('status', '==', 'approved')
      .orderBy('createdAt', 'desc')
      .limit(APPROVED_LIMIT)
      .get()
      .catch(async () => {
        return db
          .collection(Collections.JOB_CLASSIFIEDS)
          .where('citySlug', '==', citySlug)
          .where('status', '==', 'approved')
          .limit(APPROVED_LIMIT)
          .get()
      })

    const items: JobClassified[] = []
    for (const doc of snap.docs) {
      const mapped = mapJobClassifiedDoc(doc.id, doc.data() as Record<string, unknown>)
      if (!mapped) continue
      if (type && mapped.type !== type) continue
      items.push(mapped)
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items
  } catch {
    return []
  }
}
