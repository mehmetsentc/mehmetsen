'use client'

import { useEffect, useState } from 'react'
import { PublisherStudioShell, saveProfile } from '@/components/publisher/studio/PublisherStudioShell'
import type { PublisherRecord } from '@/types/publisher'

export function PublisherStudioProfileClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  const [form, setForm] = useState({
    displayName: publisher.displayName,
    description: publisher.description ?? '',
    logoUrl: publisher.logoUrl ?? '',
    coverImageUrl: publisher.coverImageUrl ?? '',
    city: publisher.city ?? '',
    district: publisher.district ?? '',
    countryCode: publisher.countryCode ?? '',
    websiteUrl: publisher.websiteUrl ?? '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      displayName: publisher.displayName,
      description: publisher.description ?? '',
      logoUrl: publisher.logoUrl ?? '',
      coverImageUrl: publisher.coverImageUrl ?? '',
      city: publisher.city ?? '',
      district: publisher.district ?? '',
      countryCode: publisher.countryCode ?? '',
      websiteUrl: publisher.websiteUrl ?? '',
    })
  }, [publisher])

  const submit = async () => {
    setSaving(true)
    try {
      await saveProfile(publisher.id, {
        displayName: form.displayName,
        description: form.description || null,
        logoUrl: form.logoUrl || null,
        coverImageUrl: form.coverImageUrl || null,
        city: form.city || null,
        district: form.district || null,
        countryCode: form.countryCode || null,
        websiteUrl: form.websiteUrl || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="text-2xl font-black">Profil</h1>
      <div className="mt-6 space-y-4">
        {(
          [
            ['displayName', 'Görünen ad'],
            ['description', 'Açıklama'],
            ['logoUrl', 'Logo URL'],
            ['coverImageUrl', 'Kapak URL'],
            ['city', 'Şehir'],
            ['district', 'İlçe'],
            ['countryCode', 'Ülke kodu'],
            ['websiteUrl', 'Web sitesi'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="mb-1 block font-semibold">{label}</span>
            {key === 'description' ? (
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] px-3 py-2"
              />
            ) : (
              <input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-lg border border-[rgb(var(--color-border))] px-3 py-2"
              />
            )}
          </label>
        ))}
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Düzenlenemez: primary_domain, verification_status, sahiplik, kaynak ilişkileri.
        </p>
        <button type="button" disabled={saving} onClick={() => void submit()} className="studio-btn-primary">
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </PublisherStudioShell>
  )
}
