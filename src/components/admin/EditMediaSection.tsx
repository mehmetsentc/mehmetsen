'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, Link2, X, Loader2,
  Image as ImageIcon, Video, Youtube, Star, Plus, Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { storageService } from '@/services/storageService'
import { auth } from '@/lib/firebase/auth'
import { isDirectImageUrl, scrapeVideoUrl } from '@/lib/adminVideoScrapeClient'
import { isEmbedPlayerUrl } from '@/lib/videoEmbed'

/**
 * Video preview with CORS-error fallback.
 * External URLs (third-party news sites) may be blocked by the browser due to CORS.
 * In that case we show an "Dışarıda Aç" link instead of a broken player.
 */
function VideoPlayer({ src }: { src: string }) {
  const [errored, setErrored] = useState(false)

  // Reset error state when the src changes
  useEffect(() => { setErrored(false) }, [src])

  if (errored) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-black/80 px-4 py-8 text-center">
        <Video className="h-8 w-8 text-white/40" />
        <p className="text-xs text-white/60">
          Video bu önizlemede oynatılamıyor
          <br />
          <span className="text-white/40">(CORS / tarayıcı kısıtlaması)</span>
        </p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
        >
          ↗ Dışarıda Aç
        </a>
        <p className="text-[10px] text-white/30 max-w-xs break-all">{src}</p>
      </div>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={src}
      controls
      crossOrigin="anonymous"
      className="max-h-48 w-full rounded-xl"
      onError={() => setErrored(true)}
    />
  )
}

function SafePreviewImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [src])
  if (failed) {
    return (
      <div className="flex max-h-48 min-h-24 items-center justify-center bg-black/5 px-3 py-6 text-center text-xs text-[rgb(var(--color-muted))]">
        Kaynak görsel yüklenemedi (kırık URL). Editör açık kalır.
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  )
}

export interface AdditionalImageItem {
  url: string
  caption?: string
}

interface EditMediaSectionProps {
  postId: string
  userId: string
  thumbnail: string
  thumbnailCaption: string
  videoUrl: string
  additionalImages: AdditionalImageItem[]
  articleTitle?: string
  articleContent?: string
  articleSummary?: string
  onThumbnailChange: (url: string) => void
  onThumbnailCaptionChange: (caption: string) => void
  onVideoUrlChange: (url: string) => void
  onAdditionalImagesChange: (items: AdditionalImageItem[]) => void
  /** uploading durumunu dışarıya bildir (kaydet butonunu disable etmek için) */
  onUploadingChange?: (uploading: boolean) => void
}

