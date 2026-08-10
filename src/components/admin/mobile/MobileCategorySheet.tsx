'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Loader2, X } from 'lucide-react'
import {
  composeYerelCategoryId,
  getAdminCategoryGroups,
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
  isYerelCategoryTree,
  resolveYerelCategoryParts,
  YEREL_HABER_CATEGORY_ID,
} from '@/lib/mobileAdminCategory'
import { cn } from '@/lib/utils'

interface MobileCategorySheetProps {
  open: boolean
  onClose: () => void
  categoryId: string
  onSelect: (categoryId: string) => void | Promise<void>
  saving?: boolean
  title?: string
}

export function MobileCategorySheet({
  open,
  onClose,
  categoryId,
  onSelect,
  saving = false,
  title = 'Kategori seç',
}: MobileCategorySheetProps) {
  const categoryGroups = useMemo(() => getAdminCategoryGroups(), [])
  const yerelSubcategories = useMemo(() => getYerelSubcategories(), [])
  const [step, setStep] = useState<'main' | 'yerel'>('main')

  const yerelParts = useMemo(() => resolveYerelCategoryParts(categoryId), [categoryId])
  const mainCategoryId = isYerelCategoryTree(categoryId) ? YEREL_HABER_CATEGORY_ID : categoryId

  useEffect(() => {
    if (!open) return
    setStep(isYerelCategoryTree(categoryId) ? 'yerel' : 'main')
  }, [open, categoryId])

  if (!open) return null

  async function pick(next: string) {
    if (saving || !next || next === categoryId) {
      onClose()
      return
    }
    await onSelect(next)
  }

  async function pickMain(next: string) {
    if (next === YEREL_HABER_CATEGORY_ID) {
      setStep('yerel')
      return
    }
    await pick(next)
  }

  async function pickYerelSub(subId: string) {
    await pick(composeYerelCategoryId(subId || null))
  }

  return (
    <div className="fixed inset-0 z-[70] md:hidden">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Kapat" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[75vh] flex-col rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label={title}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        </div>
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
          {step === 'yerel' ? (
            <button
              type="button"
              onClick={() => setStep('main')}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
              aria-label="Geri"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <h2 className="min-w-0 flex-1 text-base font-bold text-[rgb(var(--color-text))]">
            {step === 'yerel' ? 'Yerel alt kategori' : title}
          </h2>
          {saving ? <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--color-muted))]" /> : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {step === 'main' ? (
            categoryGroups.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  {group.label}
                </p>
                {group.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={saving}
                    onClick={() => void pickMain(cat.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium disabled:opacity-50',
                      cat.id === mainCategoryId
                        ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-brand))]'
                        : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                    )}
                  >
                    {cat.parentId ? `↳ ${cat.name}` : cat.name}
                  </button>
                ))}
              </div>
            ))
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void pickYerelSub('')}
                className={cn(
                  'flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium disabled:opacity-50',
                  !yerelParts.subcategoryId
                    ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-brand))]'
                    : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                )}
              >
                Genel yerel
              </button>
              {yerelSubcategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void pickYerelSub(cat.id)}
                  className={cn(
                    'flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium disabled:opacity-50',
                    cat.id === yerelParts.subcategoryId
                      ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-brand))]'
                      : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
                  )}
                >
                  {getYerelSubcategoryShortLabel(cat)}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
