'use client'

import { useState } from 'react'
import { CrawlerConfirmModal } from '@/components/admin/crawler/CrawlerConfirmModal'

export function AiPublishConfirmModal({
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
  onConfirm: () => void
}) {
  const [ack, setAck] = useState(false)

  return (
    <CrawlerConfirmModal
      open={open}
      title="AI için onayla"
      confirmLabel="AI için onayla"
      busy={busy}
      onClose={onClose}
      onConfirm={() => ack && onConfirm()}
      body=""
    >
      <div className="space-y-3 text-sm">
        <p>
          <strong>{count}</strong> ham haber seçildi. Haberler hemen AI ile yazılıp yayına alınacak; inceleme
          sekmesinde sadece kategori düzeltebilirsiniz.
        </p>
        <p>
          Bu işlem Ön-AI kuyruğunu veya &quot;AI Adayı&quot; durumunu kullanmaz; newsroom pipeline doğrudan çalışır.
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>AI maliyetini ve doğrudan yayını onaylıyorum.</span>
        </label>
      </div>
    </CrawlerConfirmModal>
  )
}
