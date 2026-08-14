'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  UserRoundSearch,
  X,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { auth } from '@/lib/firebase/auth'
import { getDistrictsForProvince, getAllProvinceOptions } from '@/constants/cities'
import { JOB_CATEGORIES, jobCategoryLabel, type JobCategoryId } from '@/lib/cityJobFilters'
import { cn } from '@/lib/utils'
import {
  JOB_CLASSIFIED_EMPLOYER_TYPES,
  JOB_CLASSIFIED_WORK_TYPES,
  JOB_SEEKER_AGE_RANGES,
  JOB_SEEKER_EXPERIENCE,
  type JobClassified,
  type JobClassifiedEmployerType,
  type JobClassifiedStatus,
  type JobClassifiedType,
  type JobClassifiedWorkType,
  type JobSeekerExperience,
} from '@/types/jobClassified'

type StatusFilter = JobClassifiedStatus | 'all'
type TypeFilter = JobClassifiedType | 'all'

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'pending', label: 'Bekleyenler' },
  { id: 'approved', label: 'Yayında' },
  { id: 'rejected', label: 'Red / yayından kaldırılan' },
  { id: 'all', label: 'Tümü' },
]

const TYPE_TABS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'Hepsi' },
  { id: 'employer', label: 'İşveren (eleman)' },
  { id: 'seeker', label: 'İş arayan' },
]

const fieldClass = cn(
  'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]',
  'px-3 py-2 text-sm text-[rgb(var(--color-text))]',
  'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
)

const labelClass = 'mb-1 block text-xs font-semibold text-[rgb(var(--color-text-secondary))]'

function statusBadge(status: JobClassifiedStatus) {
  if (status === 'approved') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  if (status === 'rejected') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
}

function statusLabel(status: JobClassifiedStatus) {
  if (status === 'approved') return 'Yayında'
  if (status === 'rejected') return 'Reddedildi'
  return 'Bekliyor'
}

