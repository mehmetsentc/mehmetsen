'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MediaUploader, type MediaUploadState } from './MediaUploader'
import { TagInput } from './TagInput'
import { useAuth } from '@/hooks/useAuth'
import { storageService } from '@/services/storageService'
import { postService } from '@/services/postService'
import { userService } from '@/services/userService'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { detectCurrentLocation, type PostLocation } from '@/lib/location'
import { getPrivacyPreferences } from '@/lib/userPreferences'
import { moderate, type ModerationMedia } from '@/lib/moderationClient'

const REVIEW_MESSAGE =
  'İçeriğiniz incelemeye alındı, onaylandıktan sonra yayınlanacak.'

const postSchema = z.object({
  title: z
    .string()
    .min(3, 'Başlık en az 3 karakter olmalıdır')
    .max(200, 'Başlık 200 karakterden fazla olmamalıdır'),
  content: z
    .string()
    .min(10, 'İçerik en az 10 karakter olmalıdır')
    .max(5000, 'İçerik 5000 karakterden fazla olmamalıdır'),
  excerpt: z.string().max(200, 'Özet 200 karakterden fazla olmamalıdır').optional(),
  category: z.string().optional(),
})

type PostFormData = z.infer<typeof postSchema>
type CreateMode = 'news' | 'video' | 'photo'

interface PostEditorProps {
  mode?: CreateMode
}

const emptyUploadState: MediaUploadState = {
  uploading: false,
  progress: 0,
  thumbnail: '',
  videoUrl: '',
  draftId: null,
}

