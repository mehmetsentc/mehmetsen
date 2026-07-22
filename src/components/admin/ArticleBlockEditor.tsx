'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, ImagePlus, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { articleBlocksToPlainText, textToArticleBlocks, type ArticleBlock } from '@/lib/articleBlocks'
import { auth } from '@/lib/firebase/auth'

type AvailableImage = { url: string; caption?: string }

interface ArticleBlockEditorProps {
  value: ArticleBlock[]
  onChange: (blocks: ArticleBlock[]) => void
  availableImages: AvailableImage[]
  sourceContent: string
  articleTitle: string
  articleSummary?: string
}

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-violet-500'

function newId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createBlock(type: ArticleBlock['type']): ArticleBlock {
  const id = newId()
  // Default H2 — page title is the only H1
  if (type === 'heading') return { id, type, level: 2, text: '' }
  if (type === 'paragraph') return { id, type, text: '' }
  if (type === 'list') return { id, type, style: 'unordered', items: [''] }
  if (type === 'image') return { id, type, url: '', alt: '', caption: '' }
  if (type === 'video') return { id, type, url: '', caption: '' }
  if (type === 'gallery') return { id, type, columns: 3, images: [] }
  return { id, type: 'divider' }
}

type EditorBlockType =
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | Exclude<ArticleBlock['type'], 'heading'>

function editorBlockType(block: ArticleBlock): EditorBlockType {
  if (block.type !== 'heading') return block.type
  const level = block.level === 1 ? 2 : block.level
  if (level === 4) return 'heading-4'
  if (level === 3) return 'heading-3'
  return 'heading-2'
}

function convertBlock(block: ArticleBlock, nextType: EditorBlockType): ArticleBlock {
  if (nextType.startsWith('heading-')) {
    const requested = Number(nextType.slice(-1)) as 2 | 3 | 4
    const level = requested
    const text = block.type === 'heading' || block.type === 'paragraph' ? block.text : ''
    return { id: block.id, type: 'heading', level, text }
  }
  if (nextType === 'paragraph') {
    const text = block.type === 'heading' || block.type === 'paragraph' ? block.text : ''
    return { id: block.id, type: 'paragraph', text }
  }
  if (nextType === 'image') {
    const url = block.type === 'image' || block.type === 'video' ? block.url : ''
    const caption = block.type === 'image' || block.type === 'video' ? block.caption : ''
    return { id: block.id, type: 'image', url, caption, alt: '' }
  }
  if (nextType === 'video') {
    const url = block.type === 'image' || block.type === 'video' ? block.url : ''
    const caption = block.type === 'image' || block.type === 'video' ? block.caption : ''
    return { id: block.id, type: 'video', url, caption }
  }
  if (nextType === 'list') return { id: block.id, type: 'list', style: 'unordered', items: [''] }
  if (nextType === 'gallery') return { id: block.id, type: 'gallery', columns: 3, images: [] }
  return { id: block.id, type: 'divider' }
}

