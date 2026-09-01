'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!open) setAck(false)
  }, [open])

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
          <strong>{count}</strong> ham haber seçildi. AI haberleri hazırlar; yayın için editör onayı gerekir.
          Hazırlananlar <strong>Onay Bekliyor</strong> taslağı olarak kalır. Düşük güvenli veya riskli olanlar da
          aynı inceleme akışında tutulur.
        </p>
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          ✓ Arka planda işlenir — onaylayınca pencere kapanır, siz çalışmaya devam edebilirsiniz.
          Haberler <strong>⏳ AI Kuyruğu</strong> sekmesinden izlenebilir; hazır olanlar{' '}
          <strong>Yayın Odası → Onay Bekliyor</strong> altında görünür.
        </p>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>AI işleme maliyetini onaylıyorum (bu, yayın onayı değildir).</span>
        </label>
      </div>
    </CrawlerConfirmModal>
  )
}
