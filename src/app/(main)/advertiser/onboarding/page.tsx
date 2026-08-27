'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import {
  ADVERTISER_TYPES,
  ADVERTISER_TYPE_LABELS,
  type AdvertiserType,
} from '@/types/advertiserMarketplace'

export default function AdvertiserOnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [advertiserType, setAdvertiserType] = useState<AdvertiserType>('BUSINESS')
  const [memberships, setMemberships] = useState<
    Array<{ role: string; advertiser: { id: string; name: string } }>
  >([])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch('/api/advertiser/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMemberships(data.memberships || [])
      }
    })
    return () => unsub()
  }, [])

  const create = async () => {
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Giriş gerekli')
      const token = await user.getIdToken()
      const res = await fetch('/api/advertiser/me', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, city, websiteUrl: websiteUrl || null, advertiserType }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Oluşturulamadı')
      const data = await res.json()
      toast.success('Reklamveren hesabı oluşturuldu')
      router.push(`/advertiser/${data.advertiser.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-12">
      <h1 className="text-2xl font-semibold">Reklam Ver</h1>

      {memberships.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-stone-600">Mevcut hesaplarınız</p>
          {memberships.map((m) => (
            <Link
              key={m.advertiser.id}
              href={`/advertiser/${m.advertiser.id}`}
              className="block rounded border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              {m.advertiser.name} · {m.role}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="İşletme / Marka Adı"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Website (opsiyonel)"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
        />
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="Şehir"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <select
          className="w-full rounded border px-3 py-2"
          value={advertiserType}
          onChange={(e) => setAdvertiserType(e.target.value as AdvertiserType)}
        >
          {ADVERTISER_TYPES.map((t) => (
            <option key={t} value={t}>
              {ADVERTISER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="w-full rounded bg-stone-900 py-2 text-white"
          onClick={() => void create()}
        >
          Hesap Oluştur
        </button>
      </div>
    </div>
  )
}
