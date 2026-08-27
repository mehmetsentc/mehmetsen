'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { AdvertiserStudioShell } from '@/components/advertiser/AdvertiserStudioShell'
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_OBJECTIVE_LABELS,
  type CampaignObjective,
} from '@/types/advertiserMarketplace'

export default function AdvertiserCampaignsPage() {
  const params = useParams()
  const advertiserId = String(params.advertiserId || '')
  const [campaigns, setCampaigns] = useState<
    Array<{ id: string; name: string; objective: string; status: string }>
  >([])
  const [name, setName] = useState('')
  const [objective, setObjective] = useState<CampaignObjective>('LOCAL_PROMOTION')

  const tokenHeaders = useCallback(async () => {
    const user = auth.currentUser
    if (!user) throw new Error('Giriş gerekli')
    return {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/advertiser/${advertiserId}/campaigns`, { headers })
      if (!res.ok) throw new Error((await res.json()).error || 'Yüklenemedi')
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }, [advertiserId, tokenHeaders])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => void refresh())
    return () => unsub()
  }, [refresh])

  const create = async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/advertiser/${advertiserId}/campaigns`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, objective }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Oluşturulamadı')
      setName('')
      toast.success('Kampanya oluşturuldu')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  return (
    <AdvertiserStudioShell title="Kampanyalar">
      <div className="mb-6 flex flex-wrap gap-2">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Kampanya adı"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={objective}
          onChange={(e) => setObjective(e.target.value as CampaignObjective)}
        >
          {CAMPAIGN_OBJECTIVES.map((o) => (
            <option key={o} value={o}>
              {CAMPAIGN_OBJECTIVE_LABELS[o]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded bg-stone-900 px-4 py-2 text-sm text-white"
          onClick={() => void create()}
        >
          Oluştur
        </button>
      </div>
      <ul className="divide-y divide-stone-200">
        {campaigns.map((c) => (
          <li key={c.id} className="flex justify-between py-3 text-sm">
            <span>
              {c.name} · {c.objective}
            </span>
            <span className="text-stone-500">{c.status}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-stone-500">
        Bir kampanya birden fazla yayıncıya talep gönderebilir (çoklu yayıncı).
      </p>
    </AdvertiserStudioShell>
  )
}
