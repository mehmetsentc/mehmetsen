'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface AvatarCropModalProps {
  file: File
  onConfirm: (blob: Blob) => void
  onClose: () => void
}

const OUTPUT_SIZE = 400 // çıktı canvas px (kare, sonra daire olarak gösterilir)
const PREVIEW_SIZE = 200 // önizleme canvas px — küçük tutarak butonların ekranda kalmasını sağlıyoruz

export function AvatarCropModal({ file, onConfirm, onClose }: AvatarCropModalProps) {
  const outputRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgReady, setImgReady] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)

  // Görüntüyü yükle
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const minDim = Math.min(img.width, img.height)
      setScale(OUTPUT_SIZE / minDim)
      setOffset({ x: 0, y: 0 })
      setImgReady(true)
    }
    img.onerror = () => toast.error('Görsel yüklenemedi')
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Önizlemeyi çiz
  useEffect(() => {
    if (!imgReady || !imgRef.current) return
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = imgRef.current
    const size = PREVIEW_SIZE

    ctx.clearRect(0, 0, size, size)
    ctx.save()

    // Daire kırpma
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()

    // Arka plan
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, size, size)

    // Görüntüyü çiz (preview boyutuna oranla scale)
    const ratio = size / OUTPUT_SIZE
    const drawW = img.width * scale * ratio
    const drawH = img.height * scale * ratio
    const drawX = (size - drawW) / 2 + offset.x * ratio
    const drawY = (size - drawH) / 2 + offset.y * ratio
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.restore()

    // Daire kenarlık
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.stroke()
  }, [imgReady, scale, offset])

  // Sürükle
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }, [offset])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy })
  }, [])

  const onPointerUp = useCallback(() => { dragStart.current = null }, [])

  // Onay: 400×400 çıktı canvas → blob
  const handleConfirm = useCallback(() => {
    const img = imgRef.current
    if (!img || !outputRef.current) return
    const canvas = outputRef.current
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()

    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    const drawW = img.width * scale
    const drawH = img.height * scale
    const drawX = (OUTPUT_SIZE - drawW) / 2 + offset.x
    const drawY = (OUTPUT_SIZE - drawH) / 2 + offset.y
    ctx.drawImage(img, drawX, drawY, drawW, drawH)

    canvas.toBlob(blob => {
      if (blob) {
        onConfirm(blob)
      } else {
        toast.error('Fotoğraf işlenemedi, tekrar dene')
      }
    }, 'image/jpeg', 0.92)
  }, [scale, offset, onConfirm])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

      {/* Modal — flex column, max yükseklik sınırlı, butonlar her zaman görünür */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profil fotoğrafı kırp"
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[95dvh] max-w-sm flex-col rounded-t-2xl bg-[rgb(var(--color-card))] shadow-2xl sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        {/* Başlık — shrink-0 */}
        <div className="shrink-0 flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
          <h2 className="text-base font-bold text-[rgb(var(--color-text))]">Fotoğrafı ayarla</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[rgb(var(--color-border))]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Kaydırılabilir içerik */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-center text-xs text-[rgb(var(--color-muted))]">
            Sürükleyerek konumlandır · kaydırıcıyla yakınlaştır
          </p>

          {/* Önizleme canvas */}
          <div className="flex justify-center">
            {!imgReady && (
              <div
                className="flex items-center justify-center rounded-full bg-[rgb(var(--color-border))]"
                style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              >
                <span className="text-xs text-[rgb(var(--color-muted))]">Yükleniyor...</span>
              </div>
            )}
            <canvas
              ref={previewRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              className={`cursor-grab rounded-full touch-none active:cursor-grabbing ${imgReady ? 'block' : 'hidden'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          {/* Zoom kaydırıcı */}
          {imgReady && (
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setScale(s => Math.max(s - 0.1, 0.5))}
                className="rounded-full p-2 hover:bg-[rgb(var(--color-border))] active:bg-[rgb(var(--color-border))]"
                aria-label="Uzaklaştır"
              >
                <ZoomOut className="h-5 w-5 text-[rgb(var(--color-muted))]" />
              </button>
              <input
                type="range"
                min="50"
                max="300"
                value={Math.round(scale * 100)}
                onChange={e => setScale(Number(e.target.value) / 100)}
                className="flex-1 accent-[rgb(var(--color-brand))]"
                aria-label="Yakınlaştırma"
              />
              <button
                type="button"
                onClick={() => setScale(s => Math.min(s + 0.1, 3))}
                className="rounded-full p-2 hover:bg-[rgb(var(--color-border))] active:bg-[rgb(var(--color-border))]"
                aria-label="Yakınlaştır"
              >
                <ZoomIn className="h-5 w-5 text-[rgb(var(--color-muted))]" />
              </button>
            </div>
          )}
        </div>

        {/* Butonlar — her zaman ekranda, shrink-0 */}
        <div className="shrink-0 border-t border-[rgb(var(--color-border))] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[rgb(var(--color-border))] py-3 text-sm font-semibold text-[rgb(var(--color-muted))] transition active:opacity-70"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!imgReady}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] py-3 text-sm font-semibold text-white transition disabled:opacity-40 active:opacity-80"
            >
              <Check className="h-4 w-4" />
              Uygula
            </button>
          </div>
        </div>

        {/* Gizli çıktı canvas */}
        <canvas ref={outputRef} className="hidden" />
      </div>
    </>
  )
}
