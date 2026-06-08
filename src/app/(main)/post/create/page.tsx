'use client'

import { useState } from 'react'
import { Newspaper, Clapperboard, ImageIcon } from 'lucide-react'
import { PostEditor } from '@/components/post/PostEditor'
import { cn } from '@/lib/utils'

type CreateType = 'news' | 'video' | 'photo'

const TABS: { id: CreateType; label: string; icon: typeof Newspaper; desc: string }[] = [
  { id: 'news', label: 'Haber', icon: Newspaper, desc: 'Metin ve görsel haber paylaş' },
  { id: 'video', label: 'Video', icon: Clapperboard, desc: 'Kısa video / Teve yükle' },
  { id: 'photo', label: 'Fotoğraf', icon: ImageIcon, desc: 'Fotoğraf galerisi oluştur' },
]

export default function CreatePostPage() {
  const [type, setType] = useState<CreateType>('news')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">İçerik Oluştur</h1>
        <p className="page-subtitle">Haber, video veya fotoğraf paylaş</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TABS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all',
              type === id
                ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-400'
                : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:border-[rgb(var(--color-muted))]'
            )}
          >
            <Icon className="h-6 w-6" />
            <span className="text-sm font-semibold">{label}</span>
            <span className="hidden text-xs text-[rgb(var(--color-muted))] sm:block">{desc}</span>
          </button>
        ))}
      </div>

      <div className="surface-card p-4 sm:p-6">
        <PostEditor mode={type} />
      </div>
    </div>
  )
}
