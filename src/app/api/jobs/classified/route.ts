import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  getCityCategoryName,
  getDistrictsForProvince,
  isTurkishProvinceSlug,
} from '@/constants/cities'
import { JOB_CATEGORIES, type JobCategoryId } from '@/lib/cityJobFilters'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import {
  JOB_CLASSIFIED_EMPLOYER_TYPES,
  JOB_CLASSIFIED_WORK_TYPES,
  JOB_SEEKER_AGE_RANGES,
  JOB_SEEKER_EXPERIENCE,
} from '@/types/jobClassified'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+\s()-]{10,20}$/
const CATEGORY_IDS = new Set(JOB_CATEGORIES.map((c) => c.id))

function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function districtLabel(citySlug: string, districtSlug: string): string {
  if (districtSlug === 'merkez') return 'İl Merkezi'
  const d = getDistrictsForProvince(citySlug).find((x) => x.slug === districtSlug)
  return d?.name ?? districtSlug
}

function validateBase(body: Record<string, unknown>): string | null {
  if (body.website_hp && typeof body.website_hp === 'string' && body.website_hp.trim()) {
    return 'honeypot'
  }
  if (body.kvkkAccepted !== true) return 'KVKK onayı zorunludur.'
  const citySlug = str(body.citySlug, 64)
  if (!citySlug || !isTurkishProvinceSlug(citySlug)) return 'Geçersiz şehir.'
  const category = str(body.category, 40) as JobCategoryId
  if (!CATEGORY_IDS.has(category)) return 'Geçersiz kategori.'
  const workType = str(body.workType, 40)
  if (!JOB_CLASSIFIED_WORK_TYPES.includes(workType as (typeof JOB_CLASSIFIED_WORK_TYPES)[number])) {
    return 'Geçersiz çalışma şekli.'
  }
  const districtSlug = str(body.districtSlug, 64)
  const districts = getDistrictsForProvince(citySlug)
  if (!districts.some((d) => d.slug === districtSlug)) return 'Geçersiz ilçe.'
  const title = str(body.title, 160)
  if (title.length < 3) return 'Başlık en az 3 karakter olmalıdır.'
  const description = str(body.description, 5000)
  if (description.length < 80) return 'Açıklama en az 80 karakter olmalıdır.'
  return null
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRateLimit(`job-classified:${ip}`, 8, 60 * 60_000)) {
    return rateLimitResponse()
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const honeypotOrErr = validateBase(body)
  if (honeypotOrErr === 'honeypot') {
    return NextResponse.json({ ok: true })
  }
  if (honeypotOrErr) {
    return NextResponse.json({ error: honeypotOrErr }, { status: 400 })
  }

  const type = body.type
  if (type !== 'employer' && type !== 'seeker') {
    return NextResponse.json({ error: 'Geçersiz ilan türü.' }, { status: 400 })
  }

  const citySlug = str(body.citySlug, 64)
  const cityName = getCityCategoryName(citySlug)
  const districtSlug = str(body.districtSlug, 64)
  const base = {
    type,
    status: 'pending' as const,
    citySlug,
    cityName,
    title: str(body.title, 160),
    category: str(body.category, 40),
    workType: str(body.workType, 40),
    districtSlug,
    districtLabel: districtLabel(citySlug, districtSlug),
    locationNote: str(body.locationNote, 300) || null,
    description: str(body.description, 5000),
    salaryText: body.hideSalary === true ? null : str(body.salaryText, 120) || null,
    hideSalary: body.hideSalary === true,
    kvkkAccepted: true,
    ip,
    userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? '',
    createdAt: FieldValue.serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
  }

  let doc: Record<string, unknown>

  if (type === 'employer') {
    const companyName = str(body.companyName, 160)
    const contactName = str(body.contactName, 120)
    const contactEmail = str(body.contactEmail, 200).toLowerCase()
    const contactPhone = str(body.contactPhone, 30)
    const employerType = str(body.employerType, 40)
    const applyEmail = str(body.applyEmail, 200).toLowerCase() || contactEmail
    const applyPhone = str(body.applyPhone, 30) || contactPhone

    if (companyName.length < 2) {
      return NextResponse.json({ error: 'Şirket / işveren adı girin.' }, { status: 400 })
    }
    if (
      !JOB_CLASSIFIED_EMPLOYER_TYPES.includes(
        employerType as (typeof JOB_CLASSIFIED_EMPLOYER_TYPES)[number]
      )
    ) {
      return NextResponse.json({ error: 'İşveren türü seçin.' }, { status: 400 })
    }
    if (contactName.length < 2) {
      return NextResponse.json({ error: 'Yetkili ad soyad girin.' }, { status: 400 })
    }
    if (!EMAIL_RE.test(contactEmail)) {
      return NextResponse.json({ error: 'Geçerli e-posta girin.' }, { status: 400 })
    }
    if (!PHONE_RE.test(contactPhone)) {
      return NextResponse.json({ error: 'Geçerli telefon girin.' }, { status: 400 })
    }
    if (!EMAIL_RE.test(applyEmail) && !PHONE_RE.test(applyPhone)) {
      return NextResponse.json(
        { error: 'Başvuru için e-posta veya telefon gerekli.' },
        { status: 400 }
      )
    }

    let openPositions: number | null = null
    if (body.openPositions != null && body.openPositions !== '') {
      const n = Number(body.openPositions)
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        return NextResponse.json({ error: 'Açık pozisyon sayısı geçersiz.' }, { status: 400 })
      }
      openPositions = Math.floor(n)
    }

    const deadlineAt = str(body.deadlineAt, 40) || null
    if (deadlineAt && Number.isNaN(Date.parse(deadlineAt))) {
      return NextResponse.json({ error: 'Son başvuru tarihi geçersiz.' }, { status: 400 })
    }

    doc = {
      ...base,
      companyName,
      employerType,
      contactName,
      contactEmail: applyEmail || contactEmail,
      contactPhone: applyPhone || contactPhone,
      website: str(body.website, 300) || null,
      openPositions,
      deadlineAt,
      requirements: str(body.requirements, 3000) || null,
      fullName: null,
      ageRange: null,
      canRelocate: null,
      experience: null,
      skills: null,
      education: null,
      cvUrl: null,
    }
  } else {
    const fullName = str(body.fullName, 120)
    const contactEmail = str(body.contactEmail, 200).toLowerCase()
    const contactPhone = str(body.contactPhone, 30)
    if (fullName.length < 2) {
      return NextResponse.json({ error: 'Ad soyad girin.' }, { status: 400 })
    }
    if (!EMAIL_RE.test(contactEmail)) {
      return NextResponse.json({ error: 'Geçerli e-posta girin.' }, { status: 400 })
    }
    if (!PHONE_RE.test(contactPhone)) {
      return NextResponse.json({ error: 'Geçerli telefon girin.' }, { status: 400 })
    }
    const ageRange = str(body.ageRange, 20)
    if (
      ageRange &&
      !JOB_SEEKER_AGE_RANGES.includes(ageRange as (typeof JOB_SEEKER_AGE_RANGES)[number])
    ) {
      return NextResponse.json({ error: 'Yaş aralığı geçersiz.' }, { status: 400 })
    }
    const experience = str(body.experience, 10)
    if (
      experience &&
      !JOB_SEEKER_EXPERIENCE.includes(experience as (typeof JOB_SEEKER_EXPERIENCE)[number])
    ) {
      return NextResponse.json({ error: 'Deneyim seçimi geçersiz.' }, { status: 400 })
    }
    const cvUrl = str(body.cvUrl, 500)
    if (cvUrl && !/^https?:\/\//i.test(cvUrl)) {
      return NextResponse.json({ error: 'CV linki http(s) ile başlamalı.' }, { status: 400 })
    }

    doc = {
      ...base,
      fullName,
      contactEmail,
      contactPhone,
      ageRange: ageRange || null,
      canRelocate: body.canRelocate === true,
      experience: experience || null,
      skills: str(body.skills, 2000) || null,
      education: str(body.education, 200) || null,
      cvUrl: cvUrl || null,
      companyName: null,
      employerType: null,
      contactName: fullName,
      website: null,
      openPositions: null,
      deadlineAt: null,
      requirements: null,
    }
  }

  try {
    const db = getAdminFirestore()
    const ref = await db.collection(Collections.JOB_CLASSIFIEDS).add(doc)
    return NextResponse.json({ ok: true, id: ref.id })
  } catch {
    return NextResponse.json(
      { error: 'İlan kaydedilemedi. Lütfen daha sonra tekrar deneyin.' },
      { status: 500 }
    )
  }
}
