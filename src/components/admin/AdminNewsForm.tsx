'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Link2, Loader2, X, Youtube, Image as ImageIcon, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MediaUploader, type MediaUploadState } from '@/components/post/MediaUploader'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { adminNewsService } from '@/services/adminNewsService'
import type { Post, PostStatus } from '@/types/post'

interface AdminNewsFormProps {
  mode: 'create' | 'edit'
  post?: Post
  userId: string
  username: string
}

// ── YouTube URL → embed URL dönüşümü ──────────────────────────────────────
function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    // youtube.com/watch?v=ID
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return u.searchParams.get('v')
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null
    }
    // youtube.com/shorts/ID veya /embed/ID
    const m = u.pathname.match(/\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[2]
  } catch {
    // geçersiz URL
  }
  return null
}

function toYouTubeEmbed(url: string): string | null {
  const id = parseYouTubeId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname.includes('youtube.com') || u.hostname === 'youtu.be'
  } catch {
    return false
  }
}

function guessMediaType(url: string): 'image' | 'video' | 'youtube' | 'unknown' {
  if (isYouTubeUrl(url)) return 'youtube'
  const lower = url.toLowerCase().split('?')[0]
  if (/\.(jpe?g|png|gif|webp|svg)$/.test(lower)) return 'image'
  if (/\.(mp4|webm|mov|avi)$/.test(lower)) return 'video'
  return 'unknown'
}

