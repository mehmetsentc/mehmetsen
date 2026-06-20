'use client'

import { useRef, useState } from 'react'
import { X, Image as ImageIcon, Video, Wand2, Loader2, ChevronRight, CheckCircle2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { storageService } from '@/services/storageService'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'

type Step = 1 | 2 | 3

interface SubmitNewsModalProps {
  onClose: () => void
}

export function SubmitNewsModal({ onClose }: SubmitNewsModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>(1)

  // Medya
  const imgRef = useRef<HTMLInputElement>(null)
  const vidRef = useRef<HTMLInputElement>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  // İçerik
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [location, setLocation] = useState('')

  // AI
  const [improving, setImproving] = useState(false)

  // Gönderim
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxSize = type === 'video' ? 200 * 1024 * 1024 : 20 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(type === 'video' ? 'Video en fazla 200MB olabilir' : 'Görsel en fazla 20MB olabilir')
      return
    }
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaFile(file)
    setMediaType(type)
    setMediaPreview(URL.createObjectURL(file))
  }

  const handleImproveText = async () => {
    if (!content.trim() || content.length < 20) {
      toast.error('Düzenlemek için içerik gir')
      return
    }
    setImproving(true)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/user/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ title, content }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json() as { title?: string; content?: string }
      if (data.title) setTitle(data.title)
      if (data.content) setContent(data.content)
      toast.success('Metin profesyonel haber diline çevrildi ✓')
    } catch {
      toast.error('AI servisi şu an kullanılamıyor')
    } finally {
      setImproving(false)
    }
  }

  const handleSubmit = async () => {
    if (!user) return
    if (!title.trim()) { toast.error('Başlık gerekli'); return }
    if (!content.trim()) { toast.error('İçerik gerekli'); return }

    setSubmitting(true)
    try {
      let mediaUrl: string | null = null

      if (mediaFile && mediaType) {
        const draftId = `ugc_${Date.now()}`
        if (mediaType === 'image') {
          mediaUrl = await storageService.uploadPostImage(mediaFile, user.uid, draftId, setUploadProgress)
        } else {
          mediaUrl = await storageService.uploadPostVideo(mediaFile, user.uid, draftId, setUploadProgress)
        }
      }

      await addDoc(collection(db, Collections.NEWS_DRAFTS), {
        title: title.trim(),
        description: content.trim(),
        summary: content.trim().slice(0, 280),
        city: location.trim() || null,
        coverImageUrl: mediaType === 'image' ? mediaUrl : null,
        videoUrl: mediaType === 'video' ? mediaUrl : null,
        thumbnail: mediaType === 'image' ? mediaUrl : null,
        authorId: user.uid,
        author: user.username,
        authorUsername: user.username,
        authorDisplayName: user.displayName,
        source: 'ugc',
        type: 'ugc',
        draftStatus: 'pending_review',
        aiGenerated: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setSubmitted(true)
    } catch (err) {
      console.error(err)
      toast.error('Gönderilemedi, tekrar dene')
    } finally {
      setSubmitting(false)
    }
  }

  const canProceedStep1 = !!mediaFile || true // medya isteğe bağlı
  const canProceedStep2 = title.trim().length > 3 && content.trim().length > 20

  return (
    <>
      {/* Backdrop — z-40 so modal buttons at z-50 always receive touch events */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-2xl bg-[rgb(var(--color-card))] shadow-2xl sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        {/* Başlık */}
        <div className="flex shrink-0 items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[rgb(var(--color-text))]">
              {step === 1 ? 'Medya Ekle' : step === 2 ? 'Haber Bilgileri' : 'Önizleme'}
            </h2>
            <p className="text-xs text-[rgb(var(--color-muted))]">Adım {step} / 3</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[rgb(var(--color-border))]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Adım 1: Medya ── */}
          {step === 1 && !submitted && (
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--color-muted))]">
                Habere fotoğraf veya video ekleyebilirsin (isteğe bağlı).
              </p>

              {mediaPreview ? (
                <div className="relative overflow-hidden rounded-xl">
                  {mediaType === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreview} alt="Önizleme" className="w-full rounded-xl object-cover max-h-64" />
                  ) : (
                    <video src={mediaPreview} controls className="w-full rounded-xl max-h-64" />
                  )}
                  <button
                    type="button"
                    onClick={() => { setMediaFile(null); setMediaType(null); setMediaPreview(null) }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => imgRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[rgb(var(--color-border))] p-6 text-[rgb(var(--color-muted))] hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))] transition-colors"
                  >
                    <ImageIcon className="h-7 w-7" />
                    <span className="text-xs font-semibold">Görsel Ekle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => vidRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[rgb(var(--color-border))] p-6 text-[rgb(var(--color-muted))] hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))] transition-colors"
                  >
                    <Video className="h-7 w-7" />
                    <span className="text-xs font-semibold">Video Ekle</span>
                  </button>
                </div>
              )}

              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => handleMediaSelect(e, 'image')} />
              <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={e => handleMediaSelect(e, 'video')} />
            </div>
          )}

          {/* ── Adım 2: Başlık + içerik + konum ── */}
          {step === 2 && !submitted && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">
                  Haber Başlığı <span className="text-red-500">*</span>
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Haberin başlığını yaz..."
                  maxLength={120}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                    Haber İçeriği <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleImproveText}
                    disabled={improving || content.length < 20}
                    className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-brand))]/40 px-2.5 py-1 text-xs font-semibold text-[rgb(var(--color-brand))] transition hover:bg-[rgb(var(--color-brand))]/10 disabled:opacity-40"
                  >
                    {improving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    AI ile Düzenle
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Haberi kendi cümlelerinizle yazın. AI düzenle butonu metninizi profesyonel haber diline çevirir..."
                  rows={7}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20 resize-none"
                />
                <p className="mt-1 text-right text-xs text-[rgb(var(--color-muted))]">{content.length} karakter</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Konum (isteğe bağlı)</span>
                </label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="ör. İstanbul, Kadıköy"
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20"
                />
              </div>
            </div>
          )}

          {/* ── Adım 3: Önizleme ── */}
          {step === 3 && !submitted && (
            <div className="space-y-4">
              {mediaPreview && mediaType === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaPreview} alt="Haber görseli" className="w-full rounded-xl object-cover max-h-48" />
              )}
              {mediaPreview && mediaType === 'video' && (
                <video src={mediaPreview} controls className="w-full rounded-xl max-h-48" />
              )}
              <h3 className="text-base font-bold text-[rgb(var(--color-text))]">{title}</h3>
              {location && <p className="flex items-center gap-1 text-xs text-[rgb(var(--color-muted))]"><MapPin className="h-3 w-3" />{location}</p>}
              <p className="whitespace-pre-wrap text-sm text-[rgb(var(--color-text))]">{content}</p>

              <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  ℹ️ Haberiniz editörlerimiz tarafından incelendikten sonra yayınlanacaktır. Onay süreci genellikle birkaç saat içinde tamamlanır.
                </p>
              </div>

              {submitting && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="rounded-full bg-[rgb(var(--color-border))] h-1.5 overflow-hidden">
                  <div className="h-full bg-[rgb(var(--color-brand))] transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
          )}

          {/* ── Başarı ekranı ── */}
          {submitted && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <h3 className="text-xl font-black text-[rgb(var(--color-text))]">Haber Gönderildi!</h3>
              <p className="max-w-xs text-sm text-[rgb(var(--color-muted))]">
                Haberiniz moderasyon kuyruğuna alındı. Editörlerimiz inceledikten sonra yayınlanacak.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 rounded-xl bg-[rgb(var(--color-brand))] px-6 py-2.5 text-sm font-semibold text-white"
              >
                Kapat
              </button>
            </div>
          )}
        </div>

        {/* Alt butonlar */}
        {!submitted && (
          <div className="shrink-0 border-t border-[rgb(var(--color-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(s => (s - 1) as Step)}
                  className="flex-1 rounded-xl border border-[rgb(var(--color-border))] py-2.5 text-sm font-semibold text-[rgb(var(--color-muted))]"
                >
                  Geri
                </button>
              )}

              {step < 3 ? (
                <button
                  type="button"
                  disabled={step === 2 && !canProceedStep2}
                  onClick={() => setStep(s => (s + 1) as Step)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {step === 1 ? (mediaFile ? 'Devam Et' : 'Medya Olmadan Devam') : 'Önizle'}
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Gönderiliyor...' : 'Haberi Gönder'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
