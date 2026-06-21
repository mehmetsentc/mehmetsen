'use client'

import { Camera, ImageIcon, Trash2 } from 'lucide-react'

interface AvatarPickerSheetProps {
  hasPhoto: boolean
  onCamera: () => void
  onGallery: () => void
  onRemove: () => void
  onClose: () => void
}

export function AvatarPickerSheet({
  hasPhoto,
  onCamera,
  onGallery,
  onRemove,
  onClose,
}: AvatarPickerSheetProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-2xl bg-[rgb(var(--color-card))] pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>

        {/* Başlık */}
        <p className="mb-3 mt-1 text-center text-xs font-semibold uppercase tracking-widest text-[rgb(var(--color-muted))]">
          Profil Fotoğrafı
        </p>

        {/* Seçenekler */}
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={onCamera}
            className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left text-[rgb(var(--color-text))] transition active:bg-[rgb(var(--color-border))]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/10">
              <Camera className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </span>
            <div>
              <p className="text-sm font-semibold">Fotoğraf Çek</p>
              <p className="text-xs text-[rgb(var(--color-muted))]">Kamerayı aç</p>
            </div>
          </button>

          <button
            type="button"
            onClick={onGallery}
            className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left text-[rgb(var(--color-text))] transition active:bg-[rgb(var(--color-border))]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/10">
              <ImageIcon className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </span>
            <div>
              <p className="text-sm font-semibold">Galeriden Seç</p>
              <p className="text-xs text-[rgb(var(--color-muted))]">Fotoğraf kütüphanesini aç</p>
            </div>
          </button>

          {hasPhoto && (
            <>
              <div className="my-2 h-px bg-[rgb(var(--color-border))]" />
              <button
                type="button"
                onClick={onRemove}
                className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left transition active:bg-[rgb(var(--color-border))]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                  <Trash2 className="h-5 w-5 text-red-500" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-red-500">Fotoğrafı Kaldır</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">Profil fotoğrafını sil</p>
                </div>
              </button>
            </>
          )}
        </div>

        {/* İptal */}
        <div className="px-4 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[rgb(var(--color-border))] py-3.5 text-sm font-semibold text-[rgb(var(--color-text))] transition active:opacity-70"
          >
            İptal
          </button>
        </div>
      </div>
    </>
  )
}