function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: JobClassified
  onClose: () => void
  onSaved: () => void
}) {
  const provinces = useMemo(() => getAllProvinceOptions(), [])
  const [draft, setDraft] = useState(item)
  const [saving, setSaving] = useState(false)

  const districts = useMemo(
    () => getDistrictsForProvince(draft.citySlug),
    [draft.citySlug]
  )

  const set = <K extends keyof JobClassified>(key: K, value: JobClassified[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/job-classifieds/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update',
          citySlug: draft.citySlug,
          title: draft.title,
          category: draft.category,
          workType: draft.workType,
          districtSlug: draft.districtSlug,
          locationNote: draft.locationNote,
          description: draft.description,
          contactEmail: draft.contactEmail,
          contactPhone: draft.contactPhone,
          salaryText: draft.salaryText,
          hideSalary: draft.hideSalary,
          status: draft.status,
          companyName: draft.companyName,
          employerType: draft.employerType,
          contactName: draft.contactName,
          website: draft.website,
          openPositions: draft.openPositions,
          deadlineAt: draft.deadlineAt,
          requirements: draft.requirements,
          fullName: draft.fullName,
          ageRange: draft.ageRange,
          canRelocate: draft.canRelocate,
          experience: draft.experience,
          skills: draft.skills,
          education: draft.education,
          cvUrl: draft.cvUrl,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      toast.success('İlan güncellendi')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal
        aria-label="İlan düzenle"
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
          <h2 className="text-base font-bold text-[rgb(var(--color-text))]">İlanı düzenle</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface-raised))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Durum</span>
            <select
              className={fieldClass}
              value={draft.status}
              onChange={(e) => set('status', e.target.value as JobClassifiedStatus)}
            >
              <option value="pending">Bekliyor</option>
              <option value="approved">Yayında</option>
              <option value="rejected">Reddedildi</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Şehir</span>
            <select
              className={fieldClass}
              value={draft.citySlug}
              onChange={(e) => {
                const slug = e.target.value
                const districtsFor = getDistrictsForProvince(slug)
                setDraft((prev) => ({
                  ...prev,
                  citySlug: slug,
                  cityName: provinces.find((p) => p.slug === slug)?.name ?? slug,
                  districtSlug:
                    districtsFor.find((d) => d.slug === prev.districtSlug)?.slug ??
                    districtsFor.find((d) => d.slug === 'merkez')?.slug ??
                    districtsFor[0]?.slug ??
                    '',
                }))
              }}
            >
              {provinces.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className={labelClass}>Başlık</span>
            <input
              className={fieldClass}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Kategori</span>
            <select
              className={fieldClass}
              value={draft.category}
              onChange={(e) => set('category', e.target.value as JobCategoryId)}
            >
              {JOB_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Çalışma şekli</span>
            <select
              className={fieldClass}
              value={draft.workType}
              onChange={(e) => set('workType', e.target.value as JobClassifiedWorkType)}
            >
              {JOB_CLASSIFIED_WORK_TYPES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>İlçe</span>
            <select
              className={fieldClass}
              value={draft.districtSlug}
              onChange={(e) => set('districtSlug', e.target.value)}
            >
              {districts.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.slug === 'merkez' ? 'İl Merkezi' : d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Konum notu</span>
            <input
              className={fieldClass}
              value={draft.locationNote ?? ''}
              onChange={(e) => set('locationNote', e.target.value || null)}
            />
          </label>

          {draft.type === 'employer' ? (
            <>
              <label className="block">
                <span className={labelClass}>Şirket</span>
                <input
                  className={fieldClass}
                  value={draft.companyName ?? ''}
                  onChange={(e) => set('companyName', e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>İşveren türü</span>
                <select
                  className={fieldClass}
                  value={draft.employerType ?? 'Özel'}
                  onChange={(e) =>
                    set('employerType', e.target.value as JobClassifiedEmployerType)
                  }
                >
                  {JOB_CLASSIFIED_EMPLOYER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Yetkili</span>
                <input
                  className={fieldClass}
                  value={draft.contactName ?? ''}
                  onChange={(e) => set('contactName', e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Açık pozisyon</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className={fieldClass}
                  value={draft.openPositions ?? ''}
                  onChange={(e) =>
                    set(
                      'openPositions',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </label>
              <label className="block">
                <span className={labelClass}>Son başvuru</span>
                <input
                  type="date"
                  className={fieldClass}
                  value={draft.deadlineAt?.slice(0, 10) ?? ''}
                  onChange={(e) => set('deadlineAt', e.target.value || null)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Web</span>
                <input
                  className={fieldClass}
                  value={draft.website ?? ''}
                  onChange={(e) => set('website', e.target.value || null)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Aranan nitelikler</span>
                <textarea
                  className={cn(fieldClass, 'min-h-[80px]')}
                  value={draft.requirements ?? ''}
                  onChange={(e) => set('requirements', e.target.value || null)}
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className={labelClass}>Ad soyad</span>
                <input
                  className={fieldClass}
                  value={draft.fullName ?? ''}
                  onChange={(e) => set('fullName', e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Yaş aralığı</span>
                <select
                  className={fieldClass}
                  value={draft.ageRange ?? ''}
                  onChange={(e) => set('ageRange', e.target.value || null)}
                >
                  <option value="">—</option>
                  {JOB_SEEKER_AGE_RANGES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Deneyim</span>
                <select
                  className={fieldClass}
                  value={draft.experience ?? ''}
                  onChange={(e) =>
                    set('experience', (e.target.value || null) as JobSeekerExperience | null)
                  }
                >
                  <option value="">—</option>
                  {JOB_SEEKER_EXPERIENCE.map((x) => (
                    <option key={x} value={x}>
                      {x} yıl
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={draft.canRelocate === true}
                  onChange={(e) => set('canRelocate', e.target.checked)}
                />
                <span className="text-sm text-[rgb(var(--color-text))]">Şehir dışı OK</span>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Yetenekler</span>
                <textarea
                  className={cn(fieldClass, 'min-h-[70px]')}
                  value={draft.skills ?? ''}
                  onChange={(e) => set('skills', e.target.value || null)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Eğitim</span>
                <input
                  className={fieldClass}
                  value={draft.education ?? ''}
                  onChange={(e) => set('education', e.target.value || null)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>CV linki</span>
                <input
                  className={fieldClass}
                  value={draft.cvUrl ?? ''}
                  onChange={(e) => set('cvUrl', e.target.value || null)}
                />
              </label>
            </>
          )}

          <label className="block">
            <span className={labelClass}>E-posta</span>
            <input
              type="email"
              className={fieldClass}
              value={draft.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Telefon</span>
            <input
              className={fieldClass}
              value={draft.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Maaş</span>
            <input
              className={fieldClass}
              disabled={draft.hideSalary}
              value={draft.salaryText ?? ''}
              onChange={(e) => set('salaryText', e.target.value || null)}
            />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={draft.hideSalary}
              onChange={(e) => set('hideSalary', e.target.checked)}
            />
            <span className="text-sm text-[rgb(var(--color-text))]">Maaş gizli</span>
          </label>

          <label className="block sm:col-span-2">
            <span className={labelClass}>Açıklama</span>
            <textarea
              className={cn(fieldClass, 'min-h-[120px]')}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[rgb(var(--color-border))] py-2.5 text-sm font-semibold"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-1 rounded-lg bg-[rgb(var(--color-brand))] py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminJobClassifiedsPage() {
  const { loading: authLoading, isStaff, can } = useCmsAuth()
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [type, setType] = useState<TypeFilter>('all')
  const [citySlug, setCitySlug] = useState('')
  const [items, setItems] = useState<JobClassified[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<JobClassified | null>(null)
  const [query, setQuery] = useState('')

  const provinces = useMemo(() => getAllProvinceOptions(), [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const params = new URLSearchParams({ status })
      if (type !== 'all') params.set('type', type)
      if (citySlug) params.set('citySlug', citySlug)
      const res = await fetch(`/api/admin/job-classifieds?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { items?: JobClassified[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı')
      setItems(data.items ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [status, type, citySlug])

  useEffect(() => {
    if (!authLoading && isStaff) void load()
  }, [authLoading, isStaff, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    if (!q) return items
    return items.filter((item) => {
      const hay = [
        item.title,
        item.companyName,
        item.fullName,
        item.contactEmail,
        item.contactPhone,
        item.cityName,
        item.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR')
      return hay.includes(q)
    })
  }, [items, query])

  const act = async (
    id: string,
    action: 'approve' | 'reject' | 'unpublish'
  ) => {
    setBusyId(id)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/job-classifieds/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız')
      toast.success(
        action === 'approve'
          ? 'İlan yayınlandı'
          : action === 'unpublish'
            ? 'Yayından kaldırıldı'
            : 'İlan reddedildi'
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Bu ilanı kalıcı olarak silmek istiyor musunuz?')) return
    setBusyId(id)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/job-classifieds/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Silinemedi')
      toast.success('İlan silindi')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusyId(null)
    }
  }

  if (authLoading) {
    return <div className="p-6 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }
  if (!isStaff || !can('news:publish')) {
    return (
      <div className="p-6 text-sm text-[rgb(var(--color-muted))]">
        Bu sayfaya erişim yetkiniz yok.
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <CMSHeader
        title="İş kariyer yönetimi"
        subtitle="İşveren ve iş arayan ilanlarını onayla, düzenle, yayından kaldır veya sil"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm font-semibold"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Yenile
          </button>
        }
      />

      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex flex-wrap rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-0.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatus(t.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm',
                  status === t.id
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'text-[rgb(var(--color-text-secondary))]'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="inline-flex flex-wrap rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-0.5">
            {TYPE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm',
                  type === t.id
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'text-[rgb(var(--color-text-secondary))]'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık, şirket, kişi, e-posta ara…"
            className={cn(fieldClass, 'sm:flex-1')}
          />
          <select
            className={cn(fieldClass, 'sm:w-56')}
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
          >
            <option value="">Tüm şehirler</option>
            {provinces.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-[rgb(var(--color-muted))]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-[rgb(var(--color-muted))]">
            Bu filtrelere uyan ilan yok.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((item) => {
              const busy = busyId === item.id
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[rgb(var(--color-brand))]">
                          {item.type === 'employer' ? (
                            <>
                              <Briefcase className="h-3 w-3" /> İşveren
                            </>
                          ) : (
                            <>
                              <UserRoundSearch className="h-3 w-3" /> İş arayan
                            </>
                          )}
                        </span>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-bold',
                            statusBadge(item.status)
                          )}
                        >
                          {statusLabel(item.status)}
                        </span>
                        <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                          {item.cityName}
                        </span>
                        <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                          {jobCategoryLabel(item.category)}
                        </span>
                      </div>
                      <h3 className="font-bold text-[rgb(var(--color-text))]">{item.title}</h3>
                      <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
                        {item.type === 'employer'
                          ? `${item.companyName} · ${item.contactName}`
                          : item.fullName}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--color-muted))]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {item.districtLabel}
                        </span>
                        <span>{item.workType}</span>
                        {item.contactEmail && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {item.contactEmail}
                          </span>
                        )}
                        {item.contactPhone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {item.contactPhone}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--color-text-secondary))]">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {item.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(item.id, 'approve')}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Onayla
                        </button>
                      )}
                      {item.status === 'approved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(item.id, 'unpublish')}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Yayından kaldır
                        </button>
                      )}
                      {item.status === 'pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(item.id, 'reject')}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reddet
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-bold text-[rgb(var(--color-text))] disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Sil
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
