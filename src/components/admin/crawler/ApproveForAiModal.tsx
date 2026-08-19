'use client'

import { useState } from 'react'
import { CrawlerConfirmModal } from '@/components/admin/crawler/CrawlerConfirmModal'
import { EDITORIAL_PRIORITY_LABELS } from '@/services/crawler/editorial/controlPlane'
import type { EditorialPriority } from '@/services/crawler/types'

export function ApproveForAiModal({
  open,
  count,
  busy,
  staleWarning,
  staleConfirmRequired,
  staleMessage,
  onClose,
  onConfirm,
}: {
  open: boolean
  count: number
  busy?: boolean
  staleWarning?: boolean
  staleConfirmRequired?: boolean
  staleMessage?: string | null
  onClose: () => void
  onConfirm: (priority: EditorialPriority, confirmStale: boolean) => void
}) {
  const [priority, setPriority] = useState<EditorialPriority>('NORMAL')
  const [ack, setAck] = useState(false)
  const canConfirm = !staleConfirmRequired || ack
  return (
    <CrawlerConfirmModal
      open={open}
      title="AI için onay"
      confirmLabel="AI İçin Onayla"
      busy={busy}
      onClose={onClose}
      onConfirm={() => canConfirm && onConfirm(priority, true)}
      body=""
    >
      <div className="space-y-3 text-sm">
        <p>{count} olay AI için editoryal olarak onaylanacak.</p>
        <p>
          AI Dispatch: <strong>KAPALI</strong>
        </p>
        <p>Bu işlem:</p>
        <ul className="list-disc pl-5">
          <li>✓ editoryal onay verir</li>
          <li>✓ olayları AI bekleme listesine alır</li>
        </ul>
        <p>Bu işlem:</p>
        <ul className="list-disc pl-5">
          <li>✗ DeepSeek çağırmaz</li>
          <li>✗ token harcamaz</li>
          <li>✗ haber oluşturmaz</li>
          <li>✗ yayın yapmaz</li>
        </ul>
        <label className="block">
          Öncelik
          <select
            className="ml-2 rounded border px-2 py-1"
            value={priority}
            onChange={(e) => setPriority(e.target.value as EditorialPriority)}
          >
            {(Object.keys(EDITORIAL_PRIORITY_LABELS) as EditorialPriority[]).map((k) => (
              <option key={k} value={k}>
                {EDITORIAL_PRIORITY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {staleWarning ? <p className="text-amber-800">{staleMessage || 'Bu olay 24 saatten eski.'}</p> : null}
        {staleConfirmRequired ? (
          <label className="flex items-start gap-2 text-amber-900">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{staleMessage || 'Eski haberi AI kuyruğuna almak için ikinci onay.'}</span>
          </label>
        ) : null}
      </div>
    </CrawlerConfirmModal>
  )
}
