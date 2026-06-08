'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CategoryTable } from '@/components/admin/CategoryTable'
import { categoryService } from '@/services/categoryService'
import type { Category } from '@/types/common'

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState({ id: '', name: '', slug: '', order: 0, color: '#EF4444' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await categoryService.list()
      setCategories(list)
    } catch (err) {
      console.error(err)
      toast.error('Kategoriler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setForm({ id: '', name: '', slug: '', order: categories.length, color: '#EF4444' })
    setEditing(null)
    setShowForm(false)
  }

  const handleEdit = (cat: Category) => {
    setEditing(cat)
    setForm({ id: cat.id, name: cat.name, slug: cat.slug, order: cat.order, color: cat.color })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Ad ve slug gerekli')
      return
    }

    setActionLoading('form')
    try {
      if (editing) {
        await categoryService.update(editing.id, {
          name: form.name,
          slug: form.slug,
          order: form.order,
          color: form.color,
        })
        toast.success('Kategori güncellendi')
      } else {
        const id = form.id.trim() || form.slug.trim()
        await categoryService.create({
          id,
          name: form.name,
          slug: form.slug,
          order: form.order,
          color: form.color,
        })
        toast.success('Kategori oluşturuldu')
      }
      resetForm()
      await load()
    } catch (err) {
      console.error(err)
      toast.error('Kaydetme başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return
    setActionLoading(id)
    try {
      await categoryService.remove(id)
      toast.success('Kategori silindi')
      setCategories((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      console.error(err)
      toast.error('Silme başarısız')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--color-text))]">Kategoriler</h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Feed filtrelerinde kullanılan kategoriler
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="mr-2 inline h-4 w-4" />
          Yeni Kategori
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5"
        >
          <h2 className="mb-4 font-semibold text-[rgb(var(--color-text))]">
            {editing ? 'Kategori Düzenle' : 'Yeni Kategori'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {!editing && (
              <div>
                <label className="mb-1 block text-sm text-[rgb(var(--color-muted))]">ID</label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                  placeholder="gundem"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm text-[rgb(var(--color-muted))]">Ad</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Gündem"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[rgb(var(--color-muted))]">Slug</label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="gundem"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[rgb(var(--color-muted))]">Sıra</label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[rgb(var(--color-muted))]">Renk</label>
              <Input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={actionLoading === 'form'}>
              {editing ? 'Güncelle' : 'Oluştur'}
            </Button>
            <Button type="button" variant="secondary" onClick={resetForm}>
              İptal
            </Button>
          </div>
        </form>
      )}

      <CategoryTable
        categories={categories}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        actionLoading={actionLoading}
      />
    </div>
  )
}
