'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, Link2, X, Loader2,
  Image as ImageIcon, Video, Youtube,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { storageService } from '@/services/storageService'
import { toYouTubeEmbed } from '@/components/admin/MediaLinkSection'
import { auth } from '@/lib/firebase/auth'

interface EditMediaSectionProps {
  postId: string
  userId: string
  thumbnail: string
  videoUrl: string
  onThumbnailChange: (url: string) => void
  onVideoUrlChange: (url: string) => void
  /** uploading durumunu dışarıya bildir (kaydet butonunu disable etmek için) */
  onUploadingChange?: (uploading: boolean) => void
}

export function EditMediaSection({
  postId,
  userId,
  thumbnail,
  videoUrl,
  onThumbnailChange,
  onVideoUrlChange,
  onUploadingChange,
}: EditMediaSectionProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [linkInput, setLinkInput] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setUploadingState = (v: boolean) => {
    setUploading(v)
    onUploadingChange?.(v)
  }

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const file = files[0]
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')

      if (!isVideo && !isImage) {
        toast.error('Sadece görsel (JPG, PNG, WebP, GIF) veya video (MP4, WebM) desteklenir')
        return
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error('Maksimum dosya boyutu 50MB')
        return
      }

      setUploadingState(true)
      setProgress(0)
      try {
        if (isVideo) {
          const url = await storageService.uploadPostVideo(file, userId, postId, setProgress)
          onVideoUrlChange(url)
          toast.success('Video yüklendi')
        } else {
          const url = await storageService.uploadPostImage(file, userId, postId, setProgress)
          onThumbnailChange(url)
          toast.success('Görsel yüklendi')
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Yükleme başarısız')
      } finally {
        setUploadingState(false)
        setProgress(0)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postId, userId, onThumbnailChange, onVideoUrlChange]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => void handleFiles(accepted),
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.webm'],
    },
    maxFiles: 1,
    disabled: uploading,
    noClick: true, // click'i kendi butonumuz yönetiyor
  })

  const handleLinkAdd = async () => {
    const url = linkInput.trim()
    if (!url) return

    // YouTube kontrolü — storage'a kopyalamadan direkt embed URL kullan
    const ytEmbed = toYouTubeEmbed(url)
    if (ytEmbed) {
      onVideoUrlChange(ytEmbed)
      setLinkInput('')
      toast.success('YouTube videosu eklendi')
      return
    }

    setLinkLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { toast.error('Giriş gerekli'); return }

      const res = await fetch('/api/admin/media/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      })
      const data = await res.json() as { url?: string; type?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Medya yüklenemedi')

      if (data.type === 'video') {
        onVideoUrlChange(data.url)
        toast.success('Video eklendi')
      } else {
        onThumbnailChange(data.url)
        toast.success('Görsel eklendi')
      }
      setLinkInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Medya yüklenemedi')
    } finally {
      setLinkLoading(false)
    }
  }

  const isYouTube = videoUrl.includes('youtube.com/embed')

  return (
    <div className="space-y-3">
      {/* ── Mevcut medya önizlemesi ─────────────────────────────────── */}
      {(thumbnail || videoUrl) && (
        <div className="relative overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
          {videoUrl ? (
            isYouTube ? (
              <div className="aspect-video w-full">
                <iframe
                  src={`${videoUrl}?rel=0&modestbranding=1`}
                  title="Video önizleme"
                  className="h-full w-full border-0"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={videoUrl} controls className="max-h-52 w-full rounded-xl" />
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt="Kapak görseli"
              className="max-h-52 w-full rounded-xl object-cover"
            />
          )}

          {/* Kaldır butonları */}
          <div className="absolute right-2 top-2 flex gap-1.5">
            {videoUrl && (
              <button
                type="button"
                onClick={() => onVideoUrlChange('')}
                className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600 transition-colors"
                title="Videoyu kaldır"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {thumbnail && !videoUrl && (
              <button
                type="button"
                onClick={() => onThumbnailChange('')}
                className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600 transition-colors"
                title="Görseli kaldır"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Medya tipi etiketi */}
          <div className="absolute left-2 top-2">
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
              {isYouTube
                ? <><Youtube className="h-3 w-3 text-red-400" /> YouTube</>
                : videoUrl
                  ? <><Video className="h-3 w-3" /> Video</>
                  : <><ImageIcon className="h-3 w-3" /> Kapak Görseli</>}
            </span>
          </div>
        </div>
      )}

      {/* ── Cihazdan yükle (drag & drop + dosya seç) ────────────────── */}
      <div
        {...getRootProps()}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-all ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] hover:border-blue-400 hover:bg-[rgb(var(--color-card))]'
        } ${uploading ? 'pointer-events-none opacity-70' : 'cursor-default'}`}
      >
        {/* react-dropzone'un kendi input'u */}
        <input {...getInputProps()} />
        {/* Dosya seç butonu için ayrı input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-[rgb(var(--color-text))]">
              Yükleniyor… %{Math.round(progress)}
            </p>
            <div className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[rgb(var(--color-border))]">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : isDragActive ? (
          <div className="flex flex-col items-center gap-2 text-blue-600">
            <Upload className="h-8 w-8" />
            <p className="font-semibold">Dosyayı buraya bırakın...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-3 text-[rgb(var(--color-muted))]">
              <ImageIcon className="h-5 w-5" />
              <Upload className="h-5 w-5" />
              <Video className="h-5 w-5" />
            </div>
            <p className="text-sm text-[rgb(var(--color-muted))]">
              Sürükle &amp; bırak <span className="text-[rgb(var(--color-text))]">veya</span>
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              Cihazdan Dosya Seç
            </button>
            <p className="text-[11px] text-[rgb(var(--color-muted))]">
              JPG · PNG · WebP · GIF · MP4 · WebM · Maks. 50 MB
            </p>
          </div>
        )}
      </div>

      {/* ── URL / YouTube linki ──────────────────────────────────────── */}
      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-text))]">
          <Link2 className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
          URL&apos;den ekle
          <span className="font-normal text-[rgb(var(--color-muted))]">
            · görsel URL, video URL veya YouTube
          </span>
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleLinkAdd() } }}
            disabled={linkLoading}
            placeholder="https://youtube.com/watch?v=... veya görsel/video URL"
            className="flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleLinkAdd()}
            disabled={!linkInput.trim() || linkLoading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {linkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ekle'}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[rgb(var(--color-muted))]">
          YouTube linki direkt oynatılır · Diğer linkler Firebase Storage&apos;a kopyalanır
        </p>
      </div>
    </div>
  )
}
