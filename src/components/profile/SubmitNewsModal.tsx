'use client'

import { useRef, useState } from 'react'
import {
  X, Image as ImageIcon, Video, Wand2, Loader2,
  ChevronLeft, ChevronRight, CheckCircle2, MapPin, Send,
  Camera, FileText, Eye, Clock,
} from 'lucide-react'
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

const STEPS: { id: Step; label: string; short: string; Icon: typeof Camera }[] = [
  { id: 1, label: 'Medya', short: 'Foto / video', Icon: Camera },
  { id: 2, label: 'İçerik', short: 'Başlık + metin', Icon: FileText },
  { id: 3, label: 'Gönder', short: 'Kontrol et', Icon: Eye },
]

export function SubmitNewsModal({ onClose }: SubmitNewsModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>(1)

  const imgRef = useRef<HTMLInputElement>(null)
  const vidRef = useRef<HTMLInputElement>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [location, setLocation] = useState('')

  const [improving, setImproving] = useState(false)
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
    if (content.trim().length < 20) { toast.error('Düzenlemek için içerik gir'); return }
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
      toast.success('Metin profesyonel haber diline çevrildi')
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
        mediaUrl = mediaType === 'image'
          ? await storageService.uploadPostImage(mediaFile, user.uid, draftId, setUploadProgress)
          : await storageService.uploadPostVideo(mediaFile, user.uid, draftId, setUploadProgress)
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

  const canProceed2 = title.trim().length > 3 && content.trim().length > 20

  return (
    <div
      className="fixed inset-0 z-[110] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-news-title"
    >
      <div className="flex h-full w-full max-w-lg flex-col border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] sm:h-auto sm:max-h-[min(92vh,820px)] sm:rounded-2xl">
        {/* Header */}
        <div className="shrink-0 border-b border-[rgb(var(--color-border))] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:rounded-t-2xl">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-border))] text-[rgb(var(--color-text))] active:opacity-70"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 id="submit-news-title" className="truncate text-base font-bold text-[rgb(var(--color-text))]">
                Haber Gönder
              </h2>
              <p className="truncate text-[11px] text-[rgb(var(--color-muted))]">
                3 adımda tamamla · Editör onayı sonrası yayınlanır
              </p>
            </div>
            <div className="w-9" />
          </div>

          {/* Stepper */}
          <ol className="grid grid-cols-3 gap-1.5" aria-label="Gönderim adımları">
            {STEPS.map(({ id, label, short, Icon }) => {
              const active = step === id
              const done = step > id
              return (
                <li
                  key={id}
                  className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition ${
                    active
                      ? 'bg-[rgb(var(--color-brand))]/10'
                      : done
                        ? 'bg-emerald-500/10'
                        : 'bg-[rgb(var(--color-surface))]'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? 'bg-[rgb(var(--color-brand))] text-white'
                        : done
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[rgb(var(--color-border))] text-[rgb(var(--color-muted))]'
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : id}
                  </span>
                  <span className={`text-[11px] font-semibold leading-tight ${
                    active ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'
                  }`}>
                    {label}
                  </span>
                  <span className="hidden text-[10px] text-[rgb(var(--color-muted))] sm:inline">{short}</span>
                  <Icon className={`h-3 w-3 sm:hidden ${active ? 'text-[rgb(var(--color-brand))]' : 'text-[rgb(var(--color-muted))]'}`} />
                </li>
              )
            })}
          </ol>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          {step === 1 && !submitted && (
            <div className="space-y-5">
              <StepIntro
                kicker="Adım 1 / 3"
                title="Fotoğraf veya video ekle"
                body="Haberini güçlendirmek için bir görsel veya kısa video seç. Medya zorunlu değil — istersen atlayıp yazmaya geçebilirsin."
              />

              <HowItWorks />

              {mediaPreview ? (
                <div className="relative overflow-hidden rounded-2xl border border-[rgb(var(--color-border))]">
                  {mediaType === 'image'
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={mediaPreview} alt="Seçilen medya" className="max-h-72 w-full object-cover" />
                    : <video src={mediaPreview} controls className="max-h-72 w-full" />
                  }
                  <button
                    type="button"
                    onClick={() => { setMediaFile(null); setMediaType(null); setMediaPreview(null) }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm"
                    aria-label="Medyayı kaldır"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <p className="bg-[rgb(var(--color-surface))] px-3 py-2 text-xs text-[rgb(var(--color-muted))]">
                    Medya seçildi. Alttan Devam Et ile içerik adımına geç.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => imgRef.current?.click()}
                    className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-8 text-[rgb(var(--color-muted))] transition hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))] active:scale-[0.97]"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-xs font-semibold">Görsel Ekle</span>
                    <span className="px-2 text-center text-[10px] opacity-80">JPG, PNG · max 20MB</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => vidRef.current?.click()}
                    className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-8 text-[rgb(var(--color-muted))] transition hover:border-[rgb(var(--color-brand))] hover:text-[rgb(var(--color-brand))] active:scale-[0.97]"
                  >
                    <Video className="h-8 w-8" />
                    <span className="text-xs font-semibold">Video Ekle</span>
                    <span className="px-2 text-center text-[10px] opacity-80">MP4 · max 200MB</span>
                  </button>
                </div>
              )}

              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => handleMediaSelect(e, 'image')} />
              <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={e => handleMediaSelect(e, 'video')} />
            </div>
          )}

          {step === 2 && !submitted && (
            <div className="space-y-5">
              <StepIntro
                kicker="Adım 2 / 3"
                title="Haberi yaz"
                body="Kısa bir başlık ve ne olduğunu anlatan metin yaz. Konum eklemek isteğe bağlı. İstersen AI ile dili düzeltebilirsin."
              />

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[rgb(var(--color-muted))]">
                  Haber başlığı <span className="text-red-500">*</span>
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Örn. Çanakkale’de orman yangını kontrol altına alındı"
                  maxLength={120}
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20"
                />
                <p className="mt-1 text-right text-[10px] text-[rgb(var(--color-muted))]">{title.length}/120</p>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                    Haber metni <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleImproveText}
                    disabled={improving || content.length < 20}
                    className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-brand))]/40 px-3 py-1 text-xs font-semibold text-[rgb(var(--color-brand))] transition hover:bg-[rgb(var(--color-brand))]/10 disabled:opacity-40"
                  >
                    {improving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    AI ile düzenle
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Ne oldu, nerede, kimleri etkiledi? Kendi cümlelerinle yaz — en az birkaç cümle yeterli."
                  rows={8}
                  className="w-full resize-none rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20"
                />
                <p className="mt-1 flex justify-between text-[10px] text-[rgb(var(--color-muted))]">
                  <span>{canProceed2 ? 'Devam etmeye hazırsın' : 'En az ~20 karakter yaz'}</span>
                  <span>{content.length} karakter</span>
                </p>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-muted))]">
                  <MapPin className="h-3.5 w-3.5" /> Konum <span className="font-normal">(isteğe bağlı)</span>
                </label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="ör. İstanbul, Kadıköy"
                  className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20"
                />
              </div>
            </div>
          )}

          {step === 3 && !submitted && (
            <div className="space-y-5">
              <StepIntro
                kicker="Adım 3 / 3"
                title="Kontrol et ve gönder"
                body="Aşağıdaki önizleme yayına gitmeden önceki son hali. Doğruysa gönder — editörlerimiz inceledikten sonra yayınlanır."
              />

              <article className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
                {mediaPreview && mediaType === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaPreview} alt="" className="max-h-56 w-full object-cover" />
                )}
                {mediaPreview && mediaType === 'video' && (
                  <video src={mediaPreview} controls className="max-h-56 w-full" />
                )}
                <div className="space-y-2 p-4">
                  <h3 className="text-base font-bold text-[rgb(var(--color-text))]">{title}</h3>
                  {location && (
                    <p className="flex items-center gap-1 text-xs text-[rgb(var(--color-muted))]">
                      <MapPin className="h-3 w-3" />{location}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--color-text))]">{content}</p>
                </div>
              </article>

              <div className="flex gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
                <p className="text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                  Gönderim sonrası haberin hemen yayına girmez. Editör onayından sonra sitede görünür; süreç genelde birkaç saat sürer.
                </p>
              </div>

              {submitting && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="overflow-hidden rounded-full bg-[rgb(var(--color-border))] h-1.5">
                  <div className="h-full bg-[rgb(var(--color-brand))] transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
          )}

          {submitted && (
            <div className="flex flex-col items-center gap-5 py-12 text-center sm:py-16">
              <CheckCircle2 className="h-20 w-20 text-emerald-500" />
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-[rgb(var(--color-text))]">Haber gönderildi</h3>
                <p className="mx-auto max-w-xs text-sm text-[rgb(var(--color-muted))]">
                  Moderasyon kuyruğuna alındı. Editörlerimiz inceledikten sonra yayınlanacak.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 rounded-2xl bg-[rgb(var(--color-brand))] px-8 py-3 text-sm font-semibold text-white active:opacity-80"
              >
                Tamam
              </button>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {!submitted && (
          <div className="shrink-0 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:rounded-b-2xl">
            <p className="mb-2 text-center text-[11px] text-[rgb(var(--color-muted))]">
              {step === 1 && (mediaFile ? 'Sonraki: başlık ve metin yazacaksın' : 'Medya yoksa da devam edebilirsin')}
              {step === 2 && (canProceed2 ? 'Sonraki: önizleyip göndereceksin' : 'Devam için başlık ve kısa bir metin gerekli')}
              {step === 3 && 'Hazırsan gönder — onay sonrası yayınlanır'}
            </p>
            <div className="flex gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(s => (s - 1) as Step)}
                  className="flex items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-4 py-3 text-sm font-semibold text-[rgb(var(--color-muted))] transition active:opacity-70"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Geri
                </button>
              )}

              {step < 3 ? (
                <button
                  type="button"
                  disabled={step === 2 && !canProceed2}
                  onClick={() => setStep(s => (s + 1) as Step)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] py-3 text-sm font-semibold text-white transition disabled:opacity-40 active:opacity-80"
                >
                  {step === 1
                    ? (mediaFile ? 'İçeriğe geç' : 'Medyasız devam et')
                    : 'Önizlemeye geç'}
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] py-3 text-sm font-semibold text-white transition disabled:opacity-50 active:opacity-80"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? 'Gönderiliyor…' : 'Haberi gönder'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepIntro({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">{kicker}</p>
      <h3 className="text-lg font-bold text-[rgb(var(--color-text))]">{title}</h3>
      <p className="text-sm leading-relaxed text-[rgb(var(--color-muted))]">{body}</p>
    </div>
  )
}

function HowItWorks() {
  const items = [
    { n: '1', t: 'Medya', d: 'İsteğe bağlı foto / video' },
    { n: '2', t: 'Yaz', d: 'Başlık + ne olduğunu anlat' },
    { n: '3', t: 'Gönder', d: 'Önizle, gönder, onay bekle' },
  ]
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3">
      <p className="mb-2 text-[11px] font-semibold text-[rgb(var(--color-muted))]">Nasıl çalışır?</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.n} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-[10px] font-bold text-white">
              {item.n}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[rgb(var(--color-text))]">{item.t}</p>
              <p className="text-[11px] text-[rgb(var(--color-muted))]">{item.d}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