export function ArticleBlockEditor({
  value,
  onChange,
  availableImages,
  sourceContent,
  articleTitle,
  articleSummary,
}: ArticleBlockEditorProps) {
  const blocksRef = useRef(value)
  blocksRef.current = value
  const [captionGeneratingId, setCaptionGeneratingId] = useState<string | null>(null)

  const commit = (blocks: ArticleBlock[]) => {
    blocksRef.current = blocks
    onChange(blocks)
  }

  const update = (index: number, block: ArticleBlock) => {
    const next = [...blocksRef.current]
    next[index] = block
    commit(next)
  }

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...blocksRef.current]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    commit(next)
  }

  const insertAfter = (index: number, type: ArticleBlock['type']) => {
    const current = blocksRef.current
    commit([...current.slice(0, index + 1), createBlock(type), ...current.slice(index + 1)])
  }

  const insert = (type: ArticleBlock['type']) =>
    insertAfter(blocksRef.current.length - 1, type)

  const generateImageCaption = async (blockId: string, imageUrl: string) => {
    if (!imageUrl.trim() || captionGeneratingId) return
    setCaptionGeneratingId(blockId)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) {
        toast.error('AI altyazı için tekrar giriş yapın')
        return
      }
      const content = articleBlocksToPlainText(blocksRef.current) || sourceContent
      const response = await fetch('/api/admin/news/ai-image-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageUrl,
          title: articleTitle,
          content,
          summary: articleSummary,
        }),
      })
      const data = (await response.json()) as { caption?: string; error?: string }
      if (!response.ok || !data.caption?.trim()) {
        throw new Error(data.error || 'AI altyazı üretilemedi')
      }

      const current = blocksRef.current
      const blockIndex = current.findIndex((item) => item.id === blockId)
      const block = current[blockIndex]
      if (blockIndex < 0 || block?.type !== 'image' || block.url !== imageUrl) return
      const caption = data.caption.trim()
      const next = [...current]
      next[blockIndex] = {
        ...block,
        caption,
        alt: block.alt?.trim() || caption,
      }
      commit(next)
      toast.success('Görsel altyazısı AI ile oluşturuldu')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI altyazı üretilemedi')
    } finally {
      setCaptionGeneratingId(null)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div>
        <h3 className="text-sm font-bold text-[rgb(var(--color-text))]">Zengin Haber Gövdesi</h3>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Sayfa başlığı otomatik H1’dir. Gövdede SEO için H2/H3, metin, liste ve galerileri sıralayın.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {value.length === 0 && sourceContent.trim() && (
          <button
            type="button"
            onClick={() => commit(textToArticleBlocks(sourceContent))}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            <Plus className="h-3 w-3" />
            Klasik metni bloklara dönüştür
          </button>
        )}
        {([
          ['heading', 'Başlık H2–H4'],
          ['paragraph', 'Paragraf'],
          ['list', 'Liste'],
          ['image', 'Görsel'],
          ['video', 'Video'],
          ['gallery', 'Galeri'],
          ['divider', 'Ayraç'],
        ] as const).map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => insert(type)}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-[rgb(var(--color-card))] px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
          >
            <Plus className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[rgb(var(--color-border))] p-5 text-center text-xs text-[rgb(var(--color-muted))]">
          Zengin gövde kullanılmıyor. Blok eklemezseniz aşağıdaki klasik içerik alanı yayınlanır.
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((block, index) => (
            <div
              key={block.id}
              className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[11px] font-bold text-violet-600 dark:text-violet-300">
                    {index + 1}.
                  </span>
                  <select
                    value={editorBlockType(block)}
                    onChange={(event) => update(index, convertBlock(block, event.target.value as EditorBlockType))}
                    className="min-w-0 rounded-md border border-violet-500/30 bg-[rgb(var(--color-card))] px-2 py-1 text-xs font-semibold text-[rgb(var(--color-text))]"
                    aria-label={`${index + 1}. blok türü`}
                  >
                    <option value="heading-2">H2 başlık</option>
                    <option value="heading-3">H3 başlık</option>
                    <option value="heading-4">H4 başlık</option>
                    <option value="paragraph">Paragraf</option>
                    <option value="image">Görsel</option>
                    <option value="video">Video</option>
                    <option value="list">Liste</option>
                    <option value="gallery">Galeri</option>
                    <option value="divider">Ayraç</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Yukarı taşı" className="rounded p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} aria-label="Aşağı taşı" className="rounded p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => commit([...blocksRef.current.slice(0, index + 1), { ...block, id: newId() }, ...blocksRef.current.slice(index + 1)])} aria-label="Bloğu çoğalt" className="rounded p-1 hover:text-violet-500">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => commit(blocksRef.current.filter((_, i) => i !== index))} aria-label="Bloğu sil" className="rounded p-1 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {block.type === 'heading' && (
                <input value={block.text} onChange={(event) => update(index, { ...block, text: event.target.value })} className={inputClass} placeholder={`H${block.level} başlık metni...`} />
              )}

              {block.type === 'paragraph' && (
                <textarea value={block.text} onChange={(event) => update(index, { ...block, text: event.target.value })} rows={5} className={`${inputClass} resize-y`} placeholder="Paragraf metni..." />
              )}

              {block.type === 'list' && (
                <div className="space-y-2">
                  <select value={block.style} onChange={(event) => update(index, { ...block, style: event.target.value === 'ordered' ? 'ordered' : 'unordered' })} className={`${inputClass} w-44`}>
                    <option value="unordered">Madde işaretli</option>
                    <option value="ordered">Numaralı</option>
                  </select>
                  <textarea
                    value={block.items.join('\n')}
                    onChange={(event) => update(index, { ...block, items: event.target.value.split('\n') })}
                    rows={5}
                    className={`${inputClass} resize-y`}
                    placeholder="Her satıra bir madde..."
                  />
                </div>
              )}

              {block.type === 'image' && (
                <div className="space-y-2">
                  <input
                    value={block.url}
                    onChange={(event) => update(index, { ...block, url: event.target.value })}
                    onBlur={() => {
                      if (block.url.trim() && !block.caption?.trim()) {
                        void generateImageCaption(block.id, block.url)
                      }
                    }}
                    className={inputClass}
                    placeholder="https://... görsel URL"
                  />
                  {availableImages.length > 0 && (
                    <select value="" onChange={(event) => {
                      const image = availableImages.find((item) => item.url === event.target.value)
                      if (image) {
                        const caption = image.caption || block.caption
                        update(index, { ...block, url: image.url, caption })
                        if (!caption?.trim()) void generateImageCaption(block.id, image.url)
                      }
                    }} className={inputClass}>
                      <option value="">Yüklenen görsellerden seç...</option>
                      {availableImages.map((image, imageIndex) => <option key={`${image.url}-${imageIndex}`} value={image.url}>Görsel {imageIndex + 1} — {image.caption || image.url.slice(-35)}</option>)}
                    </select>
                  )}
                  <input value={block.alt ?? ''} onChange={(event) => update(index, { ...block, alt: event.target.value })} className={inputClass} placeholder="SEO / erişilebilirlik alt metni" />
                  <input value={block.caption ?? ''} onChange={(event) => update(index, { ...block, caption: event.target.value })} className={inputClass} placeholder="Görsel altyazısı" />
                  <input value={block.credit ?? ''} onChange={(event) => update(index, { ...block, credit: event.target.value })} className={inputClass} placeholder="Görsel kredisi / kaynak" />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void generateImageCaption(block.id, block.url)}
                      disabled={!block.url.trim() || captionGeneratingId !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {captionGeneratingId === block.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      AI altyazı oluştur
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const headingText =
                          block.caption?.trim() ||
                          block.alt?.trim() ||
                          articleTitle.trim() ||
                          'Görsel başlığı'
                        insertAfter(index, 'heading')
                        const current = blocksRef.current
                        const headingIndex = index + 1
                        const heading = current[headingIndex]
                        if (heading?.type === 'heading') {
                          update(headingIndex, { ...heading, level: 2, text: headingText.slice(0, 90) })
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Görsel altı H2 ekle
                    </button>
                  </div>
                </div>
              )}

              {block.type === 'video' && (
                <div className="space-y-2">
                  <input
                    value={block.url}
                    onChange={(event) => update(index, { ...block, url: event.target.value })}
                    className={inputClass}
                    placeholder="YouTube veya MP4/WebM video URL’si"
                  />
                  <input
                    value={block.caption ?? ''}
                    onChange={(event) => update(index, { ...block, caption: event.target.value })}
                    className={inputClass}
                    placeholder="Video altyazısı / açıklaması"
                  />
                </div>
              )}

              {block.type === 'gallery' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={block.columns} onChange={(event) => update(index, { ...block, columns: event.target.value === '2' ? 2 : 3 })} className={`${inputClass} w-36`}>
                      <option value="3">3 sütun</option>
                      <option value="2">2 sütun</option>
                    </select>
                    <span className="text-xs text-[rgb(var(--color-muted))]">{block.images.length} görsel</span>
                  </div>
                  <textarea
                    value={block.images.map((image) => image.url).join('\n')}
                    onChange={(event) => update(index, {
                      ...block,
                      images: event.target.value.split('\n').map((url, i) => ({
                        url,
                        alt: block.images[i]?.alt,
                        caption: block.images[i]?.caption,
                      })),
                    })}
                    rows={5}
                    className={`${inputClass} resize-y font-mono text-xs`}
                    placeholder="Her satıra bir görsel URL’si..."
                  />
                  {availableImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableImages.map((image, imageIndex) => {
                        const selected = block.images.some((item) => item.url === image.url)
                        return (
                          <button
                            key={`${image.url}-${imageIndex}`}
                            type="button"
                            onClick={() => update(index, {
                              ...block,
                              images: selected
                                ? block.images.filter((item) => item.url !== image.url)
                                : [...block.images, { url: image.url, caption: image.caption }],
                            })}
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${selected ? 'bg-violet-600 text-white' : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'}`}
                          >
                            <ImagePlus className="h-3 w-3" />
                            Görsel {imageIndex + 1}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {block.type === 'divider' && <hr className="my-3 border-[rgb(var(--color-border))]" />}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-dashed border-[rgb(var(--color-border))] pt-2">
                <span className="mr-1 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                  Bunun altına ekle:
                </span>
                {([
                  ['heading', 'Başlık'],
                  ['image', 'Görsel'],
                  ['video', 'Video'],
                  ['paragraph', 'Paragraf'],
                ] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => insertAfter(index, type)}
                    className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
                  >
                    <Plus className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
