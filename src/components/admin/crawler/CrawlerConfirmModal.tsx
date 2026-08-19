'use client'

import { Modal } from '@/components/ui/Modal'

export function CrawlerConfirmModal({
  open,
  title,
  body,
  children,
  confirmLabel = 'Onayla',
  danger = false,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  body?: string
  children?: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeOnOverlay={!busy}
      footer={
        <>
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm text-white ${danger ? 'bg-red-600' : 'bg-[rgb(var(--color-brand))]'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'İşleniyor…' : confirmLabel}
          </button>
        </>
      }
    >
      {children || <p className="whitespace-pre-wrap text-sm">{body}</p>}
    </Modal>
  )
}
