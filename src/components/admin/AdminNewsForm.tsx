'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Flame, Loader2, Search, Tag, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MediaItemsManager } from '@/components/admin/MediaItemsManager'
import { DEFAULT_CATEGORIES, type CategoryDef } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { adminNewsService } from '@/services/adminNewsService'
import { auth } from '@/lib/firebase/auth'
import type { MediaItem, Post, PostStatus } from '@/types/post'

interface AdminNewsFormProps {
  mode: 'create' | 'edit'
  post?: Post
  userId: string
  username: string
}

function seedMedia(post?: Post): MediaItem[] {
  if (!post) return []
  if (post.mediaItems && post.mediaItems.length > 0) return post.mediaItems
  if (post.coverImageUrl) {
    return [{
      type: 'image',
      url: post.coverImageUrl,
      thumbnailUrl: post.coverImageUrl,
      caption: null,
      alt: null,
      credit: null,
    }]
  }
  return []
}

function parseTagInput(raw: string): string[] {
  return raw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
}
function mergeTags(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])]
}

export function AdminNewsForm({ mode, post, userId, username }: AdminNewsFormProps) {
  const router = useRouter()

  // ── Temel alanlar ────────────────────────────────────────────────────────
  const [title, setTitle]           = useState(post?.title ?? '')
  const [slug, setSlug]             = useState((post as (Post & { slug?: string }))?.slug ?? '')
  const [description, setDescription] = useState(post?.content ?? '')
  const [summary, setSummary]       = useState(post?.summary ?? '')
  const [spot, setSpot]             = useState(post?.spot ?? '')
  const [category, setCategory]     = useState(post?.categoryId ?? '')
  const [city, setCity]             = useState(post?.city ?? '')
  const [status, setStatus]         = useState<PostStatus>(post?.status ?? 'published')
  const [isBreaking, setIsBreaking] = useState(post?.isBreaking ?? false)

  // ── Etiketler ────────────────────────────────────────────────────────────
  const [tags, setTags]           = useState<string[]>(post?.tags ?? [])
  const [tagInput, setTagInput]   = useState('')

  // ── SEO ──────────────────────────────────────────────────────────────────
  const [seoTitle, setSeoTitle]             = useState(post?.seoTitle?.trim() || post?.title?.trim() || '')
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription?.trim() || post?.summary?.trim() || post?.spot?.trim() || '')
  const [seoKeywords, setSeoKeywords]       = useState<string[]>((post as (Post & { seoKeywords?: string[] }))?.seoKeywords ?? [])
  const [seoKeywordInput, setSeoKeywordInput] = useState('')

  // ── Medya ────────────────────────────────────────────────────────────────
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(() => seedMedia(post))
  const [saving, setSaving]         = useState(false)
  const [aiKwLoading, setAiKwLoading] = useState(false)

  const coverThumbnail = useMemo(() => {
    const img = mediaItems.find(m => m.type === 'image')
    if (img) return img.url
    return mediaItems.find(m => m.type === 'video' && m.thumbnailUrl)?.thumbnailUrl ?? ''
  }, [mediaItems])

  const primaryVideoUrl = useMemo(
    () => mediaItems.find(m => m.type === 'video')?.url ?? '',
    [mediaItems]
  )

  // ── Tag helpers ──────────────────────────────────────────────────────────
  const addTagsFromInput = () => {
    const parsed = parseTagInput(tagInput)
    if (!parsed.length) return
    setTags(prev => mergeTags(prev, parsed))
    setTagInput('')
  }

  // ── Keyword helpers ──────────────────────────────────────────────────────
  const addKeywordsFromInput = () => {
    const kws = seoKeywordInput.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    if (!kws.length) return
    setSeoKeywords(prev => [...new Set([...prev, ...kws])])
    setSeoKeywordInput('')
  }

  const generateAiKeywords = async () => {
    setAiKwLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const input = [title, description].filter(Boolean).join('\n\n').slice(0, 2000)
      const res = await fetch('/api/admin/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'keywords', input }),
      })
      const data = await res.json() as { keywords?: string[] }
      if (Array.isArray(data.keywords) && data.keywords.length > 0) {
        setSeoKeywords(prev => [...new Set([...prev, ...data.keywords!.map((k: string) => k.trim().toLowerCase()).filter(Boolean)])])
        toast.success(`${data.keywords.length} anahtar kelime eklendi`)
      } else {
        toast.error('AI anahtar kelime üretemedi')
      }
    } catch {
      toast.error('AI isteği başarısız')
    } finally {
      setAiKwLoading(false)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('Başlık gerekli'); return }

    setSaving(true)
    try {
      const payload = {
        title,
        slug: slug.trim() || undefined,
        description,
        summary,
        spot,
        seoTitle, seoDescription, seoKeywords,
        category, city,
        thumbnail: coverThumbnail,
        videoUrl: primaryVideoUrl,
        mediaItems,
        tags,
        isBreaking,
        status,
      }

      if (mode === 'create') {
        await adminNewsService.createAdminNews({ ...payload, authorId: userId, authorUsername: username })
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

  const inputCls = 'w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-2 focus:ring-emerald-500'
  const sectionCls = 'rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4 space-y-3'
  const labelCls = 'text-xs font-semibold text-[rgb(var(--color-muted))]'

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">

      {/* ── Başlık ── */}
      <div className={sectionCls}>
        <label className={labelCls}>Başlık</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Haber başlığı" required />
      </div>

      {/* ── Slug (edit modunda göster) ── */}
      {mode === 'edit' && (
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Slug (URL)</label>
            <span className="text-[10px] text-amber-600 dark:text-amber-400">⚠ Değiştirmek mevcut URL'yi bozabilir</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-[rgb(var(--color-muted))]">nahaber.com/haber/</span>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
              className={inputCls + ' font-mono'}
              placeholder="haber-slug..."
            />
          </div>
        </div>
      )}

      {/* ── İçerik ── */}
      <div className={sectionCls}>
        <label className={labelCls}>İçerik</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={8}
          placeholder="Haber metni..."
          className={inputCls + ' resize-y'}
        />
      </div>

      {/* ── Spot ── */}
      <div className={sectionCls}>
        <label className={labelCls}>Spot (Giriş cümlesi)</label>
        <textarea
          value={spot}
          onChange={e => setSpot(e.target.value)}
          rows={3}
          placeholder="Haberin kısa özet giriş metni"
          className={inputCls + ' resize-none'}
        />
      </div>

      {/* ── Özet ── */}
      <div className={sectionCls}>
        <label className={labelCls}>Özet</label>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={2}
          placeholder="Kısa özet..."
          className={inputCls + ' resize-none'}
        />
      </div>

      {/* ── Medya ── */}
      <div className={sectionCls}>
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Medya · {mediaItems.length} adet</label>
          <span className="text-[11px] text-[rgb(var(--color-muted))]">
            Video önce, görseller içeriğe dağıtılır
          </span>
        </div>
        <MediaItemsManager
          value={mediaItems}
          onChange={setMediaItems}
          userId={userId}
          username={username}
          articleContent={description}
          articleTitle={title}
        />
      </div>

      {/* ── Kategori + Durum ── */}
      <div className={sectionCls}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls + ' mb-1.5 block'}>Kategori</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
              <option value="">Seçiniz</option>
              {DEFAULT_CATEGORIES.map((c: CategoryDef) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls + ' mb-1.5 block'}>Durum</label>
            <select value={status} onChange={e => setStatus(e.target.value as PostStatus)} className={inputCls}>
              <option value="published">Yayında</option>
              <option value="pending">Onay Bekliyor</option>
              <option value="draft">Taslak</option>
              <option value="archived">Kaldırıldı</option>
            </select>
          </div>
        </div>

        {/* Şehir — sadece yerel-haber kategorisinde */}
        {category === 'yerel-haber' && (
          <div className="mt-3">
            <label className={labelCls + ' mb-1.5 block'}>Şehir</label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="ör. İstanbul" />
          </div>
        )}
      </div>

      {/* ── Son Dakika ── */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Son Dakika</p>
              <p className="text-[11px] text-[rgb(var(--color-muted))]">Ana sayfada ve son dakika şeridinde öne çıkar</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBreaking(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBreaking ? 'bg-red-500' : 'bg-[rgb(var(--color-border))]'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isBreaking ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* ── Etiketler ── */}
      <div className={sectionCls}>
        <div className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-blue-500" />
          <label className={labelCls}>Etiketler</label>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                #{tag}
                <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="ml-0.5 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {tags.length === 0 && <p className="text-xs text-[rgb(var(--color-muted))]">Henüz etiket yok</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTagsFromInput() } }}
            placeholder="Etiket yaz veya virgülle ayırarak toplu ekle (NATO, CHP, ...)"
            className={inputCls}
          />
          <button type="button" onClick={addTagsFromInput} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap">
            Ekle
          </button>
        </div>
      </div>

      {/* ── SEO Ayarları ── */}
      <div className={sectionCls}>
        <div className="flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-emerald-500" />
          <p className="text-xs font-bold text-[rgb(var(--color-text))]">SEO Ayarları</p>
        </div>

        {/* SEO Başlık */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls}>SEO Başlık</label>
            <span className={`text-[10px] font-mono ${seoTitle.length > 65 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`}>{seoTitle.length}/65</span>
          </div>
          <input
            type="text"
            value={seoTitle}
            onChange={e => setSeoTitle(e.target.value)}
            maxLength={80}
            placeholder="Arama motorları için optimize başlık (55-65 karakter)..."
            className={inputCls}
          />
          {!post?.seoTitle && seoTitle && (
            <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">Haber başlığından otomatik dolduruldu</p>
          )}
        </div>

        {/* SEO Açıklama */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls}>SEO Açıklama (Meta Description)</label>
            <span className={`text-[10px] font-mono ${seoDescription.length > 165 ? 'text-red-500' : 'text-[rgb(var(--color-muted))]'}`}>{seoDescription.length}/165</span>
          </div>
          <textarea
            value={seoDescription}
            onChange={e => setSeoDescription(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Google SERP snippet açıklaması (145-165 karakter)..."
            className={inputCls + ' resize-none'}
          />
        </div>

        {/* SEO Anahtar Kelimeler */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls}>🔑 SEO Anahtar Kelimeler</label>
            <button
              type="button"
              onClick={generateAiKeywords}
              disabled={aiKwLoading}
              className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {aiKwLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {aiKwLoading ? 'Üretiliyor...' : '✨ AI Üret'}
            </button>
          </div>
          {seoKeywords.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {seoKeywords.map(kw => (
                <span key={kw} className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {kw}
                  <button type="button" onClick={() => setSeoKeywords(prev => prev.filter(k => k !== kw))} className="ml-0.5 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={seoKeywordInput}
              onChange={e => setSeoKeywordInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeywordsFromInput() } }}
              placeholder="kelime1, kelime2... (virgülle ayır)"
              className={inputCls}
            />
            <button type="button" onClick={addKeywordsFromInput} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap">
              Ekle
            </button>
          </div>
          <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">Google meta keywords — virgülle ayır veya Enter ({seoKeywords.length} kelime)</p>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex gap-3 pb-6">
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
