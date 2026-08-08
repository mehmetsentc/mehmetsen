'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Bell, Menu } from 'lucide-react'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { cn } from '@/lib/utils'

interface CityHeaderProps {
  cityName: string
}

export function CityHeader({ cityName }: CityHeaderProps) {
  const router = useRouter()

  return (
    <header
      className={cn(
        'sticky top-0 z-40',
        'bg-[rgb(var(--header-brand-bg))] text-white',
        'pt-[env(safe-area-inset-top,0px)]'
      )}
    >
      <div className="flex h-14 items-center gap-1.5 px-3">
        <Link href="/" className="flex min-w-0 flex-1 items-baseline gap-1.5" aria-label="NaHaber">
          <BrandWordmark variant="onBrand" size="sm" className="font-black text-[1.35rem]" />
          <span className="truncate text-xs font-bold uppercase tracking-wider text-white/80">
            {cityName}
          </span>
        </Link>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => router.push('/search')}
            className="flex h-10 w-10 items-center justify-center text-white"
            aria-label="Ara"
          >
            <Search className="h-5 w-5" strokeWidth={2} />
          </button>
          <Link
            href="/notifications"
            className="flex h-10 w-10 items-center justify-center text-white"
            aria-label="Bildirimler"
          >
            <Bell className="h-5 w-5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  )
}
