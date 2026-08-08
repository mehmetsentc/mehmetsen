'use client'

import Link from 'next/link'
import { MapPin, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface District {
  slug: string
  name: string
}

interface CityDistrictsClientProps {
  citySlug: string
  cityName: string
  districts: District[]
}

export function CityDistrictsClient({
  citySlug,
  cityName,
  districts,
}: CityDistrictsClientProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">
        {cityName} İlçeleri
      </h1>

      {districts.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {districts.map((district) => (
            <Link
              key={district.slug}
              href={`/yerel/${citySlug}`}
              className={cn(
                'flex items-center justify-between rounded-xl',
                'border border-[rgb(var(--color-border))]',
                'bg-[rgb(var(--color-surface-raised))] px-4 py-3.5',
                'transition-colors hover:bg-[rgb(var(--color-surface-raised-hover))]'
              )}
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-4.5 w-4.5 shrink-0 text-[rgb(var(--color-brand))]" />
                <span className="font-medium text-[rgb(var(--color-text))]">
                  {district.name}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-[rgb(var(--color-text-secondary))]" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <MapPin className="mx-auto h-12 w-12 text-[rgb(var(--color-text-secondary))]/40" />
          <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            İlçe verisi bulunamadı.
          </p>
        </div>
      )}
    </div>
  )
}
