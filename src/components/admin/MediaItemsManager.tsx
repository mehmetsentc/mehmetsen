'use client'

import { useCallback, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Video as VideoIcon,
  X,
  Youtube,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { storageService } from '@/services/storageService'
import { postService } from '@/services/postService'
import { isDirectImageUrl, scrapeVideoUrl } from '@/lib/adminVideoScrapeClient'
import { parseYouTubeVideoId } from '@/lib/postUtils'
import type { MediaItem } from '@/types/post'

/**
 * ── MediaItemsManager ────────────────────────────────────────────────
 *
 * Çoklu görsel + video yöneticisi. Hem dosya yükleme hem URL/Embed ekleme
 * destekler. Items sıralı tutulur — ilk eleman cover sayılır, video
 * varsa daima en üstte gösterilir.
 *
 * Davranış:
 *   - Birden fazla görsel eklenebilir (gallery)
 *   - Tek video desteklenir (YouTube embed, Vimeo, sayfa scrape veya MP4)
 *   - Her item için caption + alt + credit girilebilir
 *   - ↑/↓ ile manuel sıra, çöp kutusu ile silme
 *   - "AI ile Sırala" → /api/admin/news/ai-image-placement
 *
 * Item çıkışı stabil sıralıdır; render tarafı sıraya göre yerleştirir.
 */

function guessMediaType(url: string): 'image' | 'video' | 'page' {
  if (isDirectImageUrl(url)) return 'image'
  const lower = url.toLowerCase().split('?')[0]
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return 'video'
  if (parseYouTubeVideoId(url)) return 'video'
  return 'page'
}

// ── Props ───────────────────────────────────────────────────────────────
interface MediaItemsManagerProps {
  value: MediaItem[]
  onChange: (items: MediaItem[]) => void
  /** Storage upload path requires userId + draftId; we lazy-create a draft per upload session. */
  userId: string
  username: string
  /** Article content used for AI ordering. Optional. */
  articleContent?: string
  articleTitle?: string
}

const MAX_FILE_BYTES = 50 * 1024 * 1024

// ── Component ───────────────────────────────────────────────────────────
export function MediaItemsManager({
  value,
  onChange,
  userId,
  username,
  articleContent,
  articleTitle,
}: MediaItemsManagerProps) {
  const [linkInput, setLinkInput] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [aiSorting, setAiSorting] = useState(false)
  const [progress, setProgress] = useState(0)
  const draftIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Mutations ─────────────────────────────────────────────────────────
  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const moveAt = (index: number, delta: -1 | 1) => {
    const next = index + delta
    if (next < 0 || next >= value.length) return
    const reordered = [...value]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(next, 0, moved)
    onChange(reordered)
  }

  const patchAt = (index: number, patch: Partial<MediaItem>) => {
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  // ── Draft ID for storage upload paths ─────────────────────────────────
  const ensureDraftId = useCallback(async (): Promise<string> => {
    if (draftIdRef.current) return draftIdRef.current
    const id = await postService.createDraftNews({
      author: username,
      authorId: userId,
      type: 'news',
    })
    draftIdRef.current = id
    return id
  }, [userId, username])

  // ── File upload (multi) ───────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      const tooBig = list.find((f) => f.size > MAX_FILE_BYTES)
      if (tooBig) {
        toast.error(`${tooBig.name}: 50MB sınırını aşıyor`)
        return
      }

      setFileLoading(true)
      setProgress(0)
      try {
        const draftId = await ensureDraftId()
        const uploaded: MediaItem[] = []
        for (let i = 0; i < list.length; i++) {
          const file = list[i]
          const isImage = file.type.startsWith('image/')
          const isVideo = file.type.startsWith('video/')
          if (!isImage && !isVideo) {
            toast.error(`${file.name}: desteklenmeyen tür`)
            continue
          }
          const url = isVideo
            ? await storageService.uploadPostVideo(file, userId, draftId, (p) => setProgress(p))
            : await storageService.uploadPostImage(file, userId, draftId, (p) => setProgress(p))
          uploaded.push({
            type: isVideo ? 'video' : 'image',
            url,
            thumbnailUrl: isImage ? url : null,
            caption: null,
            alt: null,
            credit: null,
          })
        }
        if (uploaded.length > 0) {
          const merged = [...value, ...uploaded.filter((u) => !value.some((m) => m.url === u.url))]
          onChange(merged)
          toast.success(`${uploaded.length} medya eklendi`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Yükleme başarısız'
        toast.error(msg)
      } finally {
        setFileLoading(false)
        setProgress(0)
      }
    },
    [ensureDraftId, onChange, userId, value]
  )

  // ── Link / URL ekleme (tek veya çoklu — satır/virgül/boşluk ile) ─────
  /**
   * Bir tek URL'i işler ve eklenecek MediaItem'ı döndürür. Storage'a
   * indirme veya YouTube embed dönüşümü burada yapılır. Hata durumunda
   * `null` döner ve toast atılır.
   */
  const importSingleUrl = useCallback(
    async (rawUrl: string, token: string | null): Promise<MediaItem | null> => {
      const url = rawUrl.trim()
      if (!url) return null
      const kind = guessMediaType(url)

      // Görsel → mevcut import endpoint
      if (kind === 'image') {
        if (!token) {
          toast.error('Giriş gerekli')
          return null
        }
        const res = await fetch('/api/admin/media/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url }),
        })
        const data = (await res.json()) as { url?: string; type?: string; error?: string }
        if (!res.ok || !data.url) {
          toast.error(data.error ?? `Yüklenemedi: ${url.slice(0, 40)}`)
          return null
        }
        return {
          type: 'image',
          url: data.url,
          thumbnailUrl: data.url,
          caption: null,
          alt: null,
          credit: null,
        }
      }

      // YouTube, Vimeo, haber sayfası, MP4… → video scrap; olmazsa görsel import
      try {
        const scraped = await scrapeVideoUrl(url, { download: true })
        return {
          type: 'video',
          url: scraped.playUrl,
          thumbnailUrl: scraped.thumbnailUrl,
          caption: scraped.title,
          alt: null,
          credit: scraped.provider !== 'unknown' ? scraped.provider : null,
        }
      } catch {
        try {
          const { importMediaFromUrl } = await import('@/lib/adminVideoScrapeClient')
          const data = await importMediaFromUrl(url)
          return {
            type: data.type === 'video' ? 'video' : 'image',
            url: data.url,
            thumbnailUrl: data.url,
            caption: null,
            alt: null,
            credit: null,
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Medya alınamadı: ${url.slice(0, 40)}`)
          return null
        }
      }
    },
    []
  )

  const handleAddLink = useCallback(async () => {
    const trimmed = linkInput.trim()
    if (!trimmed) return

    // Birden fazla URL'i tek seferde işle: satır/virgül/boşluk ayraçları.
    // Aynı işlemde HEM tek URL HEM çoklu paste destekleniyor; URL içinde
    // boşluk olmadığı için bu ayırma güvenli.
    const urls = trimmed
      .split(/[\s,;\n\r]+/g)
      .map((u) => u.trim())
      .filter(Boolean)

    if (urls.length === 0) return

    setLinkLoading(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? null
      const newItems: MediaItem[] = []
      for (const url of urls) {
        if (value.some((m) => m.url === url) || newItems.some((m) => m.url === url)) {
          toast(`Zaten eklenmiş: ${url.slice(0, 40)}`)
          continue
        }
        const item = await importSingleUrl(url, token)
        if (item) {
          // URL alanına yapıştırılan embed/storage URL aynı olabilir — son
          // bir dedup kontrolü.
          if (
            !value.some((m) => m.url === item.url) &&
            !newItems.some((m) => m.url === item.url)
          ) {
            newItems.push(item)
          }
        }
      }
      if (newItems.length > 0) {
        onChange([...value, ...newItems])
        setLinkInput('')
        toast.success(
          newItems.length === 1
            ? `${newItems[0].type === 'image' ? 'Görsel' : 'Video'} eklendi`
            : `${newItems.length} medya eklendi`
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Medya yüklenemedi')
    } finally {
      setLinkLoading(false)
    }
  }, [importSingleUrl, linkInput, onChange, value])

  // ── AI ile sırala ─────────────────────────────────────────────────────
  const handleAiSort = useCallback(async () => {
    const images = value.filter((m) => m.type === 'image')
    if (images.length < 2) {
      toast('AI sıralama için en az 2 görsel ekleyin')
      return
    }
    const content = (articleContent ?? '').trim()
    if (content.length < 80) {
      toast('İçerik henüz çok kısa; yine de AI sırası deneniyor')
    }
    setAiSorting(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { toast.error('Giriş gerekli'); return }
      const res = await fetch('/api/admin/news/ai-image-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: articleTitle ?? '',
          content,
          images: images.map((m) => ({
            url: m.url,
            caption: m.caption ?? '',
            alt: m.alt ?? '',
          })),
        }),
      })
      const data = (await res.json()) as { order?: string[]; captions?: Record<string, string>; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'AI sıralama başarısız')

      const orderMap = new Map<string, number>()
      data.order?.forEach((url, idx) => orderMap.set(url, idx))

      const sortedImages = [...images].sort((a, b) => {
        const ai = orderMap.has(a.url) ? orderMap.get(a.url)! : 99
        const bi = orderMap.has(b.url) ? orderMap.get(b.url)! : 99
        return ai - bi
      })
      const captions = data.captions ?? {}
      const withCaptions = sortedImages.map((m) => ({
        ...m,
        caption: m.caption || captions[m.url] || null,
      }))

      const videos = value.filter((m) => m.type === 'video')
      // Video her zaman tepede kalır
      onChange([...videos, ...withCaptions])
      toast.success('Görseller AI tarafından sıralandı')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI sıralama başarısız')
    } finally {
      setAiSorting(false)
    }
  }, [articleContent, articleTitle, onChange, value])

  // ── Render ────────────────────────────────────────────────────────────
  const busy = fileLoading || linkLoading

  return (
    <div className="space-y-4">
      {/* ── Items list ─────────────────────────────────────────────── */}
      {value.length > 0 && (
        <ol className="space-y-2">
          {value.map((item, index) => {
            const isYoutube = item.type === 'video' && /youtube|youtu\.be/.test(item.url)
            return (
              <li
                key={item.url}
                className="flex items-start gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3"
              >
                {/* Sıra rozeti */}
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="rounded-md bg-[rgb(var(--color-brand))]/10 px-1.5 py-0.5 text-[10px] font-black text-[rgb(var(--color-brand))]">
                    {index === 0 ? 'KAPAK' : `#${index + 1}`}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveAt(index, -1)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-[rgb(var(--color-muted))] hover:bg-white/5 disabled:opacity-30"
                      aria-label="Yukarı taşı"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAt(index, 1)}
                      disabled={index === value.length - 1}
                      className="rounded p-0.5 text-[rgb(var(--color-muted))] hover:bg-white/5 disabled:opacity-30"
                      aria-label="Aşağı taşı"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Önizleme */}
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.alt ?? ''} className="h-full w-full object-cover" />
                  ) : isYoutube ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Youtube className="h-8 w-8 text-red-500" />
                    </div>
                  ) : (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={item.url} className="h-full w-full object-cover" />
                  )}
                </div>

                {/* Bilgi alanları */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                    {item.type === 'image' ? (
                      <><ImageIcon className="h-3 w-3" /> Görsel</>
                    ) : isYoutube ? (
                      <><Youtube className="h-3 w-3 text-red-500" /> YouTube</>
                    ) : (
                      <><VideoIcon className="h-3 w-3" /> Video</>
                    )}
                  </div>
                  <input
                    type="text"
                    value={item.caption ?? ''}
                    onChange={(e) => patchAt(index, { caption: e.target.value })}
                    placeholder="Altyazı (opsiyonel)"
                    className="w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1 text-xs text-[rgb(var(--color-text))]"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={item.alt ?? ''}
                      onChange={(e) => patchAt(index, { alt: e.target.value })}
                      placeholder="Alt metin (SEO)"
                      className="rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1 text-xs text-[rgb(var(--color-text))]"
                    />
                    <input
                      type="text"
                      value={item.credit ?? ''}
                      onChange={(e) => patchAt(index, { credit: e.target.value })}
                      placeholder="Kaynak / Fotoğrafçı"
                      className="rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-1 text-xs text-[rgb(var(--color-text))]"
                    />
                  </div>
                </div>

                {/* Sil */}
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  className="shrink-0 rounded-full p-1 text-[rgb(var(--color-muted))] hover:bg-red-500/10 hover:text-red-500"
                  aria-label="Sil"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {value.length === 0 && (
        <p className="rounded-xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 text-center text-xs text-[rgb(var(--color-muted))]">
          Henüz medya eklenmedi. Dosya yükleyebilir veya URL ekleyebilirsiniz.
        </p>
      )}

      {/* ── Aksiyon paneli ─────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Dosya yükle */}
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-[rgb(var(--color-text))]">
            <Plus className="h-3.5 w-3.5" />
            Dosyadan yükle
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            multiple
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 text-sm font-medium text-[rgb(var(--color-text))] hover:border-[rgb(var(--color-muted))] disabled:opacity-50"
          >
            {fileLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Yükleniyor… %{Math.round(progress)}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Birden fazla seç
              </>
            )}
          </button>
          <p className="mt-1.5 text-[10px] text-[rgb(var(--color-muted))]">
            JPG/PNG/WebP/GIF/MP4/WebM · max 50MB · çoklu seçim
          </p>
        </div>

        {/* Link ekle — tek veya çoklu (satır/virgül/boşluk ile) */}
        <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-[rgb(var(--color-text))]">
            <Link2 className="h-3.5 w-3.5" />
            URL / video scrap
            <span className="font-normal text-[rgb(var(--color-muted))]">· YouTube, sayfa veya MP4</span>
          </label>
          <div className="flex flex-col gap-2">
            <textarea
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter ile gönder (textarea içinde plain Enter yeni satır açar)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void handleAddLink()
                }
              }}
              disabled={linkLoading}
              placeholder={'YouTube / haber sayfası / video URL\n(çoklu satır desteklenir)'}
              rows={3}
              className="w-full resize-y rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))]"
            />
            <button
              type="button"
              onClick={() => void handleAddLink()}
              disabled={!linkInput.trim() || linkLoading}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {linkLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scrap ediliyor…
                </>
              ) : (
                'Scrap / Ekle'
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[rgb(var(--color-muted))]">
            YouTube / Vimeo embed · Haber sayfasından video scrap · MP4 Storage&apos;a kopyalanır
          </p>
        </div>
      </div>

      {/* AI sırala */}
      {value.filter((m) => m.type === 'image').length >= 2 && (
        <button
          type="button"
          onClick={() => void handleAiSort()}
          disabled={aiSorting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-sm font-semibold text-purple-300 hover:bg-purple-500/15 disabled:opacity-50"
        >
          {aiSorting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI sıralanıyor…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AI ile içeriğe göre sırala ve altyazı öner
            </>
          )}
        </button>
      )}
    </div>
  )
}
