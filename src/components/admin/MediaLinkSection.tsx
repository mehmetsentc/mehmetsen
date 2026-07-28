'use client'

import { useState } from 'react'
import { Link2, Loader2, X, Youtube, Image as ImageIcon, Video } from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { isDirectImageUrl, scrapeVideoUrl } from '@/lib/adminVideoScrapeClient'
import { parseYouTubeVideoId } from '@/lib/postUtils'
import { isEmbedPlayerUrl } from '@/lib/videoEmbed'

/** @deprecated — scrapeVideoUrl kullan; geriye uyumluluk için tutuldu */
export function toYouTubeEmbed(url: string): string | null {
  const id = parseYouTubeVideoId(url)
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
}

function guessMediaType(url: string): 'image' | 'video' | 'page' {
  if (isDirectImageUrl(url)) return 'image'
  const lower = url.toLowerCase().split('?')[0]
  if (/\.(mp4|webm|mov|avi)$/.test(lower)) return 'video'
  if (parseYouTubeVideoId(url)) return 'video'
  return 'page'
}

// ── Props ──────────────────────────────────────────────────────────────────
interface MediaLinkSectionProps {
  /** Görsel storage URL değişince çağrılır */
  onThumbnailChange: (url: string) => void
  /** Video/embed URL değişince çağrılır */
  onVideoUrlChange: (url: string) => void
}

interface LinkPreview {
  type: 'image' | 'video' | 'youtube'
  url: string
  thumbnailUrl?: string | null
}

// ── Component ──────────────────────────────────────────────────────────────
export function MediaLinkSection({ onThumbnailChange, onVideoUrlChange }: MediaLinkSectionProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<LinkPreview | null>(null)

  const handleAdd = async () => {
    const url = input.trim()
    if (!url) return

    const type = guessMediaType(url)

    if (type === 'image') {
      setLoading(true)
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) { toast.error('Giriş gerekli'); return }
        const res = await fetch('/api/admin/media/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url }),
        })
        const data = await res.json() as { url?: string; type?: string; error?: string }
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Medya yüklenemedi')
        setPreview({ type: 'image', url: data.url })
        onThumbnailChange(data.url)
        toast.success("Görsel Storage'a yüklendi")
        setInput('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Medya yüklenemedi')
      } finally {
        setLoading(false)
      }
      return
    }

    // Video / sayfa scrap (YouTube, Vimeo, haber sayfası, MP4…) — olmazsa görsel import
    setLoading(true)
    try {
      try {
        const scraped = await scrapeVideoUrl(url, { download: true })
        const previewType =
          scraped.provider === 'youtube' || isEmbedPlayerUrl(scraped.playUrl)
            ? 'youtube'
            : 'video'
        setPreview({
          type: previewType,
          url: scraped.playUrl,
          thumbnailUrl: scraped.thumbnailUrl,
        })
        onVideoUrlChange(scraped.playUrl)
        if (scraped.thumbnailUrl) onThumbnailChange(scraped.thumbnailUrl)
        setInput('')
        toast.success(
          scraped.provider === 'youtube'
            ? 'YouTube videosu eklendi'
            : scraped.source === 'page'
              ? 'Sayfadan video alındı'
              : 'Video eklendi'
        )
      } catch (videoErr) {
        const { importMediaFromUrl } = await import('@/lib/adminVideoScrapeClient')
        const data = await importMediaFromUrl(url)
        if (data.type === 'video') {
          setPreview({ type: 'video', url: data.url })
          onVideoUrlChange(data.url)
          toast.success('Video eklendi')
        } else {
          setPreview({ type: 'image', url: data.url })
          onThumbnailChange(data.url)
          toast.success("Görsel Storage'a yüklendi")
        }
        setInput('')
        if (!data.url) throw videoErr
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Medya alınamadı')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = () => {
    if (!preview) return
    if (preview.type === 'image') onThumbnailChange('')
    else onVideoUrlChange('')
    setPreview(null)
  }

  return (
    <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
      <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-[rgb(var(--color-text))]">
        <Link2 className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
        Medya / video scrap
        <span className="font-normal text-[rgb(var(--color-muted))]">
          · YouTube, Vimeo, haber sayfası veya doğrudan video
        </span>
      </p>

      {preview && (
        <div className="mb-2.5 overflow-hidden rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-2.5 py-1.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
              {preview.type === 'youtube'
                ? <><Youtube className="h-3 w-3 text-red-500" /> Embed video</>
                : preview.type === 'video'
                  ? <><Video className="h-3 w-3" /> Video</>
                  : <><ImageIcon className="h-3 w-3" /> Görsel</>}
            </span>
            <button type="button" onClick={handleRemove}
              className="rounded-full p-0.5 text-[rgb(var(--color-muted))] hover:text-red-600"
              aria-label="Kaldır">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {preview.type === 'youtube' || isEmbedPlayerUrl(preview.url) ? (
            <div className="aspect-video w-full">
              <iframe
                src={preview.url.includes('?') ? `${preview.url}&rel=0` : `${preview.url}?rel=0&modestbranding=1`}
                title="Video Önizleme"
                className="h-full w-full border-0"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          ) : preview.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="Önizleme" className="max-h-48 w-full object-cover" />
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={preview.url} controls poster={preview.thumbnailUrl ?? undefined} className="max-h-48 w-full" />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }}
          disabled={loading}
          placeholder="YouTube, haber sayfası veya video URL yapıştır…"
          className="flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!input.trim() || loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Scrap'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-[rgb(var(--color-muted))]">
        YouTube / Vimeo embed · Haber sayfasından video çıkar · MP4 Storage&apos;a kopyalanır
      </p>
    </div>
  )
}
