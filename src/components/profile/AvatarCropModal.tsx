'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface AvatarCropModalProps {
  file: File
  onConfirm: (blob: Blob) => void
  onClose: () => void
}

const CANVAS_SIZE = 400 // output canvas px (kare, sonra yuvarlak clip)

export function AvatarCropModal({ file, onConfirm, onClose }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  // Görüntü
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgReady, setImgReady] = useState(false)

  // Pan state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)

  // Görüntüyü yükle
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Başlangıç scale: görüntü tüm daireyi kaplayacak şekilde
      const minDim = Math.min(img.width, img.height)
      setScale(CANVAS_SIZE / minDim)
      setOffset({ x: 0, y: 0 })
      setImgReady(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Preview'ı her scale/offset değişiminde çiz
  useEffect(() => {
    if (!imgReady || !imgRef.current) return
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = imgRef.current
    const size = canvas.width // 256

    ctx.clearRect(0, 0, size, size)

    // Daire kırpma maskesi
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()

    // Arka plan
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, size, size)

    // Görüntüyü çiz
    const ratio = size / CANVAS_SIZE
    const drawW = img.width * scale * ratio
    const drawH = img.height * scale * ratio
    const drawX = (size - drawW) / 2 + offset.x * ratio
    const drawY = (size - drawH) / 2 + offset.y * ratio
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.restore()

    // Daire kenarlık
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.stroke()
  }, [imgReady, scale, offset])

  // Mouse/touch sürükle
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

  // Onay: 400×400 canvas'a çiz → blob al
  const handleConfirm = useCallback(() => {
    const img = imgRef.current
    if (!img || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()

    const drawW = img.width * scale
    const drawH = img.height * scale
    const drawX = (CANVAS_SIZE - drawW) / 2 + offset.x
    const drawY = (CANVAS_SIZE - drawH) / 2 + offset.y
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
      <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profil fotoğrafı kırp"
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-sm rounded-t-2xl bg-[rgb(var(--color-card))] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        {/* Başlık */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[rgb(var(--color-text))]">Fotoğrafı ayarla</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[rgb(var(--color-border))]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-center text-xs text-[rgb(var(--color-muted))]">
          Sürükleyerek konumlandır, kaydırıcıyla yakınlaştır
        </p>

        {/* Preview canvas */}
        <div className="flex justify-center">
          <canvas
            ref={previewRef}
            width={256}
            height={256}
            className="cursor-grab rounded-full active:cursor-grabbing touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        {/* Zoom */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setScale(s => Math.max(s - 0.1, 0.5))}
            className="rounded-full p-1 hover:bg-[rgb(var(--color-border))]"
            aria-label="Uzaklaştır"
          >
            <ZoomOut className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>
          <input
            type="range"
            min="50"
            max="300"
            value={Math.round(scale * 100)}
            onChange={e => setScale(Number(e.target.value) / 100)}
            className="flex-1 accent-[rgb(var(--color-primary))]"
            aria-label="Yakınlaştırma"
          />
          <button
            type="button"
            onClick={() => setScale(s => Math.min(s + 0.1, 3))}
            className="rounded-full p-1 hover:bg-[rgb(var(--color-border))]"
            aria-label="Yakınlaştır"
          >
            <ZoomIn className="h-4 w-4 text-[rgb(var(--color-muted))]" />
          </button>
        </div>

        {/* Butonlar */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[rgb(var(--color-border))] py-2.5 text-sm font-medium text-[rgb(var(--color-muted))]"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] py-2.5 text-sm font-semibold text-white"
          >
            <Check className="h-4 w-4" />
            Uygula
          </button>
        </div>

        {/* Gizli export canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </>
  )
}
