'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { AdvertiserStudioShell } from '@/components/advertiser/AdvertiserStudioShell'
import { CREATIVE_TYPES, type CreativeType } from '@/types/advertiserMarketplace'

export default function AdvertiserCreativesPage() {
  const params = useParams()
  const advertiserId = String(params.advertiserId || '')
  const [creatives, setCreatives] = useState<
    Array<{ id: string; name: string; status: string; destinationUrl: string | null }>
  >([])
  const [name, setName] = useState('')
  const [creativeType, setCreativeType] = useState<CreativeType>('IMAGE')
  const [destinationUrl, setDestinationUrl] = useState('')

  const refresh = useCallback(async () => {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(`/api/advertiser/${advertiserId}/creatives`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Yüklenemedi')
      const data = await res.json()
      setCreatives(data.creatives || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }, [advertiserId])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => void refresh())
    return () => unsub()
  }, [refresh])

  const create = async () => {
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Giriş gerekli')
      const token = await user.getIdToken()
      const res = await fetch(`/api/advertiser/${advertiserId}/creatives`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, creativeType, destinationUrl: destinationUrl || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Oluşturulamadı')
      setName('')
      setDestinationUrl('')
      toast.success('Kreatif oluşturuldu')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  const submit = async (id: string) => {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(`/api/advertiser/${advertiserId}/creatives/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Gönderilemedi')
      toast.success('Gönderildi')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  return (
    <AdvertiserStudioShell title="Kreatifler">
      <div className="mb-6 flex flex-wrap gap-2">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Ad"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={creativeType}
          onChange={(e) => setCreativeType(e.target.value as CreativeType)}
        >
          {CREATIVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="min-w-[200px] flex-1 rounded border px-3 py-2 text-sm"
          placeholder="Hedef URL (https)"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-stone-900 px-4 py-2 text-sm text-white"
          onClick={() => void create()}
        >
          Oluştur
        </button>
      </div>
      <ul className="divide-y divide-stone-200">
        {creatives.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-3 text-sm">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-stone-500">
                {c.status}
                {c.destinationUrl ? ` · ${c.destinationUrl}` : ''}
              </p>
            </div>
            {c.status === 'DRAFT' ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => void submit(c.id)}
              >
                Gönder
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </AdvertiserStudioShell>
  )
}
