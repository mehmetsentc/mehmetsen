'use client'

/**
 * Category choice from the site's own category source (DEFAULT_CATEGORIES),
 * grouped parent → subcategories. Matching is EXACT: choosing a parent does
 * not include its subcategories; «alt kategorileri de seç» adds them
 * explicitly so the scope is always visible. Yerel karşılıklar (Yerel Spor ≙
 * Spor) are noted, not hidden.
 */
import { useMemo } from 'react'
import { DEFAULT_CATEGORIES } from '@/constants/config'

const HIDDEN = new Set(['trend', 'tekrarlayan'])

type Node = { id: string; name: string; children: Array<{ id: string; name: string }> }

export function categoryTree(): Node[] {
  const visible = DEFAULT_CATEGORIES.filter((c) => !HIDDEN.has(c.id))
  const roots = visible.filter((c) => !c.parentId)
  return roots.map((r) => ({ id: r.id, name: r.name, children: visible.filter((c) => c.parentId === r.id).map((c) => ({ id: c.id, name: c.name })) }))
}

export const CATEGORY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]))

export function categoriesText(all: boolean, ids: string[]): string {
  if (all) return 'tüm kategoriler'
  if (ids.length === 0) return 'kategori seçilmedi'
  const names = ids.map((id) => CATEGORY_NAME.get(id) ?? id)
  return names.length > 4 ? `${names.slice(0, 4).join(', ')} +${names.length - 4}` : names.join(', ')
}

export function CategoryPicker({
  legend,
  hint,
  all,
  ids,
  onChange,
}: {
  legend: string
  hint?: string
  all: boolean
  ids: string[]
  onChange: (next: { all: boolean; ids: string[] }) => void
}) {
  const tree = useMemo(categoryTree, [])
  const toggle = (id: string) => onChange({ all, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] })
  const addChildren = (n: Node) => onChange({ all, ids: [...new Set([...ids, n.id, ...n.children.map((c) => c.id)])] })
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{legend}</legend>
      {hint && <p className="text-[11px] text-[rgb(var(--color-muted))]">{hint}</p>}
      <label className="inline-flex items-center gap-1.5">
        <input type="checkbox" checked={all} onChange={(e) => onChange({ all: e.target.checked, ids })} />
        Tüm kategoriler
      </label>
      {!all && (
        <div className="max-h-56 space-y-1.5 overflow-auto rounded-lg border border-[rgb(var(--color-border))] p-2">
          {tree.map((n) => (
            <div key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1 text-xs font-semibold">
                  <input type="checkbox" checked={ids.includes(n.id)} onChange={() => toggle(n.id)} />
                  {n.name}
                </label>
                {n.children.length > 0 && (
                  <button type="button" onClick={() => addChildren(n)} className="text-[10px] underline text-[rgb(var(--color-muted))]">
                    alt kategorileri de seç ({n.children.length})
                  </button>
                )}
              </div>
              {n.children.length > 0 && (
                <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5 pl-4 sm:grid-cols-3">
                  {n.children.map((c) => (
                    <label key={c.id} className="inline-flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!all && (
        <p className="text-[11px] text-[rgb(var(--color-muted))]">
          Seçili: {categoriesText(false, ids)}. Üst kategori alt kategorilerini kendiliğinden kapsamaz; birden fazla kategori kendi içinde VEYA ile eşleşir. Yerel alt kategori ulusal karşılığıyla eşleşir (ör. Yerel Spor ≙ Spor).
        </p>
      )}
    </fieldset>
  )
}
