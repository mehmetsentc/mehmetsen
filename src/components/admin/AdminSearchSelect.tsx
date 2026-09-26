'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchSelectOption {
  value: string
  label: string
}

export interface SearchSelectGroup {
  label?: string
  options: SearchSelectOption[]
}

function foldTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

export function AdminSearchSelect({
  value,
  onChange,
  groups,
  placeholder = '1-2 harf yazın',
  emptyLabel = '— seçin —',
  disabled,
  className,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  groups: SearchSelectGroup[]
  placeholder?: string
  emptyLabel?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [style, setStyle] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = useMemo(() => {
    for (const group of groups) {
      const hit = group.options.find((option) => option.value === value)
      if (hit) return hit
    }
    return null
  }, [groups, value])

  const filtered = useMemo(() => {
    const needle = foldTr(query.trim())
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => foldTr(option.label).includes(needle)),
      }))
      .filter((group) => group.options.length > 0)
  }, [groups, query])

  const flat = useMemo(
    () => filtered.flatMap((group) => group.options),
    [filtered]
  )

  const place = () => {
    const anchor = buttonRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = Math.max(rect.width, 260)
    const margin = 8
    const panelMaxH = 320
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
    const top = openUp
      ? Math.max(margin, rect.top - Math.min(panelMaxH, spaceAbove))
      : rect.bottom + 4
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
    setStyle({ top, left, width })
  }

  useEffect(() => {
    if (!open) return
    place()
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return
          setOpen((current) => !current)
          setQuery('')
        }}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-left text-sm text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
          className
        )}
      >
        <span className={cn('truncate', !selected && 'text-[rgb(var(--color-muted))]')}>
          {selected?.label || emptyLabel}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60', open && 'rotate-180')} />
      </button>
      {open && style && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: style.top, left: style.left, width: style.width, zIndex: 10000 }}
          className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-xl"
        >
          <div className="border-b border-[rgb(var(--color-border))] p-2">
            <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-muted))]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setOpen(false)
                    return
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActiveIndex((index) => Math.min(index + 1, Math.max(flat.length - 1, 0)))
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActiveIndex((index) => Math.max(index - 1, 0))
                    return
                  }
                  if (event.key === 'Enter' && flat[activeIndex]) {
                    event.preventDefault()
                    choose(flat[activeIndex].value)
                  }
                }}
                placeholder={placeholder}
                className="h-8 w-full bg-transparent text-sm text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))]"
                aria-label={ariaLabel ? `${ariaLabel} ara` : 'Kategori ara'}
              />
            </div>
          </div>
          <div id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {flat.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[rgb(var(--color-muted))]">Eşleşen kategori yok</p>
            ) : (
              filtered.map((group) => (
                <div key={group.label || 'options'} className="mb-1 last:mb-0">
                  {group.label && (
                    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      {group.label}
                    </p>
                  )}
                  {group.options.map((option) => {
                    const index = flat.findIndex((item) => item.value === option.value && item.label === option.label)
                    const active = index === activeIndex
                    const current = option.value === value
                    return (
                      <button
                        key={`${group.label ?? ''}-${option.value}`}
                        type="button"
                        role="option"
                        aria-selected={current}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(option.value)}
                        className={cn(
                          'block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--color-surface))]',
                          active && 'bg-[rgb(var(--color-surface))]',
                          current && 'font-semibold text-blue-700 dark:text-blue-300'
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
