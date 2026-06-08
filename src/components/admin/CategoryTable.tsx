'use client'

import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Category } from '@/types/common'

interface CategoryTableProps {
  categories: Category[]
  loading?: boolean
  onEdit?: (category: Category) => void
  onDelete?: (id: string) => void
  actionLoading?: string | null
}

export function CategoryTable({
  categories,
  loading,
  onEdit,
  onDelete,
  actionLoading,
}: CategoryTableProps) {
  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
          <tr>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Sıra</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Ad</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Slug</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Renk</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">Durum</th>
            <th className="px-4 py-3 font-medium text-[rgb(var(--color-muted))]">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--color-border))]">
          {categories.map((cat) => (
            <tr key={cat.id} className="bg-[rgb(var(--color-card))]">
              <td className="px-4 py-3 text-[rgb(var(--color-muted))]">{cat.order}</td>
              <td className="px-4 py-3 font-medium text-[rgb(var(--color-text))]">{cat.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-[rgb(var(--color-muted))]">{cat.slug}</td>
              <td className="px-4 py-3">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-[rgb(var(--color-border))]"
                  style={{ backgroundColor: cat.color }}
                />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    cat.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {cat.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  {onEdit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onEdit(cat)}
                      className="!px-2"
                      title="Düzenle"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onDelete(cat.id)}
                      disabled={actionLoading === cat.id}
                      className="!px-2"
                      title="Sil"
                    >
                      {actionLoading === cat.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