export function AdminNewsForm({ mode, post, userId, username }: AdminNewsFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(post?.title ?? '')
  const [description, setDescription] = useState(post?.content ?? '')
  const [spot, setSpot] = useState(post?.spot ?? '')
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? '')
  const [category, setCategory] = useState(post?.categoryId ?? '')
  const [city, setCity] = useState(post?.city ?? '')
  const [status, setStatus] = useState<PostStatus>(post?.status ?? 'published')
  const [saving, setSaving] = useState(false)
  const [media, setMedia] = useState<MediaUploadState>({
    uploading: false,
    progress: 0,
    thumbnail: post?.coverImageUrl ?? '',
    videoUrl: post?.mediaItems?.find((m) => m.type === 'video')?.url ?? '',
    draftId: null,
  })

  // Medya link girişi
  const [mediaLinkInput, setMediaLinkInput] = useState('')
  const [mediaLinkLoading, setMediaLinkLoading] = useState(false)
  // Önizleme: { type: 'image'|'video'|'youtube', url: string }
  const [mediaLinkPreview, setMediaLinkPreview] = useState<{
    type: 'image' | 'video' | 'youtube'
    url: string        // storage URL (image/video) veya embed URL (youtube)
    originalUrl: string
  } | null>(null)

  const handleAddMediaLink = async () => {
    const url = mediaLinkInput.trim()
    if (!url) return

    const type = guessMediaType(url)

    // YouTube → storage'a yükleme yok, direkt embed URL
    if (type === 'youtube') {
      const embedUrl = toYouTubeEmbed(url)
      if (!embedUrl) {
        toast.error('Geçerli bir YouTube linki değil')
        return
      }
      setMediaLinkPreview({ type: 'youtube', url: embedUrl, originalUrl: url })
      setMedia((prev) => ({ ...prev, videoUrl: embedUrl }))
      setMediaLinkInput('')
      toast.success('YouTube videosu eklendi')
      return
    }

    // Görsel veya video URL → server-side indir ve storage'a yükle
    setMediaLinkLoading(true)
    try {
      const res = await fetch('/api/admin/media/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        credentials: 'include',
      })
      const data = await res.json() as { url?: string; type?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Medya yüklenemedi')
      }
      const storedUrl = data.url
      const storedType = data.type === 'video' ? 'video' : 'image'
      setMediaLinkPreview({ type: storedType, url: storedUrl, originalUrl: url })
      if (storedType === 'image') {
        setMedia((prev) => ({ ...prev, thumbnail: storedUrl }))
        toast.success('Görsel Storage\'a yüklendi')
      } else {
        setMedia((prev) => ({ ...prev, videoUrl: storedUrl }))
        toast.success('Video Storage\'a yüklendi')
      }
      setMediaLinkInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Medya yüklenemedi')
    } finally {
      setMediaLinkLoading(false)
    }
  }

  const removeMediaLink = () => {
    if (!mediaLinkPreview) return
    if (mediaLinkPreview.type === 'image') {
      setMedia((prev) => ({ ...prev, thumbnail: '' }))
    } else {
      setMedia((prev) => ({ ...prev, videoUrl: '' }))
    }
    setMediaLinkPreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Başlık gerekli')
      return
    }
    if (media.uploading || mediaLinkLoading) {
      toast.error('Medya yüklemesi devam ediyor')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title,
        description,
        spot,
        seoTitle,
        seoDescription,
        category,
        city,
        thumbnail: media.thumbnail,
        videoUrl: media.videoUrl,
        draftId: media.draftId,
        tags: post?.tags ?? [],
        status,
      }

      if (mode === 'create') {
        await adminNewsService.createAdminNews({
          ...payload,
          authorId: userId,
          authorUsername: username,
        })
        toast.success('Haber yayınlandı')
        router.push(ROUTES.ADMIN.NEWS)
      } else if (post) {
        await adminNewsService.updateAdminNews(post.id, payload)
        toast.success('Haber güncellendi')
        router.push(ROUTES.ADMIN.NEWS)
      }
    } catch (err) {
      console.error(err)
      toast.error('Kaydetme başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Başlık</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Haber başlığı" required />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">İçerik</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Haber metni"
          className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Spot (Özet giriş)</label>
        <textarea
          value={spot}
          onChange={(e) => setSpot(e.target.value)}
          rows={3}
          placeholder="Haberin kısa özet giriş metni"
          className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">SEO Başlık</label>
          <Input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="Arama sonuçlarında görünecek başlık"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">SEO Açıklama</label>
          <Input
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            placeholder="Arama sonuçlarında görünecek kısa açıklama"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))]"
          >
            <option value="">Seçiniz</option>
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Şehir</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="ör. İstanbul" />
        </div>
      </div>

      {mode === 'edit' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">Durum</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PostStatus)}
            className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))]"
          >
            <option value="published">Yayında</option>
            <option value="pending">Onay Bekliyor</option>
            <option value="draft">Taslak</option>
            <option value="archived">Kaldırıldı</option>
          </select>
        </div>
      )}

      {/* ── Medya Bölümü ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">Medya</label>

        {/* Dosya Yükle */}
        <MediaUploader
          mode="news"
          userId={userId}
          authorUsername={username}
          onFilesChange={() => {}}
          autoUploadDraft
          onUploadStateChange={setMedia}
        />
        {(media.thumbnail || media.videoUrl) && !mediaLinkPreview && (
          <p className="text-xs text-green-600 dark:text-green-400">
            {media.videoUrl ? '✓ Video yüklendi' : '✓ Görsel yüklendi'}
          </p>
        )}

        {/* Link Ekle (görsel, video veya YouTube) */}
        <div className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-[rgb(var(--color-text))]">
            <Link2 className="h-4 w-4 text-[rgb(var(--color-muted))]" />
            Veya medya linki ekle
            <span className="ml-1 text-xs font-normal text-[rgb(var(--color-muted))]">
              (görsel URL, video URL veya YouTube linki)
            </span>
          </p>

          {/* Önizleme */}
          {mediaLinkPreview && (
            <div className="mb-3 overflow-hidden rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
              <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-muted))]">
                  {mediaLinkPreview.type === 'youtube' ? (
                    <><Youtube className="h-3.5 w-3.5 text-red-500" /> YouTube videosu</>
                  ) : mediaLinkPreview.type === 'video' ? (
                    <><Video className="h-3.5 w-3.5" /> Video (Storage)</>
                  ) : (
                    <><ImageIcon className="h-3.5 w-3.5" /> Görsel (Storage)</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={removeMediaLink}
                  className="rounded-full p-0.5 text-[rgb(var(--color-muted))] hover:bg-red-50 hover:text-red-600"
                  aria-label="Kaldır"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {mediaLinkPreview.type === 'youtube' ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={`${mediaLinkPreview.url}?rel=0&modestbranding=1`}
                    title="YouTube Önizleme"
                    className="h-full w-full border-0"
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                  />
                </div>
              ) : mediaLinkPreview.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaLinkPreview.url}
                  alt="Önizleme"
                  className="max-h-64 w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={mediaLinkPreview.url}
                  controls
                  className="max-h-64 w-full"
                />
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={mediaLinkInput}
              onChange={(e) => setMediaLinkInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=... veya görsel/video URL"
              className="flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddMediaLink() } }}
              disabled={mediaLinkLoading}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleAddMediaLink()}
              disabled={!mediaLinkInput.trim() || mediaLinkLoading}
              className="shrink-0"
            >
              {mediaLinkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Ekle'
              )}
            </Button>
          </div>

          <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">
            YouTube linki direkt oynatılır · Görsel/video linkler Firebase Storage'a kopyalanır
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving || mediaLinkLoading}>
          {saving ? 'Kaydediliyor...' : mode === 'create' ? 'Yayınla' : 'Güncelle'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          İptal
        </Button>
      </div>
    </form>
  )
}
