'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { getDistrictsForProvince } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { JOB_CATEGORIES, type JobCategoryId } from '@/lib/cityJobFilters'
import { cn } from '@/lib/utils'
import {
  JOB_CLASSIFIED_EMPLOYER_TYPES,
  JOB_CLASSIFIED_WORK_TYPES,
  JOB_SEEKER_AGE_RANGES,
  JOB_SEEKER_EXPERIENCE,
  type JobClassifiedType,
  type JobClassifiedWorkType,
  type JobClassifiedEmployerType,
  type JobSeekerExperience,
} from '@/types/jobClassified'

const fieldClass = cn(
  'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]',
  'px-3 py-2.5 text-sm text-[rgb(var(--color-text))]',
  'placeholder:text-[rgb(var(--color-muted))]',
  'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
)

const labelClass = 'mb-1.5 block text-sm font-semibold text-[rgb(var(--color-text))]'

interface CityJobClassifiedFormProps {
  type: JobClassifiedType
  citySlug: string
  cityName: string
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-text))]">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]">{description}</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function CityJobClassifiedForm({ type, citySlug, cityName }: CityJobClassifiedFormProps) {
  const districts = useMemo(() => getDistrictsForProvince(citySlug), [citySlug])
  const isEmployer = type === 'employer'

  const [companyName, setCompanyName] = useState('')
  const [employerType, setEmployerType] = useState<JobClassifiedEmployerType>('Özel')
  const [contactName, setContactName] = useState('')
  const [fullName, setFullName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<JobCategoryId>('other')
  const [workType, setWorkType] = useState<JobClassifiedWorkType>('Tam Zamanlı')
  const [openPositions, setOpenPositions] = useState('')
  const [districtSlug, setDistrictSlug] = useState(
    () => districts.find((d) => d.slug === 'merkez')?.slug ?? districts[0]?.slug ?? ''
  )
  const [locationNote, setLocationNote] = useState('')
  const [deadlineAt, setDeadlineAt] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [salaryText, setSalaryText] = useState('')
  const [hideSalary, setHideSalary] = useState(false)
  const [applyEmail, setApplyEmail] = useState('')
  const [applyPhone, setApplyPhone] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [canRelocate, setCanRelocate] = useState(false)
  const [experience, setExperience] = useState<JobSeekerExperience | ''>('')
  const [skills, setSkills] = useState('')
  const [education, setEducation] = useState('')
  const [cvUrl, setCvUrl] = useState('')
  const [kvkkAccepted, setKvkkAccepted] = useState(false)
  const [websiteHp, setWebsiteHp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const pageTitle = isEmployer ? 'Eleman arıyorum' : 'İş arıyorum'
  const pageSubtitle = isEmployer
    ? `${cityName} için işveren ilanı — incelemeye alınır, onaydan sonra yayınlanır.`
    : `${cityName} için iş arayan ilanı — incelemeye alınır, onaydan sonra yayınlanır.`

  const previewTitle = title.trim() || (isEmployer ? 'Pozisyon başlığı' : 'Aranan pozisyon')
  const previewPlace =
    districtSlug === 'merkez'
      ? 'İl Merkezi'
      : districts.find((d) => d.slug === districtSlug)?.name ?? districtSlug

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = isEmployer
      ? {
          type: 'employer' as const,
          citySlug,
          companyName,
          employerType,
          contactName,
          contactEmail,
          contactPhone,
          website: website || undefined,
          title,
          category,
          workType,
          openPositions: openPositions ? Number(openPositions) : undefined,
          districtSlug,
          locationNote: locationNote || undefined,
          deadlineAt: deadlineAt || undefined,
          description,
          requirements: requirements || undefined,
          salaryText: hideSalary ? undefined : salaryText || undefined,
          hideSalary,
          applyEmail: applyEmail || contactEmail,
          applyPhone: applyPhone || contactPhone,
          kvkkAccepted,
          website_hp: websiteHp,
        }
      : {
          type: 'seeker' as const,
          citySlug,
          fullName,
          contactEmail,
          contactPhone,
          ageRange: ageRange || undefined,
          districtSlug,
          canRelocate,
          title,
          category,
          workType,
          experience: experience || undefined,
          description,
          skills: skills || undefined,
          education: education || undefined,
          salaryText: hideSalary ? undefined : salaryText || undefined,
          hideSalary,
          cvUrl: cvUrl || undefined,
          kvkkAccepted,
          website_hp: websiteHp,
        }

    try {
      const res = await fetch('/api/jobs/classified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setError(data.error ?? 'İlan gönderilemedi.')
        return
      }
      setSent(true)
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl pb-10 pt-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h1 className="mt-3 text-xl font-black text-[rgb(var(--color-text))]">
            İlanınız incelemeye alındı
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--color-text-secondary))]">
            Editör onayından sonra {cityName} iş ilanları sayfasında yayınlanır. NaHaber başvuru
            almaz; iletişim bilgileriniz onay sonrası ilanda görünür.
          </p>
          <Link
            href={ROUTES.CITY_JOBS}
            className="mt-6 inline-flex rounded-lg bg-[rgb(var(--color-brand))] px-5 py-2.5 text-sm font-bold text-white"
          >
            İş ilanlarına dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-10 pt-3">
      <Link
        href={ROUTES.CITY_JOBS}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-brand))]"
      >
        <ArrowLeft className="h-4 w-4" />
        İş ilanları
      </Link>

      <header className="mt-4 mb-5">
        <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))] md:text-2xl">
          {pageTitle}
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">{pageSubtitle}</p>
        <p className="mt-3 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-xs text-[rgb(var(--color-muted))]">
          NaHaber başvuru almaz. Onaylanan ilanlarda e-posta ve telefon bilgileriniz kamuya açık
          görünür. Yanlış veya yanıltıcı ilanlar reddedilir.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* honeypot */}
        <input
          type="text"
          name="website_hp"
          value={websiteHp}
          onChange={(e) => setWebsiteHp(e.target.value)}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
        />

        {isEmployer ? (
          <Section title="İşveren" description="Şirket ve yetkili iletişim bilgileri">
            <label className="block sm:col-span-2">
              <span className={labelClass}>
                Şirket / işveren adı <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                className={fieldClass}
                required
                minLength={2}
                maxLength={160}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                İşveren türü <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <select
                className={fieldClass}
                value={employerType}
                onChange={(e) => setEmployerType(e.target.value as JobClassifiedEmployerType)}
              >
                {JOB_CLASSIFIED_EMPLOYER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>
                Yetkili ad soyad <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                className={fieldClass}
                required
                minLength={2}
                maxLength={120}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                E-posta <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                type="email"
                className={fieldClass}
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                Telefon <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                type="tel"
                className={fieldClass}
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                autoComplete="tel"
                placeholder="05xx xxx xx xx"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Web sitesi (opsiyonel)</span>
              <input
                type="url"
                className={fieldClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
              />
            </label>
          </Section>
        ) : (
          <Section title="Kişi" description="İletişim bilgileriniz onay sonrası ilanda görünür">
            <label className="block sm:col-span-2">
              <span className={labelClass}>
                Ad soyad <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                className={fieldClass}
                required
                minLength={2}
                maxLength={120}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                E-posta <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                type="email"
                className={fieldClass}
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                Telefon <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <input
                type="tel"
                className={fieldClass}
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                autoComplete="tel"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Yaş aralığı (opsiyonel)</span>
              <select
                className={fieldClass}
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
              >
                <option value="">Belirtmek istemiyorum</option>
                {JOB_SEEKER_AGE_RANGES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>
                İlçe <span className="text-[rgb(var(--color-brand))]">*</span>
              </span>
              <select
                className={fieldClass}
                required
                value={districtSlug}
                onChange={(e) => setDistrictSlug(e.target.value)}
              >
                {districts.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.slug === 'merkez' ? 'İl Merkezi' : d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={canRelocate}
                onChange={(e) => setCanRelocate(e.target.checked)}
                className="h-4 w-4 rounded border-[rgb(var(--color-border))]"
              />
              <span className="text-sm text-[rgb(var(--color-text))]">
                Şehir dışı / diğer ilçelerde çalışabilirim
              </span>
            </label>
          </Section>
        )}

        <Section
          title={isEmployer ? 'Pozisyon' : 'Profil'}
          description={
            isEmployer ? 'İlan detayları ve başvuru bilgileri' : 'Aradığınız iş ve deneyiminiz'
          }
        >
          <label className="block sm:col-span-2">
            <span className={labelClass}>
              {isEmployer ? 'İlan başlığı' : 'Aranan pozisyon / başlık'}{' '}
              <span className="text-[rgb(var(--color-brand))]">*</span>
            </span>
            <input
              className={fieldClass}
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isEmployer ? 'Örn. Satış Elemanı' : 'Örn. Garson, Forklift operatörü'}
            />
          </label>
          <label className="block">
            <span className={labelClass}>
              Kategori <span className="text-[rgb(var(--color-brand))]">*</span>
            </span>
            <select
              className={fieldClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as JobCategoryId)}
            >
              {JOB_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>
              Çalışma şekli <span className="text-[rgb(var(--color-brand))]">*</span>
            </span>
            <select
              className={fieldClass}
              value={workType}
              onChange={(e) => setWorkType(e.target.value as JobClassifiedWorkType)}
            >
              {JOB_CLASSIFIED_WORK_TYPES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>

          {isEmployer && (
            <>
              <label className="block">
                <span className={labelClass}>Açık pozisyon sayısı</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className={fieldClass}
                  value={openPositions}
                  onChange={(e) => setOpenPositions(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>
                  İlçe <span className="text-[rgb(var(--color-brand))]">*</span>
                </span>
                <select
                  className={fieldClass}
                  required
                  value={districtSlug}
                  onChange={(e) => setDistrictSlug(e.target.value)}
                >
                  {districts.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.slug === 'merkez' ? 'İl Merkezi' : d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Adres / konum notu (opsiyonel)</span>
                <input
                  className={fieldClass}
                  maxLength={300}
                  value={locationNote}
                  onChange={(e) => setLocationNote(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Son başvuru tarihi</span>
                <input
                  type="date"
                  className={fieldClass}
                  value={deadlineAt}
                  onChange={(e) => setDeadlineAt(e.target.value)}
                />
              </label>
            </>
          )}

          {!isEmployer && (
            <label className="block">
              <span className={labelClass}>Deneyim</span>
              <select
                className={fieldClass}
                value={experience}
                onChange={(e) => setExperience(e.target.value as JobSeekerExperience | '')}
              >
                <option value="">Seçin</option>
                {JOB_SEEKER_EXPERIENCE.map((x) => (
                  <option key={x} value={x}>
                    {x} yıl
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block sm:col-span-2">
            <span className={labelClass}>
              {isEmployer ? 'İş tanımı' : 'Kısa özgeçmiş / kendinizi anlatın'}{' '}
              <span className="text-[rgb(var(--color-brand))]">*</span>
            </span>
            <textarea
              className={cn(fieldClass, 'min-h-[140px] resize-y')}
              required
              minLength={80}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-[rgb(var(--color-muted))]">
              En az 80 karakter ({description.trim().length}/80)
            </span>
          </label>

          {isEmployer ? (
            <label className="block sm:col-span-2">
              <span className={labelClass}>Aranan nitelikler (opsiyonel)</span>
              <textarea
                className={cn(fieldClass, 'min-h-[90px] resize-y')}
                maxLength={3000}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Her satıra bir nitelik"
              />
            </label>
          ) : (
            <>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Yetenekler / sertifikalar (opsiyonel)</span>
                <textarea
                  className={cn(fieldClass, 'min-h-[80px] resize-y')}
                  maxLength={2000}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Eğitim durumu (opsiyonel)</span>
                <input
                  className={fieldClass}
                  maxLength={200}
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>CV / LinkedIn linki (opsiyonel)</span>
                <input
                  type="url"
                  className={fieldClass}
                  value={cvUrl}
                  onChange={(e) => setCvUrl(e.target.value)}
                  placeholder="https://"
                />
              </label>
            </>
          )}

          <label className="block">
            <span className={labelClass}>
              {isEmployer ? 'Maaş aralığı' : 'Maaş beklentisi'} (opsiyonel)
            </span>
            <input
              className={fieldClass}
              disabled={hideSalary}
              maxLength={120}
              value={salaryText}
              onChange={(e) => setSalaryText(e.target.value)}
              placeholder="Örn. 25.000 – 30.000 TL"
            />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={hideSalary}
              onChange={(e) => setHideSalary(e.target.checked)}
              className="h-4 w-4 rounded border-[rgb(var(--color-border))]"
            />
            <span className="text-sm text-[rgb(var(--color-text))]">Belirtilmeyecek</span>
          </label>

          {isEmployer && (
            <>
              <label className="block">
                <span className={labelClass}>Başvuru e-postası</span>
                <input
                  type="email"
                  className={fieldClass}
                  value={applyEmail}
                  onChange={(e) => setApplyEmail(e.target.value)}
                  placeholder="Boşsa yukarıdaki e-posta kullanılır"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Başvuru telefonu</span>
                <input
                  type="tel"
                  className={fieldClass}
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  placeholder="Boşsa yukarıdaki telefon kullanılır"
                />
              </label>
            </>
          )}
        </Section>

        {/* Preview */}
        <section className="rounded-xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-sm font-bold text-[rgb(var(--color-brand))]"
          >
            {showPreview ? 'Önizlemeyi gizle' : 'İlan önizlemesi'}
          </button>
          {showPreview && (
            <article className="mt-3 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] p-4">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <span className="rounded bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--color-brand))]">
                  {isEmployer ? 'Eleman arıyorum' : 'İş arıyorum'}
                </span>
                <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                  {JOB_CATEGORIES.find((c) => c.id === category)?.label}
                </span>
              </div>
              <h3 className="font-bold text-[rgb(var(--color-text))]">{previewTitle}</h3>
              <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
                {isEmployer ? companyName || 'Şirket' : fullName || 'Ad soyad'} · {previewPlace} ·{' '}
                {workType}
              </p>
              <p className="mt-2 line-clamp-3 text-xs text-[rgb(var(--color-muted))]">
                {description || 'Açıklama burada görünecek…'}
              </p>
            </article>
          )}
        </section>

        <label className="flex items-start gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <input
            type="checkbox"
            required
            checked={kvkkAccepted}
            onChange={(e) => setKvkkAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--color-border))]"
          />
          <span className="text-sm text-[rgb(var(--color-text-secondary))]">
            Kişisel verilerimin ve iletişim bilgilerimin ilan yayını amacıyla işlenmesini ve onay
            sonrası kamuya açık görünmesini kabul ediyorum. Yanlış beyan vermediğimi onaylıyorum. *
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !kvkkAccepted}
          className={cn(
            'inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white',
            'bg-[rgb(var(--color-brand))] transition-opacity hover:opacity-90',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gönderiliyor…
            </>
          ) : (
            'İncelemeye gönder'
          )}
        </button>
      </form>
    </div>
  )
}