export function PostEditor({ mode = 'news' }: PostEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<MediaUploadState>(emptyUploadState)
  const [tags, setTags] = useState<string[]>([])
  const [location, setLocation] = useState<PostLocation | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [shareLocationEnabled, setShareLocationEnabled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isModerating, setIsModerating] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    mode: 'onChange',
  })

  useEffect(() => {
    setDraftId(null)
    setUploadState(emptyUploadState)
    setSelectedFiles([])
  }, [mode])

  useEffect(() => {
    const prefs = getPrivacyPreferences()
    setShareLocationEnabled(prefs.shareLocation)
    if (!prefs.shareLocation) return

    let cancelled = false
    setLocationLoading(true)
    detectCurrentLocation()
      .then((detected) => {
        if (!cancelled && detected) setLocation(detected)
      })
      .finally(() => {
        if (!cancelled) setLocationLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const refreshLocation = async () => {
    setLocationLoading(true)
    try {
      const detected = await detectCurrentLocation()
      if (detected) {
        setLocation(detected)
        toast.success(`${detected.city} konumu eklendi`)
      } else {
        toast.error('Konum alınamadı')
      }
    } catch {
      toast.error('Konum izni gerekli. Ayarlardan konumu açın.')
    } finally {
      setLocationLoading(false)
    }
  }

  const autoUploadDraft = mode === 'video' || mode === 'photo'
  const mediaReady =
    mode === 'news' ||
    (autoUploadDraft &&
      !uploadState.uploading &&
      (mode === 'video' ? Boolean(uploadState.videoUrl) : Boolean(uploadState.thumbnail)))

  const onSubmit = async (data: PostFormData) => {
    if (!user) {
      toast.error('Haber oluşturmak için giriş yapın')
      return
    }

    if (!isValid || (autoUploadDraft && !mediaReady)) {
      toast.error(
        autoUploadDraft
          ? uploadState.uploading
            ? 'Medya yüklenmesi tamamlanana kadar bekleyin'
            : 'Lütfen medya yükleyin ve zorunlu alanları doldurun'
          : 'Lütfen tüm zorunlu alanları doldurun'
      )
      return
    }

    setIsSubmitting(true)

    try {
      const postType = mode === 'video' ? 'video' : mode === 'photo' ? 'photo' : 'news'
      const postLocation = shareLocationEnabled ? location : null
      let thumbnail = uploadState.thumbnail
      let videoUrl = uploadState.videoUrl
      let postId = draftId ?? uploadState.draftId

      // For the `news` flow media is uploaded at submit time (not auto-drafted).
      // Create a draft first so media lands under posts/{userId}/{postId}/.
      if (!postId && selectedFiles.length > 0) {
        postId = await postService.createDraftNews({
          author: user.username,
          authorId: user.uid,
          type: postType,
        })
        setDraftId(postId)
      }

      if (postId && selectedFiles.length > 0 && !uploadState.thumbnail && !uploadState.videoUrl) {
        for (const file of selectedFiles) {
          if (file.type.startsWith('video/')) {
            videoUrl = await storageService.uploadPostVideo(file, user.uid, postId)
          } else if (file.type.startsWith('image/')) {
            const imageUrl = await storageService.uploadPostImage(file, user.uid, postId)
            if (!thumbnail) thumbnail = imageUrl
          }
        }
      }

      // AI content moderation: decide whether to publish or hold for review.
      const mediaUrls: ModerationMedia[] = []
      if (videoUrl) mediaUrls.push({ url: videoUrl, type: 'video' })
      if (thumbnail) mediaUrls.push({ url: thumbnail, type: 'image' })

      setIsModerating(true)
      const moderation = await moderate({
        text: [data.title, data.content, ...tags].filter(Boolean).join('\n'),
        mediaUrls,
      })
      setIsModerating(false)

      const resolvedStatus = moderation.decision === 'approve' ? 'published' : 'pending'

      if (!postId) {
        postId = await postService.createNews({
          title: data.title,
          description: data.content,
          author: user.username,
          authorId: user.uid,
          thumbnail,
          videoUrl,
          category: data.category ?? '',
          type: postType,
          status: resolvedStatus,
          tags,
          location: postLocation,
        })
      } else {
        await postService.publishNews(postId, {
          title: data.title,
          description: data.content,
          author: user.username,
          authorId: user.uid,
          thumbnail,
          videoUrl,
          category: data.category ?? '',
          type: postType,
          tags,
          location: postLocation,
          status: resolvedStatus,
        })
      }

      await userService.refreshPostsCount(user.uid, user.username).catch(() => {})

      if (resolvedStatus === 'published') {
        toast.success('Haber paylaşıldı!')
        router.push(ROUTES.POST_DETAIL(postId))
      } else {
        // Held for admin approval — route to the author's profile rather than
        // the (not-yet-live) post detail page.
        toast(REVIEW_MESSAGE, { icon: '🛡️', duration: 6000 })
        router.push(ROUTES.PROFILE(user.username))
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Haber oluşturulurken bir hata oluştu'
      toast.error(message)
    } finally {
      setIsModerating(false)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
          Başlık *
        </label>
        <Input id="title" type="text" placeholder="Post başlığını girin" {...register('title')} />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
      </div>

      <div>
        <label htmlFor="content" className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
          İçerik *
        </label>
        <textarea
          id="content"
          placeholder="Post içeriğini yazın..."
          rows={8}
          className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register('content')}
        />
        {errors.content && <p className="mt-1 text-sm text-red-600">{errors.content.message}</p>}
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">Maksimum 5000 karakter</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
          Etiketler
        </label>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium text-[rgb(var(--color-text))]">Konum</label>
          {shareLocationEnabled && (
            <button
              type="button"
              onClick={refreshLocation}
              disabled={locationLoading}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              Yenile
            </button>
          )}
        </div>
        {!shareLocationEnabled ? (
          <p className="rounded-lg border border-dashed border-[rgb(var(--color-border))] px-4 py-3 text-sm text-[rgb(var(--color-muted))]">
            Konum paylaşımı kapalı. Ayarlar → Gizlilik → Konumu paylaş ile açabilirsiniz.
          </p>
        ) : locationLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-4 py-3 text-sm text-[rgb(var(--color-muted))]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Konum algılanıyor...
          </div>
        ) : location ? (
          <div className="flex items-start gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="font-semibold text-[rgb(var(--color-text))]">{location.city}</p>
              <p className="text-[rgb(var(--color-muted))]">
                {[location.region, location.country].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={refreshLocation}
            className="w-full rounded-lg border border-dashed border-[rgb(var(--color-border))] px-4 py-3 text-sm text-blue-600 hover:bg-[rgb(var(--color-surface))] dark:text-blue-400"
          >
            Konum ekle
          </button>
        )}
      </div>

      <div>
        <label htmlFor="excerpt" className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
          Özet (İsteğe bağlı)
        </label>
        <Input
          id="excerpt"
          type="text"
          placeholder="Postunuzun kısa özeti"
          maxLength={200}
          {...register('excerpt')}
        />
        {errors.excerpt && <p className="mt-1 text-sm text-red-600">{errors.excerpt.message}</p>}
      </div>

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">
          Konu Kategorisi
        </label>
        <select
          id="category"
          className="w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register('category')}
        >
          <option value="">Otomatik (şehir veya genel)</option>
          {DEFAULT_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-[rgb(var(--color-text))]">
          {mode === 'video' ? 'Video *' : mode === 'photo' ? 'Fotoğraflar *' : 'Medya (İsteğe bağlı)'}
        </label>
        <MediaUploader
          mode={mode}
          userId={user?.uid}
          authorUsername={user?.username}
          autoUploadDraft={autoUploadDraft}
          draftId={draftId}
          onDraftId={setDraftId}
          onUploadStateChange={setUploadState}
          onFilesChange={setSelectedFiles}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="submit"
          disabled={isSubmitting || !isValid || uploadState.uploading || (autoUploadDraft && !mediaReady)}
          className="flex-1"
        >
          {isModerating
            ? 'İçerik denetimden geçiriliyor...'
            : isSubmitting
              ? 'Paylaşılıyor...'
              : 'Hemen Paylaş'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          className="flex-1"
        >
          İptal
        </Button>
      </div>
    </form>
  )
}
