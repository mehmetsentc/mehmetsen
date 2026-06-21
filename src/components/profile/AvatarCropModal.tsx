'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface AvatarCropModalProps {
  file: File
  onConfirm: (blob: Blob) => void
  onClose: () => void
}

const OUTPUT_SIZE = 400  // çıktı çözünürlüğü
const PREVIEW_SIZE = 280 // önizleme canvas boyutu (px)

export function AvatarCropModal({ file, onConfirm, onClose }: AvatarCropModalProps) {
  const outputRef  = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const dragStart  = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)

  const [imgReady, setImgReady] = useState(false)
  const [scale,    setScale]    = useState(1)
  const [offset,   setOffset]   = useState({ x: 0, y: 0 })

  /* ── Görüntüyü yükle ── */
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setScale(OUTPUT_SIZE / Math.min(img.width, img.height))
      setOffset({ x: 0, y: 0 })
      setImgReady(true)
    }
    img.onerror = () => toast.error('Görsel yüklenemedi')
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  /* ── Önizlemeyi çiz ── */
  useEffect(() => {
    if (!imgReady || !imgRef.current) return
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img  = imgRef.current
    const size = PREVIEW_SIZE
    const ratio = size / OUTPUT_SIZE

    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#1c1c1e'
    ctx.fillRect(0, 0, size, size)
    const dw = img.width  * scale * ratio
    const dh = img.height * scale * ratio
    const dx = (size - dw) / 2 + offset.x * ratio
    const dy = (size - dh) / 2 + offset.y * ratio
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
    // daire kenarlık
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.stroke()
  }, [imgReady, scale, offset])

  /* ── Pointer sürükle ── */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }, [offset])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart.current) return
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.mx),
      y: dragStart.current.oy + (e.clientY - dragStart.current.my),
    })
  }, [])

  const onPointerUp = useCallback(() => { dragStart.current = null }, [])

  /* ── Onay → 400×400 blob ── */
  const handleConfirm = useCallback(() => {
    const img = imgRef.current
    if (!img || !outputRef.current) return
    const canvas = outputRef.current
    canvas.width  = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#1c1c1e'
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    const dw = img.width  * scale
    const dh = img.height * scale
    ctx.drawImage(img, (OUTPUT_SIZE - dw) / 2 + offset.x, (OUTPUT_SIZE - dh) / 2 + offset.y, dw, dh)
    canvas.toBlob(blob => {
      if (blob) onConfirm(blob)
      else toast.error('Fotoğraf işlenemedi, tekrar dene')
    }, 'image/jpeg', 0.92)
  }, [scale, offset, onConfirm])

  return (
    /* z-[110] — mobile nav (z-[105]) dahil her şeyin üstünde */
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Profil fotoğrafı kırp"
    >
      {/* ── Üst bar ── */}
      <div className="flex shrink-0 items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm active:bg-white/20"
          aria-label="İptal"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white">Fotoğrafı Ayarla</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!imgReady}
          className="flex h-9 items-center gap-1.5 rounded-full bg-[rgb(var(--color-brand))] px-4 text-sm font-semibold text-white disabled:opacity-40 active:opacity-80"
          aria-label="Uygula"
        >
          <Check className="h-4 w-4" />
          Uygula
        </button>
      </div>

      {/* ── Önizleme — ekranın ortasında ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <p className="text-xs text-white/50">
          Sürükleyerek konumlandır · kaydırıcıyla yakınlaştır
        </p>

        {!imgReady && (
          <div
            className="flex animate-pulse items-center justify-center rounded-full bg-white/10"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          >
            <span className="text-xs text-white/40">Yükleniyor...</span>
          </div>
        )}

        <canvas
          ref={previewRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          className={`cursor-grab touch-none rounded-full active:cursor-grabbing ${imgReady ? 'block' : 'hidden'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* ── Zoom kaydırıcı ── */}
      <div className="shrink-0 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setScale(s => Math.max(s - 0.1, 0.5))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
            aria-label="Uzaklaştır"
          >
            <ZoomOut className="h-4 w-4" />
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
            aria-label="Yakınlaştır"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Gizli çıktı canvas */}
      <canvas ref={outputRef} className="hidden" />
    </div>
  )
}
