'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { REJECTION_REASON_CODES, REJECTION_REASON_LABELS } from '@/services/crawler/editorial/labels'
import type { CrawlerRejectionReason } from '@/services/crawler/types'

export function RejectReasonModal({
  open,
  count,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  count: number
  busy?: boolean
  onClose: () => void
  onConfirm: (reason: CrawlerRejectionReason, note: string) => void
}) {
  const [reason, setReason] = useState<CrawlerRejectionReason>('NO_NEWS_VALUE')
  const [note, setNote] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reddet"
      description={`${count} kayıt reddedilecek.`}
      footer={
        <>
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white"
            disabled={busy}
            onClick={() => onConfirm(reason, note)}
          >
            {busy ? 'İşleniyor…' : 'Reddet'}
          </button>
        </>
      }
    >
      <label className="mb-2 block text-sm">
        Gerekçe
        <select
          className="mt-1 w-full rounded border px-2 py-1"
          value={reason}
          onChange={(e) => setReason(e.target.value as CrawlerRejectionReason)}
        >
          {REJECTION_REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {REJECTION_REASON_LABELS[code]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Not (isteğe bağlı)
        <textarea className="mt-1 w-full rounded border px-2 py-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  )
}
