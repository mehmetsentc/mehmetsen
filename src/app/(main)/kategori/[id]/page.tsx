import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { CategoryFeed } from '@/components/feed/CategoryFeed'

import { TimelineItemSkeleton } from '@/components/ui/Skeleton'

interface Props {
  params: Promise<{ id: string }>
}

function getCategoryMeta(id: string) {
  return DEFAULT_CATEGORIES.find((c) => c.slug === id) ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) return { title: 'Kategori | NaHaber' }
  return {
    title: `${cat.name} Haberleri | NaHaber`,
    description: `NaHaber'de ${cat.name} kategorisindeki son dakika gelişmeleri ve haberler`,
    openGraph: {
      title: `${cat.name} Haberleri | NaHaber`,
      description: `NaHaber'de ${cat.name} kategorisindeki son dakika gelişmeleri ve haberler`,
    },
  }
}

export function generateStaticParams() {
  return DEFAULT_CATEGORIES.map((cat) => ({ id: cat.slug }))
}

export default async function CategoryPage({ params }: Props) {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) notFound()

  return (
    <div className="w-full">
      {/* Category header */}
      <div
        className="mb-3 flex items-center gap-3 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: `${cat.color}18`, borderLeft: `4px solid ${cat.color}` }}
      >
        <div>
          <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">
            {cat.name}
          </h1>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            {cat.name} kategorisindeki son gelişmeler
          </p>
        </div>
      </div>




      {/* News feed */}
      <Suspense
        fallback={
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <TimelineItemSkeleton key={i} />
            ))}
          </div>
        }
      >
        <CategoryFeed categoryId={cat.id} />
      </Suspense>
    </div>
  )
}
