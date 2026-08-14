import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  getCityCategoryName,
  getDistrictsForProvince,
  isTurkishProvinceSlug,
} from '@/constants/cities'
import { JOB_CATEGORIES, type JobCategoryId } from '@/lib/cityJobFilters'
import { mapJobClassifiedDoc } from '@/services/jobClassifiedService.server'
import {
  JOB_CLASSIFIED_EMPLOYER_TYPES,
  JOB_CLASSIFIED_WORK_TYPES,
  JOB_SEEKER_AGE_RANGES,
  JOB_SEEKER_EXPERIENCE,
  type JobClassifiedStatus,
} from '@/types/jobClassified'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CATEGORY_IDS = new Set(JOB_CATEGORIES.map((c) => c.id))

function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function districtLabel(citySlug: string, districtSlug: string): string {
  if (districtSlug === 'merkez') return 'İl Merkezi'
  return getDistrictsForProvince(citySlug).find((d) => d.slug === districtSlug)?.name ?? districtSlug
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminRequest(_request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  try {
    const db = getAdminFirestore()
    const snap = await db.collection(Collections.JOB_CLASSIFIEDS).doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'İlan bulunamadı' }, { status: 404 })
    }
    const item = mapJobClassifiedDoc(snap.id, snap.data() as Record<string, unknown>)
    if (!item) {
      return NextResponse.json({ error: 'Geçersiz kayıt' }, { status: 500 })
    }
    return NextResponse.json({ item })
  } catch {
    return NextResponse.json({ error: 'Okunamadı' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.JOB_CLASSIFIEDS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'İlan bulunamadı' }, { status: 404 })
    }

    // Status-only actions
    if (action === 'approve' || action === 'reject' || action === 'unpublish') {
      const nextStatus: JobClassifiedStatus =
        action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'rejected'
      await ref.update({
        status: nextStatus,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: admin.uid,
      })
      return NextResponse.json({ ok: true, status: nextStatus })
    }

    // Full field update (edit)
    if (action !== 'update' && action !== '') {
      return NextResponse.json(
        { error: 'action: approve | reject | unpublish | update' },
        { status: 400 }
      )
    }

    const existing = snap.data() as Record<string, unknown>
    const type = existing.type === 'seeker' ? 'seeker' : 'employer'

    const citySlug = str(body.citySlug ?? existing.citySlug, 64)
    if (!citySlug || !isTurkishProvinceSlug(citySlug)) {
      return NextResponse.json({ error: 'Geçersiz şehir' }, { status: 400 })
    }

    const title = str(body.title ?? existing.title, 160)
    if (title.length < 3) {
      return NextResponse.json({ error: 'Başlık en az 3 karakter' }, { status: 400 })
    }

    const category = str(body.category ?? existing.category, 40) as JobCategoryId
    if (!CATEGORY_IDS.has(category)) {
      return NextResponse.json({ error: 'Geçersiz kategori' }, { status: 400 })
    }

    const workType = str(body.workType ?? existing.workType, 40)
    if (!JOB_CLASSIFIED_WORK_TYPES.includes(workType as (typeof JOB_CLASSIFIED_WORK_TYPES)[number])) {
      return NextResponse.json({ error: 'Geçersiz çalışma şekli' }, { status: 400 })
    }

    const districtSlug = str(body.districtSlug ?? existing.districtSlug, 64)
    const districts = getDistrictsForProvince(citySlug)
    if (!districts.some((d) => d.slug === districtSlug)) {
      return NextResponse.json({ error: 'Geçersiz ilçe' }, { status: 400 })
    }

    const description = str(body.description ?? existing.description, 5000)
    if (description.length < 40) {
      return NextResponse.json({ error: 'Açıklama en az 40 karakter' }, { status: 400 })
    }

    const contactEmail = str(body.contactEmail ?? existing.contactEmail, 200).toLowerCase()
    const contactPhone = str(body.contactPhone ?? existing.contactPhone, 30)
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return NextResponse.json({ error: 'Geçersiz e-posta' }, { status: 400 })
    }

    const statusRaw = str(body.status ?? existing.status, 20) as JobClassifiedStatus
    const status: JobClassifiedStatus = ['pending', 'approved', 'rejected'].includes(statusRaw)
      ? statusRaw
      : 'pending'

    const hideSalary = body.hideSalary === true
    const patch: Record<string, unknown> = {
      citySlug,
      cityName: getCityCategoryName(citySlug),
      title,
      category,
      workType,
      districtSlug,
      districtLabel: districtLabel(citySlug, districtSlug),
      locationNote: str(body.locationNote ?? existing.locationNote, 300) || null,
      description,
      contactEmail,
      contactPhone,
      salaryText: hideSalary ? null : str(body.salaryText ?? existing.salaryText, 120) || null,
      hideSalary,
      status,
      updatedAt: FieldValue.serverTimestamp(),
      reviewedBy: admin.uid,
      reviewedAt: FieldValue.serverTimestamp(),
    }

    if (type === 'employer') {
      const companyName = str(body.companyName ?? existing.companyName, 160)
      const contactName = str(body.contactName ?? existing.contactName, 120)
      const employerType = str(body.employerType ?? existing.employerType, 40)
      if (companyName.length < 2) {
        return NextResponse.json({ error: 'Şirket adı gerekli' }, { status: 400 })
      }
      if (
        employerType &&
        !JOB_CLASSIFIED_EMPLOYER_TYPES.includes(
          employerType as (typeof JOB_CLASSIFIED_EMPLOYER_TYPES)[number]
        )
      ) {
        return NextResponse.json({ error: 'İşveren türü geçersiz' }, { status: 400 })
      }
      let openPositions: number | null = null
      const op = body.openPositions ?? existing.openPositions
      if (op != null && op !== '') {
        const n = Number(op)
        if (Number.isFinite(n) && n >= 1 && n <= 500) openPositions = Math.floor(n)
      }
      patch.companyName = companyName
      patch.contactName = contactName
      patch.employerType = employerType || null
      patch.website = str(body.website ?? existing.website, 300) || null
      patch.openPositions = openPositions
      patch.deadlineAt = str(body.deadlineAt ?? existing.deadlineAt, 40) || null
      patch.requirements = str(body.requirements ?? existing.requirements, 3000) || null
    } else {
      const fullName = str(body.fullName ?? existing.fullName, 120)
      if (fullName.length < 2) {
        return NextResponse.json({ error: 'Ad soyad gerekli' }, { status: 400 })
      }
      const ageRange = str(body.ageRange ?? existing.ageRange, 20)
      if (
        ageRange &&
        !JOB_SEEKER_AGE_RANGES.includes(ageRange as (typeof JOB_SEEKER_AGE_RANGES)[number])
      ) {
        return NextResponse.json({ error: 'Yaş aralığı geçersiz' }, { status: 400 })
      }
      const experience = str(body.experience ?? existing.experience, 10)
      if (
        experience &&
        !JOB_SEEKER_EXPERIENCE.includes(experience as (typeof JOB_SEEKER_EXPERIENCE)[number])
      ) {
        return NextResponse.json({ error: 'Deneyim geçersiz' }, { status: 400 })
      }
      const cvUrl = str(body.cvUrl ?? existing.cvUrl, 500)
      if (cvUrl && !/^https?:\/\//i.test(cvUrl)) {
        return NextResponse.json({ error: 'CV linki http(s) olmalı' }, { status: 400 })
      }
      patch.fullName = fullName
      patch.contactName = fullName
      patch.ageRange = ageRange || null
      patch.canRelocate = body.canRelocate === true || existing.canRelocate === true
      if (typeof body.canRelocate === 'boolean') patch.canRelocate = body.canRelocate
      patch.experience = experience || null
      patch.skills = str(body.skills ?? existing.skills, 2000) || null
      patch.education = str(body.education ?? existing.education, 200) || null
      patch.cvUrl = cvUrl || null
    }

    await ref.update(patch)
    const updated = await ref.get()
    const item = mapJobClassifiedDoc(updated.id, updated.data() as Record<string, unknown>)
    return NextResponse.json({ ok: true, item })
  } catch {
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.JOB_CLASSIFIEDS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'İlan bulunamadı' }, { status: 404 })
    }
    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Silinemedi' }, { status: 500 })
  }
}
