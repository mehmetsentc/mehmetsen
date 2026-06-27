'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Info, Folder } from 'lucide-react'
import { DEFAULT_CATEGORIES, getSubcategories } from '@/constants/config'

/**
 * Admin → Kategoriler (read-only)
 *
 * Kategoriler artık `constants/config.ts` içindeki `DEFAULT_CATEGORIES`
 * tarafından yönetiliyor. Bu liste sidebar nav'ı, home rails, kategori
 * sayfa rotaları ve ön yüzdeki tüm bağımlılıklar için tek kaynak. Firestore
 * tarafında dinamik bir koleksiyon tutulmuyor — değişiklikler kod üzerinden
 * yapılır ve deploy edilir.
 */
export default function AdminCategoriesPage() {
  const topLevel = useMemo(
    () => DEFAULT_CATEGORIES.filter((c) => !c.parentId),
    []
  )

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-black text-[rgb(var(--color-text))]">Kategoriler</h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Tek kaynak: <code className="rounded bg-[rgb(var(--color-surface))] px-1.5 py-0.5 text-xs">src/constants/config.ts</code>
        </p>
      </header>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300 flex gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Kategori yönetimi kodda</p>
          <p className="mt-1 text-amber-700 dark:text-amber-400">
            Sidebar, üst nav, home rails, kategori rotaları ve AI categoryEngine
            bu listeden okur. Yeni kategori eklemek için kodu güncelleyip deploy et.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))]">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Ad</th>
              <th className="px-4 py-2 text-left font-semibold">ID / Slug</th>
              <th className="px-4 py-2 text-left font-semibold">Alt Kategoriler</th>
              <th className="px-4 py-2 text-left font-semibold">Renk</th>
              <th className="px-4 py-2 text-right font-semibold">Sayfa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            {topLevel.map((cat) => {
              const subs = getSubcategories(cat.id)
              return (
                <tr key={cat.id}>
                  <td className="px-4 py-2.5 font-semibold text-[rgb(var(--color-text))]">
                    <span className="inline-flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5" style={{ color: cat.color }} />
                      {cat.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[rgb(var(--color-muted))]">
                    {cat.id}
                    {cat.slug && cat.slug !== cat.id ? <> · {cat.slug}</> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {subs.length ? (
                      <span className="text-xs text-[rgb(var(--color-muted))]">
                        {subs.map((s) => s.name).join(', ')}
                      </span>
                    ) : (
                      <span className="text-xs text-[rgb(var(--color-muted))] opacity-50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-[rgb(var(--color-border))]"
                      style={{ backgroundColor: cat.color }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/kategori/${cat.slug ?? cat.id}`}
                      target="_blank"
                      className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Aç ↗
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
