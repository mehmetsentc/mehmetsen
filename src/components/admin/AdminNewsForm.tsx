'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MediaUploader, type MediaUploadState } from '@/components/post/MediaUploader'
import { MediaLinkSection } from '@/components/admin/MediaLinkSection'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Başlık gerekli')
      return
    }
    if (media.uploading) {
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
        {(media.thumbnail || media.videoUrl) && (
          <p className="text-xs text-green-600 dark:text-green-400">
            {media.videoUrl ? '✓ Video yüklendi' : '✓ Görsel yüklendi'}
          </p>
        )}

        {/* Link Ekle (görsel, video veya YouTube) */}
        <MediaLinkSection
          onThumbnailChange={(url) => setMedia((prev) => ({ ...prev, thumbnail: url }))}
          onVideoUrlChange={(url) => setMedia((prev) => ({ ...prev, videoUrl: url }))}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Kaydediliyor...' : mode === 'create' ? 'Yayınla' : 'Güncelle'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          İptal
        </Button>
      </div>
    </form>
  )
}
