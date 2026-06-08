'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LocateFixed, MapPin, Search, X } from 'lucide-react'
import {
  filterProvincesByQuery,
  fuzzyMatchProvinceSlug,
  getCityCategoryName,
  normalizeProvinceSearchTerm,
} from '@/constants/cities'
import { cn } from '@/lib/utils'

const QUICK_PICKS = [
  { slug: 'istanbul', name: 'İstanbul' },
  { slug: 'ankara', name: 'Ankara' },
  { slug: 'izmir', name: 'İzmir' },
] as const

const DEBOUNCE_MS = 200

interface EventCitySearchProps {
  selectedCitySlug: string | null
  onCityChange: (citySlug: string) => void
  onClear: () => void
  nearby?: boolean
  geoLoading?: boolean
  onToggleNearby?: () => void
  disabled?: boolean
}

export function EventCitySearch({
  selectedCitySlug,
  onCityChange,
  onClear,
  nearby = false,
  geoLoading = false,
  onToggleNearby,
  disabled = false,
}: EventCitySearchProps) {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [fuzzyHint, setFuzzyHint] = useState<string | null>(null)

  const selectedName = selectedCitySlug ? getCityCategoryName(selectedCitySlug) : null

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const suggestions = filterProvincesByQuery(debouncedQuery, 8)

  useEffect(() => {
    setHighlightIndex(0)
  }, [debouncedQuery])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
        setFuzzyHint(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const selectCity = useCallback(
    (slug: string) => {
      onCityChange(slug)
      setQuery('')
      setDebouncedQuery('')
      setOpen(false)
      setFuzzyHint(null)
      inputRef.current?.blur()
    },
    [onCityChange]
  )

  const tryFuzzySubmit = useCallback(() => {
    const trimmed = query.trim()
    if (!trimmed) return

    const exact = suggestions.find(
      (s) => normalizeProvinceSearchTerm(s.name) === normalizeProvinceSearchTerm(trimmed)
    )
    if (exact) {
      selectCity(exact.slug)
      return
    }

    const fuzzy = fuzzyMatchProvinceSlug(trimmed)
    if (fuzzy) {
      const matchedName = getCityCategoryName(fuzzy)
      if (normalizeProvinceSearchTerm(matchedName) !== normalizeProvinceSearchTerm(trimmed)) {
        setFuzzyHint(`"${matchedName}" olarak eşleştirildi`)
      }
      selectCity(fuzzy)
      return
    }

    setFuzzyHint('Eşleşen şehir bulunamadı')
  }, [query, suggestions, selectCity])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      setHighlightIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (open && suggestions[highlightIndex]) {
        selectCity(suggestions[highlightIndex].slug)
      } else {
        tryFuzzySubmit()
      }
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setFuzzyHint(null)
      inputRef.current?.blur()
    }
  }

  const showClear = !!selectedCitySlug && !nearby && !disabled

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div ref={containerRef} className="relative min-w-0 flex-1">
          <label htmlFor={`${listboxId}-input`} className="sr-only">
            Şehir ara
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]"
              aria-hidden
            />
            <input
              ref={inputRef}
              id={`${listboxId}-input`}
              type="search"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${listboxId}-listbox`}
              aria-autocomplete="list"
              aria-activedescendant={
                open && suggestions[highlightIndex]
                  ? `${listboxId}-option-${suggestions[highlightIndex].slug}`
                  : undefined
              }
              autoComplete="off"
              enterKeyHint="search"
              disabled={disabled || nearby}
              placeholder={nearby ? 'Yakınımdaki modu aktif' : 'Şehir ara...'}
              value={open ? query : (selectedName ?? query)}
              onChange={(e) => {
                setQuery(e.target.value)
                setFuzzyHint(null)
                if (!open) setOpen(true)
              }}
              onFocus={() => {
                setQuery(selectedName ?? '')
                setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'w-full rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2.5 pl-10 pr-10 text-sm text-[rgb(var(--color-text))] shadow-sm placeholder:text-[rgb(var(--color-muted))] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:cursor-not-allowed disabled:opacity-60'
              )}
            />
            {showClear && (
              <button
                type="button"
                onClick={() => {
                  onClear()
                  setQuery('')
                  setFuzzyHint(null)
                  setOpen(false)
                }}
                aria-label="Şehir seçimini temizle"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface-elevated))] hover:text-[rgb(var(--color-text))]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {open && !nearby && !disabled && suggestions.length > 0 && (
            <ul
              id={`${listboxId}-listbox`}
              role="listbox"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-1 shadow-lg"
            >
              {suggestions.map((city, index) => (
                <li
                  key={city.slug}
                  id={`${listboxId}-option-${city.slug}`}
                  role="option"
                  aria-selected={selectedCitySlug === city.slug}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCity(city.slug)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                      index === highlightIndex
                        ? 'bg-brand-600/10 text-brand-700 dark:text-brand-300'
                        : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface-elevated))]',
                      selectedCitySlug === city.slug && 'font-semibold'
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-muted))]" />
                    {city.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {onToggleNearby && (
          <button
            type="button"
            onClick={onToggleNearby}
            disabled={geoLoading}
            aria-pressed={nearby}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-colors sm:w-auto',
              nearby
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface-elevated))]',
              geoLoading && 'opacity-60'
            )}
          >
            <LocateFixed className={cn('h-4 w-4', geoLoading && 'animate-pulse')} />
            Konum seç
          </button>
        )}
      </div>

      {selectedName && !nearby && (
        <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-muted))]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
          <span>
            Seçili: <span className="font-semibold text-[rgb(var(--color-text))]">{selectedName}</span>
          </span>
        </p>
      )}

      {fuzzyHint && (
        <p className="text-xs text-[rgb(var(--color-muted))]" role="status">
          {fuzzyHint}
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {QUICK_PICKS.map((city) => (
          <button
            key={city.slug}
            type="button"
            disabled={disabled || nearby}
            onClick={() => selectCity(city.slug)}
            className={cn(
              'filter-chip',
              selectedCitySlug === city.slug && !nearby && 'filter-chip-active',
              (disabled || nearby) && 'opacity-60'
            )}
          >
            {city.name}
          </button>
        ))}
      </div>
    </div>
  )
}