export function EditMediaSection({
  postId,
  userId,
  thumbnail,
  thumbnailCaption,
  videoUrl,
  additionalImages,
  articleTitle = '',
  articleContent = '',
  articleSummary = '',
  onThumbnailChange,
  onThumbnailCaptionChange,
  onVideoUrlChange,
  onAdditionalImagesChange,
  onUploadingChange,
}: EditMediaSectionProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [seoGeneratingUrl, setSeoGeneratingUrl] = useState<string | null>(null)
  /** 'replace' = ana görseli değiştir, 'additional' = ek görsel ekle, null = kapalı */
  const [uploadMode, setUploadMode] = useState<'replace' | 'additional' | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setUploadingState = (v: boolean) => {
    setUploading(v)
    onUploadingChange?.(v)
  }

  const generateImageSeo = useCallback(
    async (
      imageUrl: string,
      target: 'thumbnail' | 'additional',
      additionalSnapshot?: AdditionalImageItem[]
    ) => {
      if (!imageUrl.trim()) return
      setSeoGeneratingUrl(imageUrl)
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return

        const res = await fetch('/api/admin/news/ai-image-seo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            imageUrl,
            title: articleTitle,
            content: articleContent,
            summary: articleSummary,
          }),
        })
        const data = await res.json() as { caption?: string; error?: string }
        if (!res.ok || !data.caption?.trim()) return

        // JSON fragment gelirse temizle
        let caption = data.caption.trim()
        if (caption.startsWith('{')) {
          try {
            const obj = JSON.parse(caption) as Record<string, unknown>
            if (typeof obj.caption === 'string') caption = obj.caption.trim()
          } catch {
            const m = caption.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"|$)/)
            if (m?.[1]?.trim()) caption = m[1].trim()
          }
        }
        if (!caption) return
        if (target === 'thumbnail') {
          onThumbnailCaptionChange(caption)
        } else {
          const source = additionalSnapshot ?? additionalImages
          onAdditionalImagesChange(
            source.map((img) =>
              img.url === imageUrl && !img.caption?.trim() ? { ...img, caption } : img
            )
          )
        }
        toast.success('Görsel SEO açıklaması yazıldı')
      } catch {
        // Sessizce geç — kullanıcı manuel yazabilir
      } finally {
        setSeoGeneratingUrl((current) => (current === imageUrl ? null : current))
      }
    },
    [
      additionalImages,
      articleContent,
      articleSummary,
      articleTitle,
      onAdditionalImagesChange,
      onThumbnailCaptionChange,
    ]
  )

  const handleFiles = useCallback(
    async (files: File[], mode: 'replace' | 'additional') => {
      if (files.length === 0) return
      const selected = files.slice(0, 6)
      const invalid = selected.some(
        (file) => !file.type.startsWith('video/') && !file.type.startsWith('image/')
      )
      if (invalid) {
        toast.error('Sadece görsel (JPG, PNG, WebP, GIF) veya video (MP4, WebM) desteklenir')
        return
      }
      if (selected.some((file) => file.size > 50 * 1024 * 1024)) {
        toast.error('Maksimum dosya boyutu 50MB')
        return
      }
      if (selected.length > 1 && selected.some((file) => file.type.startsWith('video/'))) {
        toast.error('Çoklu yüklemede yalnızca görsel seçin')
        return
      }

      setUploadingState(true)
      setProgress(0)
      try {
        const file = selected[0]
        if (file.type.startsWith('video/')) {
          const url = await storageService.uploadPostVideo(file, userId, postId, setProgress)
          onVideoUrlChange(url)
          toast.success('Video yüklendi')
        } else {
          const uploaded: string[] = []
          for (let index = 0; index < selected.length; index += 1) {
            const url = await storageService.uploadPostImage(
              selected[index],
              userId,
              postId,
              (fileProgress) =>
                setProgress(((index + fileProgress / 100) / selected.length) * 100)
            )
            uploaded.push(url)
          }
          const useFirstAsCover = mode === 'replace' || !thumbnail
          const coverUrl = useFirstAsCover ? uploaded[0] : ''
          if (coverUrl) {
            onThumbnailChange(coverUrl)
            void generateImageSeo(coverUrl, 'thumbnail')
          }
          const extraUrls = useFirstAsCover ? uploaded.slice(1) : uploaded
          if (extraUrls.length > 0) {
            onAdditionalImagesChange([
              ...additionalImages,
              ...extraUrls.map((url) => ({ url, caption: '' })),
            ])
          }
          toast.success(`${uploaded.length} görsel yüklendi`)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Yükleme başarısız')
      } finally {
        setUploadingState(false)
        setProgress(0)
        setUploadMode(null)
      }
    },
    [postId, userId, thumbnail, additionalImages, onThumbnailChange, onVideoUrlChange, onAdditionalImagesChange, generateImageSeo]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (uploadMode) void handleFiles(accepted, uploadMode)
    },
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.webm'],
    },
    maxFiles: 6,
    disabled: uploading || !uploadMode,
    noClick: true,
  })

  const triggerUpload = (mode: 'replace' | 'additional') => {
    setUploadMode(mode)
    // Küçük timeout: state güncellenince fileInput'u tetikle
    setTimeout(() => fileInputRef.current?.click(), 50)
  }

  const handleLinkAdd = async () => {
    const url = linkInput.trim()
    if (!url) return

    setLinkLoading(true)
    try {
      // Doğrudan / CDN görsel → Storage import (uzantısız gstatic vb. dahil)
      if (isDirectImageUrl(url)) {
        const { importMediaFromUrl } = await import('@/lib/adminVideoScrapeClient')
        const data = await importMediaFromUrl(url)

        if (data.type === 'video') {
          onVideoUrlChange(data.url)
          toast.success('Video eklendi')
        } else if (!thumbnail) {
          onThumbnailChange(data.url)
          toast.success('Ana görsel eklendi')
          void generateImageSeo(data.url, 'thumbnail')
        } else {
          const nextAdditional = [...additionalImages, { url: data.url, caption: '' }]
          onAdditionalImagesChange(nextAdditional)
          toast.success('Ek görsel eklendi')
          void generateImageSeo(data.url, 'additional', nextAdditional)
        }
        setLinkInput('')
        return
      }

      // YouTube / sayfa / MP4 → video scrap; başarısızsa görsel import dene
      try {
        const scraped = await scrapeVideoUrl(url, { download: true })
        onVideoUrlChange(scraped.playUrl)
        if (scraped.thumbnailUrl && !thumbnail) {
          onThumbnailChange(scraped.thumbnailUrl)
        }
        setLinkInput('')
        toast.success(
          scraped.source === 'page' ? 'Sayfadan video alındı' : 'Video eklendi'
        )
      } catch (videoErr) {
        const { importMediaFromUrl } = await import('@/lib/adminVideoScrapeClient')
        try {
          const data = await importMediaFromUrl(url)
          if (data.type === 'video') {
            onVideoUrlChange(data.url)
            toast.success('Video eklendi')
          } else if (!thumbnail) {
            onThumbnailChange(data.url)
            toast.success('Ana görsel eklendi')
            void generateImageSeo(data.url, 'thumbnail')
          } else {
            const nextAdditional = [...additionalImages, { url: data.url, caption: '' }]
            onAdditionalImagesChange(nextAdditional)
            toast.success('Ek görsel eklendi')
            void generateImageSeo(data.url, 'additional', nextAdditional)
          }
          setLinkInput('')
        } catch {
          throw videoErr instanceof Error
            ? videoErr
            : new Error('Sayfa veya video alınamadı. Doğrudan YouTube / MP4 linki veya görsel URL deneyin.')
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Medya yüklenemedi')
    } finally {
      setLinkLoading(false)
    }
  }

  /** Ek görseli ana görsel yap — mevcut thumbnail ek görseller listesine taşınır */
  const makeMain = (index: number) => {
    const item = additionalImages[index]
    const newAdditional = additionalImages.filter((_, i) => i !== index)
    if (thumbnail) {
      newAdditional.unshift({ url: thumbnail, caption: '' })
    }
    onThumbnailChange(item.url)
    onAdditionalImagesChange(newAdditional)
    toast.success('Ana görsel değiştirildi')
  }

  const removeAdditional = (index: number) => {
    onAdditionalImagesChange(additionalImages.filter((_, i) => i !== index))
  }

  const updateCaption = (index: number, caption: string) => {
    const updated = additionalImages.map((img, i) => i === index ? { ...img, caption } : img)
    onAdditionalImagesChange(updated)
  }

  const isYouTube = isEmbedPlayerUrl(videoUrl)

  return (
    <div className="space-y-4">
      {/* ── Dosya input (gizli) ────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={uploadMode === 'additional'}
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          if (uploadMode) void handleFiles(Array.from(e.target.files ?? []), uploadMode)
          e.target.value = ''
        }}
      />

      {/* ── Ana Görsel ──────────────────────────────────────── */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-muted))]">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          Ana Görsel (Kapak)
        </p>

        {thumbnail ? (
          <>
            <div className="relative overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
              <SafePreviewImage
                src={thumbnail}
                alt="Kapak görseli"
                className="max-h-48 w-full rounded-xl object-cover"
              />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => triggerUpload('replace')}
                  disabled={uploading}
                  className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                  title="Ana görseli değiştir"
                >
                  <Pencil className="h-3 w-3" />
                  Değiştir
                </button>
                <button
                  type="button"
                  onClick={() => onThumbnailChange('')}
                  disabled={uploading}
                  className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                  title="Ana görseli kaldır"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="absolute left-2 top-2">
                <span className="flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Star className="h-2.5 w-2.5" /> Ana Görsel
                </span>
              </div>
            </div>
            <div className="mt-2 px-1">
              <div className="relative">
                <input
                  type="text"
                  value={thumbnailCaption}
                  onChange={(e) => onThumbnailCaptionChange(e.target.value)}
                  placeholder="SEO görsel açıklaması"
                  className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 pr-9 text-xs text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {seoGeneratingUrl === thumbnail && (
                  <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-blue-500" />
                )}
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => triggerUpload('replace')}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-8 text-sm font-semibold text-[rgb(var(--color-muted))] hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            <ImageIcon className="h-5 w-5" />
            Ana görsel yükle
          </button>
        )}
      </div>

      {/* ── Ek Görseller ────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-muted))]">
            <ImageIcon className="h-3.5 w-3.5" />
            Ek Görseller
            {additionalImages.length > 0 && (
              <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {additionalImages.length}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => triggerUpload('additional')}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ek görsel ekle
          </button>
        </div>

        {/* Yükleniyor durumu */}
        {uploading && (
          <div className="mb-3 flex flex-col items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-[rgb(var(--color-text))]">
              Yükleniyor… %{Math.round(progress)}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--color-border))]">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Sürükle & bırak alanı (drag active göstergesi) */}
        <div
          {...getRootProps()}
          className={`${isDragActive && uploadMode ? 'block' : 'hidden'} rounded-xl border-2 border-dashed border-blue-500 bg-blue-50 p-5 text-center dark:bg-blue-950`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2 text-blue-600">
            <Upload className="h-8 w-8" />
            <p className="font-semibold">Dosyayı buraya bırakın...</p>
          </div>
        </div>

        {/* Ek görseller listesi */}
        {additionalImages.length > 0 ? (
          <div className="space-y-3">
            {additionalImages.map((img, index) => (
              <div
                key={`${img.url}-${index}`}
                className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]"
              >
                <div className="relative">
                  <SafePreviewImage
                    src={img.url}
                    alt={`Ek görsel ${index + 1}`}
                    className="max-h-40 w-full object-cover"
                  />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => makeMain(index)}
                      className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 transition-colors"
                      title="Ana görsel olarak işaretle"
                    >
                      <Star className="h-3 w-3" />
                      Ana yap
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAdditional(index)}
                      className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600 transition-colors"
                      title="Görseli kaldır"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="absolute left-2 top-2">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                      #{index + 1}
                    </span>
                  </div>
                </div>
                {/* Görsel açıklaması */}
                <div className="px-3 py-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={img.caption ?? ''}
                      onChange={(e) => updateCaption(index, e.target.value)}
                      placeholder="SEO görsel açıklaması"
                      className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 pr-9 text-xs text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {seoGeneratingUrl === img.url && (
                      <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-blue-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-[rgb(var(--color-muted))]">
            Henüz ek görsel yok — paragraflar arasına yerleştirilecek görseller için &quot;Ek görsel ekle&quot; butonunu kullanın
          </p>
        )}
      </div>

      {/* ── Video ───────────────────────────────────────────── */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-muted))]">
          <Video className="h-3.5 w-3.5" />
          Video
        </p>

        {videoUrl && (
          <div className="relative mb-3 overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
            {isYouTube ? (
              <div className="aspect-video w-full">
                <iframe
                  src={videoUrl.includes('?') ? `${videoUrl}&rel=0` : `${videoUrl}?rel=0&modestbranding=1`}
                  title="Video önizleme"
                  className="h-full w-full border-0"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
              <VideoPlayer src={videoUrl} />
            )}
            <div className="absolute right-2 top-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => onVideoUrlChange('')}
                className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600 transition-colors"
                title="Videoyu kaldır"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="absolute left-2 top-2">
              <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                {isYouTube
                  ? <><Youtube className="h-3 w-3 text-red-400" /> YouTube</>
                  : <><Video className="h-3 w-3" /> Video</>}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => triggerUpload('additional')}
          disabled={uploading}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-4 text-sm font-semibold text-[rgb(var(--color-muted))] hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          <Video className="h-4 w-4" />
          Video yükle (MP4 / WebM)
        </button>

        {/* URL / YouTube linki */}
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-text))]">
            <Link2 className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
            URL&apos;den görsel / video scrap
            <span className="font-normal text-[rgb(var(--color-muted))]">
              · Görsel, YouTube, haber sayfası veya video
            </span>
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleLinkAdd() } }}
              disabled={linkLoading}
              placeholder="Görsel, YouTube veya haber sayfası URL yapıştır…"
              className="flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void handleLinkAdd()}
              disabled={!linkInput.trim() || linkLoading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {linkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Scrap'}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[rgb(var(--color-muted))]">
            Görsel CDN / Google thumbnail · YouTube / Vimeo · Sayfadan video · MP4 Storage&apos;a kopyalanır
          </p>
        </div>
      </div>
    </div>
  )
}
