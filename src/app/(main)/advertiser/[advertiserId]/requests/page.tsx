'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { AdvertiserStudioShell } from '@/components/advertiser/AdvertiserStudioShell'
import { formatPriceMinor } from '@/lib/publisher/adInventoryDomain'
import { BOOKING_REQUEST_STATUS_LABELS } from '@/types/advertiserMarketplace'

export default function AdvertiserRequestsPage() {
  const params = useParams()
  const advertiserId = String(params.advertiserId || '')
  const [requests, setRequests] = useState<
    Array<{
      id: string
      status: keyof typeof BOOKING_REQUEST_STATUS_LABELS
      inventoryId: string
      publisherId: string
      campaignId: string
      priceSnapshotMinor: number | null
      currency: string
      requestedStartAt: string
      requestedEndAt: string
    }>
  >([])

  const refresh = useCallback(async () => {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(`/api/advertiser/${advertiserId}/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Yüklenemedi')
      const data = await res.json()
      setRequests(data.requests || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }, [advertiserId])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => void refresh())
    return () => unsub()
  }, [refresh])

  const cancel = async (id: string) => {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(`/api/advertiser/${advertiserId}/requests/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'İptal edilemedi')
      toast.success('İptal edildi')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  return (
    <AdvertiserStudioShell title="Talepler">
      <ul className="divide-y divide-stone-200">
        {requests.map((r) => (
          <li key={r.id} className="space-y-1 py-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">
                {BOOKING_REQUEST_STATUS_LABELS[r.status] || r.status}
              </span>
              <span>
                {formatPriceMinor(r.priceSnapshotMinor, r.currency) || 'Teklif bekleniyor'}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {new Date(r.requestedStartAt).toLocaleString('tr-TR')} →{' '}
              {new Date(r.requestedEndAt).toLocaleString('tr-TR')}
            </p>
            {['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OFFERED'].includes(r.status) ? (
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => void cancel(r.id)}
              >
                İptal
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {requests.length === 0 ? (
        <p className="text-sm text-stone-500">Henüz talep yok.</p>
      ) : null}
    </AdvertiserStudioShell>
  )
}
