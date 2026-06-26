'use client'

import { useState } from 'react'
import { Link2, Loader2, X, Youtube, Image as ImageIcon, Video } from 'lucide-react'
import toast from 'react-hot-toast'

// ── YouTube URL → embed dönüşümü ───────────────────────────────────────────
function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v'))
      return u.searchParams.get('v')
    if (u.hostname === 'youtu.be')
      return u.pathname.slice(1).split('?')[0] || null
    const m = u.pathname.match(/\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[2]
  } catch { /* geçersiz URL */ }
  return null
}

export function toYouTubeEmbed(url: string): string | null {
  const id = parseYouTubeId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname.includes('youtube.com') || u.hostname === 'youtu.be'
  } catch { return false }
}

function guessMediaType(url: string): 'image' | 'video' | 'youtube' | 'unknown' {
  if (isYouTubeUrl(url)) return 'youtube'
  const lower = url.toLowerCase().split('?')[0]
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(lower)) return 'image'
  if (/\.(mp4|webm|mov|avi)$/.test(lower)) return 'video'
  return 'unknown'
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

    if (type === 'youtube') {
      const embedUrl = toYouTubeEmbed(url)
      if (!embedUrl) { toast.error('Geçerli bir YouTube linki değil'); return }
      setPreview({ type: 'youtube', url: embedUrl })
      onVideoUrlChange(embedUrl)
      setInput('')
      toast.success('YouTube videosu eklendi')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/media/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        credentials: 'include',
      })
      const data = await res.json() as { url?: string; type?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Medya yüklenemedi')

      const storedType = data.type === 'video' ? 'video' : 'image'
      setPreview({ type: storedType, url: data.url })
      if (storedType === 'image') {
        onThumbnailChange(data.url)
        toast.success("Görsel Storage'a yüklendi")
      } else {
        onVideoUrlChange(data.url)
        toast.success("Video Storage'a yüklendi")
      }
      setInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Medya yüklenemedi')
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
        Medya linki ekle
        <span className="font-normal text-[rgb(var(--color-muted))]">· görsel URL, video URL veya YouTube</span>
      </p>

      {/* Önizleme */}
      {preview && (
        <div className="mb-2.5 overflow-hidden rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-2.5 py-1.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
              {preview.type === 'youtube'
                ? <><Youtube className="h-3 w-3 text-red-500" /> YouTube</>
                : preview.type === 'video'
                  ? <><Video className="h-3 w-3" /> Video (Storage)</>
                  : <><ImageIcon className="h-3 w-3" /> Görsel (Storage)</>}
            </span>
            <button type="button" onClick={handleRemove}
              className="rounded-full p-0.5 text-[rgb(var(--color-muted))] hover:text-red-600"
              aria-label="Kaldır">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {preview.type === 'youtube' ? (
            <div className="aspect-video w-full">
              <iframe
                src={`${preview.url}?rel=0&modestbranding=1`}
                title="YouTube Önizleme"
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
            <video src={preview.url} controls className="max-h-48 w-full" />
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
          placeholder="https://youtube.com/watch?v=... veya görsel/video URL"
          className="flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!input.trim() || loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ekle'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-[rgb(var(--color-muted))]">
        YouTube linki direkt oynatılır · Diğer linkler Firebase Storage&apos;a kopyalanır
      </p>
    </div>
  )
}
