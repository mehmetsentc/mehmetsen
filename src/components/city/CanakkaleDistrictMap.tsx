'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  CANAKKALE_MAP_DISTRICTS,
  districtMatchesCanakkaleRegion,
  type CanakkaleRegionId,
} from '@/constants/canakkaleDistricts'
import { DISTRICT_DISPLAY_NAMES } from '@/constants/cities'

interface CanakkaleDistrictMapProps {
  activeRegion: CanakkaleRegionId
  hoveredSlug: string | null
  onHover: (slug: string | null) => void
  className?: string
}

export function CanakkaleDistrictMap({
  activeRegion,
  hoveredSlug,
  onHover,
  className,
}: CanakkaleDistrictMapProps) {
  const router = useRouter()

  const handleSelect = (slug: string) => {
    router.push(`/ilceler/${slug}`)
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-[rgb(var(--color-border))]',
        'bg-[rgb(var(--header-navy-bg))] shadow-sm',
        className
      )}
    >
      <svg
        viewBox="0 0 480 340"
        role="img"
        aria-label="Çanakkale ilçe haritası — ilçe seçmek için dokunun veya tıklayın"
        className="h-auto w-full touch-manipulation select-none"
      >
        <defs>
          <linearGradient id="canakkale-sea" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(17 25 43)" />
            <stop offset="100%" stopColor="rgb(24 36 62)" />
          </linearGradient>
          <filter id="canakkale-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgb(255 51 68 / 0.55)" />
          </filter>
        </defs>

        <rect width="480" height="340" fill="url(#canakkale-sea)" />

        {/* Dardanelles strait */}
        <path
          d="M118 30 L138 30 L132 310 L112 310 Z"
          fill="rgb(255 255 255 / 0.06)"
          aria-hidden
        />

        {/* Decorative compass */}
        <g opacity="0.35" aria-hidden>
          <circle cx="430" cy="36" r="18" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="1" />
          <text x="430" y="40" textAnchor="middle" fill="rgb(255 255 255 / 0.5)" fontSize="10" fontWeight="700">
            N
          </text>
        </g>

        {CANAKKALE_MAP_DISTRICTS.map((district) => {
          const name = DISTRICT_DISPLAY_NAMES[district.slug] ?? district.shortLabel ?? district.slug
          const inRegion = districtMatchesCanakkaleRegion(district.slug, activeRegion)
          const isHovered = hoveredSlug === district.slug
          const dimmed = activeRegion !== 'all' && !inRegion

          return (
            <g key={district.slug}>
              <path
                d={district.d}
                tabIndex={0}
                role="link"
                aria-label={`${name} ilçesi haberleri`}
                className={cn(
                  'cursor-pointer outline-none transition-all duration-200',
                  'focus-visible:stroke-[rgb(var(--color-brand))] focus-visible:stroke-[2.5]'
                )}
                fill={
                  isHovered
                    ? 'rgb(var(--color-brand))'
                    : dimmed
                      ? 'rgb(255 255 255 / 0.08)'
                      : 'rgb(255 255 255 / 0.18)'
                }
                stroke={
                  isHovered
                    ? 'rgb(255 255 255 / 0.85)'
                    : dimmed
                      ? 'rgb(255 255 255 / 0.12)'
                      : 'rgb(255 255 255 / 0.35)'
                }
                strokeWidth={isHovered ? 2 : 1.25}
                filter={isHovered ? 'url(#canakkale-glow)' : undefined}
                onMouseEnter={() => onHover(district.slug)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(district.slug)}
                onBlur={() => onHover(null)}
                onClick={() => handleSelect(district.slug)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleSelect(district.slug)
                  }
                }}
              />
              <text
                x={district.labelX}
                y={district.labelY}
                textAnchor="middle"
                pointerEvents="none"
                fill={isHovered ? 'rgb(255 255 255)' : dimmed ? 'rgb(255 255 255 / 0.35)' : 'rgb(255 255 255 / 0.82)'}
                fontSize={district.slug === 'gokceada' || district.slug === 'bozcaada' ? 9 : 10}
                fontWeight={isHovered ? 700 : 600}
              >
                {district.shortLabel ?? name}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="border-t border-white/10 px-4 py-2.5 text-center text-[11px] text-white/50">
        Haritadan veya listeden ilçe seçin
      </p>
    </div>
  )
}
