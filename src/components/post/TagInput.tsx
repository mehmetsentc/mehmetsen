'use client'

import { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { addTag, formatTagLabel, removeTag } from '@/lib/tags'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({
  tags,
  onChange,
  placeholder = 'gündem, spor, çanakkale…',
}: TagInputProps) {
  const [input, setInput] = useState('')

  const commitInput = () => {
    if (!input.trim()) return
    const next = addTag(tags, input)
    if (next.length === tags.length) return
    onChange(next)
    setInput('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitInput()
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          >
            {formatTagLabel(tag)}
            <button
              type="button"
              onClick={() => onChange(removeTag(tags, tag))}
              className="rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900"
              aria-label={`${tag} etiketini kaldır`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitInput}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none"
        />
      </div>
      <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
        Enter veya virgül ile ekleyin. Örnek: #gündem #spor — en fazla 8 etiket.
      </p>
    </div>
  )
}
