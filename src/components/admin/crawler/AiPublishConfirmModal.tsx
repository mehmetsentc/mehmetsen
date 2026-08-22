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
      title="AI ile yaz ve yayınla"
      confirmLabel="AI Yayınla"
      busy={busy}
      onClose={onClose}
      onConfirm={() => ack && onConfirm()}
      body=""
    >
      <div className="space-y-3 text-sm">
        <p>
          <strong>{count}</strong> ham haber seçildi. Onay sonrası newsroom AI pipeline doğrudan çalışır ve uygun
          haberler yayına alınır.
        </p>
        <p>
          Bu editör onaylı yol <strong>crawler otomatik dispatch kullanmaz</strong> ve Ön-AI kuyruğunu atlar.
        </p>
        <p>Bu işlem:</p>
        <ul className="list-disc pl-5">
          <li>Ön-AI kuyruğunu atlar</li>
          <li>AI ile yazım + chief editor değerlendirmesi yapar</li>
          <li>Güvenilir yayınlar canlıya gider (İnceleme sekmesine düşer)</li>
          <li>Token maliyeti oluşur</li>
        </ul>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>AI maliyetini ve doğrudan yayını onaylıyorum.</span>
        </label>
      </div>
    </CrawlerConfirmModal>
  )
}
