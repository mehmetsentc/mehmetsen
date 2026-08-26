'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Eye, GripVertical, RotateCcw, Save, Undo2 } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { ROUTES } from '@/constants/routes'
import {
  LAYOUT_THEME_LABELS,
  VALID_LAYOUT_ITEM_SIZES,
  spanForSize,
  type LayoutDraftPayload,
  type LayoutItemSize,
  type LayoutThemeKey,
  type ResolvedPublisherLayout,
} from '@/types/publisherLayout'
import { cn } from '@/lib/utils'

type DraftSection = NonNullable<LayoutDraftPayload['sections']>[number]

function cloneDraft(layout: ResolvedPublisherLayout): LayoutDraftPayload {
  return {
    name: layout.layout.name,
    themeKey: layout.layout.themeKey,
    sections: layout.sections.map(({ section, items }) => ({
      id: section.id,
      title: section.title,
      slug: section.slug,
      sectionType: section.sectionType,
      position: section.position,
      displayStyle: section.displayStyle,
      isVisible: section.isVisible,
      contentMode: section.contentMode,
      autoConfig: section.autoConfig,
      items: items
        .filter((i) => !i.id.startsWith('auto_'))
        .map((item) => ({
          id: item.id,
          itemType: item.itemType,
          contentId: item.contentId,
          position: item.position,
          size: item.size,
          span: item.span,
          presentation: item.presentation,
        })),
    })),
  }
}

