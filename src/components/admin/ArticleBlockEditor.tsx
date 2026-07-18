'use client'

import { ChevronDown, ChevronUp, Copy, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { textToArticleBlocks, type ArticleBlock } from '@/lib/articleBlocks'

type AvailableImage = { url: string; caption?: string }

interface ArticleBlockEditorProps {
  value: ArticleBlock[]
  onChange: (blocks: ArticleBlock[]) => void
  availableImages: AvailableImage[]
  sourceContent: string
}

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-violet-500'

function newId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createBlock(type: ArticleBlock['type']): ArticleBlock {
  const id = newId()
  if (type === 'heading') return { id, type, level: 2, text: '' }
  if (type === 'paragraph') return { id, type, text: '' }
  if (type === 'list') return { id, type, style: 'unordered', items: [''] }
  if (type === 'image') return { id, type, url: '', alt: '', caption: '' }
  if (type === 'gallery') return { id, type, columns: 3, images: [] }
  return { id, type: 'divider' }
}

export function ArticleBlockEditor({
  value,
  onChange,
  availableImages,
  sourceContent,
}: ArticleBlockEditorProps) {
  const update = (index: number, block: ArticleBlock) => {
    const next = [...value]
    next[index] = block
    onChange(next)
  }

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }

  const insert = (type: ArticleBlock['type']) => onChange([...value, createBlock(type)])

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
            onClick={() => onChange(textToArticleBlocks(sourceContent))}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            <Plus className="h-3 w-3" />
            Klasik metni bloklara dönüştür
          </button>
        )}
        {([
          ['heading', 'H2/H3'],
          ['paragraph', 'Paragraf'],
          ['list', 'Liste'],
          ['image', 'Görsel'],
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
                <span className="text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                  {index + 1}. {block.type}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Yukarı taşı" className="rounded p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} aria-label="Aşağı taşı" className="rounded p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onChange([...value.slice(0, index + 1), { ...block, id: newId() }, ...value.slice(index + 1)])} aria-label="Bloğu çoğalt" className="rounded p-1 hover:text-violet-500">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label="Bloğu sil" className="rounded p-1 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {block.type === 'heading' && (
                <div className="flex gap-2">
                  <select
                    value={block.level}
                    onChange={(event) => update(index, { ...block, level: event.target.value === '3' ? 3 : 2 })}
                    className={`${inputClass} w-24`}
                  >
                    <option value="2">H2</option>
                    <option value="3">H3</option>
                  </select>
                  <input value={block.text} onChange={(event) => update(index, { ...block, text: event.target.value })} className={inputClass} placeholder="Bölüm başlığı..." />
                </div>
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
                  <input value={block.url} onChange={(event) => update(index, { ...block, url: event.target.value })} className={inputClass} placeholder="https://... görsel URL" />
                  {availableImages.length > 0 && (
                    <select value="" onChange={(event) => {
                      const image = availableImages.find((item) => item.url === event.target.value)
                      if (image) update(index, { ...block, url: image.url, caption: image.caption || block.caption })
                    }} className={inputClass}>
                      <option value="">Yüklenen görsellerden seç...</option>
                      {availableImages.map((image, imageIndex) => <option key={`${image.url}-${imageIndex}`} value={image.url}>Görsel {imageIndex + 1} — {image.caption || image.url.slice(-35)}</option>)}
                    </select>
                  )}
                  <input value={block.alt ?? ''} onChange={(event) => update(index, { ...block, alt: event.target.value })} className={inputClass} placeholder="SEO / erişilebilirlik alt metni" />
                  <input value={block.caption ?? ''} onChange={(event) => update(index, { ...block, caption: event.target.value })} className={inputClass} placeholder="Görsel altyazısı" />
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
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