export function LayoutComposerClient({
  publisherId,
  slug,
  initialLayout,
}: {
  publisherId: string
  slug: string
  initialLayout: ResolvedPublisherLayout
}) {
  const [draft, setDraft] = useState<LayoutDraftPayload>(() => cloneDraft(initialLayout))
  const [history, setHistory] = useState<LayoutDraftPayload[]>([cloneDraft(initialLayout)])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [preview, setPreview] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushHistory = useCallback((next: LayoutDraftPayload) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1)
      return [...trimmed, next]
    })
    setHistoryIndex((i) => i + 1)
    setDraft(next)
  }, [historyIndex])

  const undo = () => {
    if (historyIndex <= 0) return
    const nextIndex = historyIndex - 1
    setHistoryIndex(nextIndex)
    setDraft(history[nextIndex]!)
  }

  const redo = () => {
    if (historyIndex >= history.length - 1) return
    const nextIndex = historyIndex + 1
    setHistoryIndex(nextIndex)
    setDraft(history[nextIndex]!)
  }

  const persistDraft = useCallback(async (payload: LayoutDraftPayload) => {
    const user = auth.currentUser
    if (!user) return
    setSaving(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/publisher-studio/${publisherId}/layout/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Kaydedilemedi')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Taslak kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [publisherId])

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void persistDraft(draft), 800)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [draft, persistDraft])

  const sections = draft.sections ?? []

  const updateSections = (next: DraftSection[]) => {
    pushHistory({ ...draft, sections: next })
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const next = [...sections]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    updateSections(next.map((s, i) => ({ ...s, position: i })))
  }

  const moveItem = (sectionIndex: number, itemIndex: number, direction: -1 | 1) => {
    const next = [...sections]
    const section = { ...next[sectionIndex]! }
    const items = [...(section.items ?? [])]
    const target = itemIndex + direction
    if (target < 0 || target >= items.length) return
    ;[items[itemIndex], items[target]] = [items[target]!, items[itemIndex]!]
    section.items = items.map((item, i) => ({ ...item, position: i }))
    next[sectionIndex] = section
    updateSections(next)
  }

  const changeItemSize = (sectionIndex: number, itemIndex: number, size: LayoutItemSize) => {
    const next = [...sections]
    const section = { ...next[sectionIndex]! }
    const items = [...(section.items ?? [])]
    items[itemIndex] = { ...items[itemIndex]!, size, span: spanForSize(size) }
    section.items = items
    next[sectionIndex] = section
    updateSections(next)
  }

  const addSection = () => {
    updateSections([
      ...sections,
      {
        title: `Bölüm ${sections.length + 1}`,
        position: sections.length,
        contentMode: 'MANUAL',
        isVisible: true,
        items: [],
      },
    ])
  }

  const publish = async () => {
    setPublishing(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Giriş gerekli')
      await persistDraft(draft)
      const token = await user.getIdToken()
      const res = await fetch(`/api/publisher-studio/${publisherId}/layout/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Yayınlanamadı')
      toast.success('Sayfa düzeni yayınlandı')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yayınlanamadı')
    } finally {
      setPublishing(false)
    }
  }

  const themeOptions = useMemo(
    () => Object.entries(LAYOUT_THEME_LABELS) as Array<[LayoutThemeKey, string]>,
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={undo} disabled={historyIndex <= 0} className="studio-btn">
          <Undo2 className="h-4 w-4" aria-hidden /> Geri al
        </button>
        <button type="button" onClick={redo} disabled={historyIndex >= history.length - 1} className="studio-btn">
          <RotateCcw className="h-4 w-4" aria-hidden /> Yinele
        </button>
        <button type="button" onClick={() => setPreview((p) => !p)} className="studio-btn">
          <Eye className="h-4 w-4" aria-hidden /> {preview ? 'Düzenle' : 'Önizleme'}
        </button>
        <span className="text-xs text-[rgb(var(--color-muted))]">{saving ? 'Kaydediliyor…' : 'Taslak kaydedildi'}</span>
        <div className="ml-auto flex gap-2">
          <Link href={ROUTES.PUBLISHER_STUDIO.LAYOUT(slug)} className="studio-btn">
            Geri
          </Link>
          <button type="button" onClick={() => void publish()} disabled={publishing} className="studio-btn-primary">
            <Save className="h-4 w-4" aria-hidden /> {publishing ? 'Yayınlanıyor…' : 'Yayınla'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Tema</span>
          <select
            value={draft.themeKey ?? 'MODERN'}
            onChange={(e) => pushHistory({ ...draft, themeKey: e.target.value as LayoutThemeKey })}
            className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm"
          >
            {themeOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={cn('grid grid-cols-12 gap-3', preview && 'pointer-events-none opacity-90')}>
        {sections.map((section, sectionIndex) => (
          <div key={section.id ?? sectionIndex} className="col-span-12 rounded-xl border border-[rgb(var(--color-border))] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <GripVertical className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden />
              <input
                value={section.title}
                onChange={(e) => {
                  const next = [...sections]
                  next[sectionIndex] = { ...section, title: e.target.value }
                  updateSections(next)
                }}
                className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-sm font-bold"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={section.isVisible ?? true}
                  onChange={(e) => {
                    const next = [...sections]
                    next[sectionIndex] = { ...section, isVisible: e.target.checked }
                    updateSections(next)
                  }}
                />
                Görünür
              </label>
              <select
                value={section.contentMode ?? 'MANUAL'}
                onChange={(e) => {
                  const next = [...sections]
                  next[sectionIndex] = {
                    ...section,
                    contentMode: e.target.value as 'MANUAL' | 'AUTO',
                    autoConfig:
                      e.target.value === 'AUTO'
                        ? { sort: 'newest', limit: 12 }
                        : section.autoConfig,
                  }
                  updateSections(next)
                }}
                className="rounded border border-[rgb(var(--color-border))] px-2 py-1 text-xs"
              >
                <option value="MANUAL">Manuel</option>
                <option value="AUTO">Otomatik (Son Haberler)</option>
              </select>
              <button type="button" className="studio-btn" onClick={() => moveSection(sectionIndex, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" className="studio-btn" onClick={() => moveSection(sectionIndex, 1)}>
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            {section.contentMode === 'AUTO' ? (
              <p className="text-xs text-[rgb(var(--color-muted))]">
                Otomatik bölüm — yayın sonrası en yeni haberler burada listelenir.
              </p>
            ) : (
              <div className="grid grid-cols-12 gap-2">
                {(section.items ?? []).map((item, itemIndex) => (
                  <div
                    key={item.id ?? `${sectionIndex}-${itemIndex}`}
                    className={cn(
                      'rounded-lg border border-dashed border-[rgb(var(--color-border))] p-2',
                      `col-span-${Math.min(12, item.span ?? 4)}`
                    )}
                    style={{ gridColumn: `span ${Math.min(12, item.span ?? 4)} / span ${Math.min(12, item.span ?? 4)}` }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `${sectionIndex}:${itemIndex}`)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const raw = e.dataTransfer.getData('text/plain')
                      const [fromSection, fromItem] = raw.split(':').map(Number)
                      if (Number.isNaN(fromSection) || Number.isNaN(fromItem)) return
                      const next = [...sections]
                      const from = { ...next[fromSection]! }
                      const to = { ...next[sectionIndex]! }
                      const fromItems = [...(from.items ?? [])]
                      const [moved] = fromItems.splice(fromItem, 1)
                      if (!moved) return
                      const toItems = [...(to.items ?? [])]
                      toItems.splice(itemIndex, 0, moved)
                      from.items = fromItems.map((it, i) => ({ ...it, position: i }))
                      to.items = toItems.map((it, i) => ({ ...it, position: i }))
                      next[fromSection] = from
                      next[sectionIndex] = to
                      updateSections(next)
                    }}
                  >
                    <p className="truncate text-xs font-semibold">{item.contentId ?? 'Haber'}</p>
                    <select
                      value={item.size ?? 'STANDARD'}
                      onChange={(e) =>
                        changeItemSize(sectionIndex, itemIndex, e.target.value as LayoutItemSize)
                      }
                      className="mt-1 w-full rounded border px-1 py-0.5 text-[10px]"
                    >
                      {VALID_LAYOUT_ITEM_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 flex gap-1">
                      <button type="button" className="studio-btn px-1 py-0.5" onClick={() => moveItem(sectionIndex, itemIndex, -1)}>
                        ↑
                      </button>
                      <button type="button" className="studio-btn px-1 py-0.5" onClick={() => moveItem(sectionIndex, itemIndex, 1)}>
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addSection} className="studio-btn">
        + Bölüm ekle
      </button>
    </div>
  )
}
