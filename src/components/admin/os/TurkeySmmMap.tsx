'use client'

import { TURKEY_PROVINCE_PATHS } from '@/constants/turkeyProvincePaths'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'

type DotStatus = 'active' | 'warn' | 'down' | 'unknown'

const STATUS_FILL: Record<DotStatus, string> = {
  active: '#22c55e',
  warn: '#f59e0b',
  down: '#ef4444',
  unknown: '#94a3b8',
}

/** Reference style: white provinces, black borders, blue sea, grey neighbors. */
const SEA = '#9ec9ea'
const NEIGHBOR = '#c5c9ce'
const PROVINCE_FILL = '#ffffff'
const PROVINCE_ACTIVE = '#dcfce7'
const PROVINCE_STROKE = '#1e293b'

function resolveStatus(slug: string, activeSlugs?: Set<string>): DotStatus {
  if (activeSlugs?.has(slug)) return 'active'
  return 'unknown'
}

export function TurkeySmmMap({
  activeSlugs,
  className,
  showLegend = true,
}: {
  activeSlugs?: Set<string>
  className?: string
  showLegend?: boolean
}) {
  const nameBySlug = new Map(TURKISH_PROVINCES.map((p) => [p.slug, p.name]))
  const activeCount = activeSlugs?.size ?? 0

  // Original paths use viewBox 0 0 1000 338 — pad for sea/neighbors
  const vb = '0 0 1000 380'

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-[rgb(var(--color-border))]',
        className
      )}
    >
      <svg
        viewBox={vb}
        className="h-auto w-full"
        role="img"
        aria-label="81 il Türkiye SMM canlı ağı haritası"
      >
        <defs>
          <filter id="smm-dot-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Seas — Black / Aegean / Mediterranean / Marmara framing */}
        <rect x="0" y="0" width="1000" height="380" fill={SEA} />

        {/* Neighbor landmasses (schematic, non-interactive) */}
        <g aria-hidden fill={NEIGHBOR} stroke="#94a3b8" strokeWidth="0.6">
          {/* Greece / Balkans NW */}
          <path d="M0 40 L70 20 L95 80 L55 130 L0 150 Z" />
          {/* Bulgaria / Thrace north strip */}
          <path d="M70 0 L220 0 L200 35 L90 45 Z" />
          {/* Georgia / Armenia east */}
          <path d="M960 40 L1000 30 L1000 160 L940 150 L930 90 Z" />
          {/* Iran / SE */}
          <path d="M960 160 L1000 160 L1000 320 L940 280 Z" />
          {/* Syria / Iraq south-east */}
          <path d="M620 320 L1000 300 L1000 380 L600 380 Z" />
          {/* Cyprus */}
          <ellipse cx="520" cy="350" rx="28" ry="12" />
        </g>

        {/* Province layer centered vertically in padded canvas */}
        <g transform="translate(0 18)">
          {TURKEY_PROVINCE_PATHS.map((p) => {
            const status = resolveStatus(p.slug, activeSlugs)
            const isActive = status === 'active'
            const label = nameBySlug.get(p.slug) ?? p.name
            return (
              <a key={p.slug} href={`/admin/smm?city=${encodeURIComponent(p.slug)}`}>
                <path
                  d={p.d}
                  fill={isActive ? PROVINCE_ACTIVE : PROVINCE_FILL}
                  stroke={PROVINCE_STROKE}
                  strokeWidth={0.85}
                  strokeLinejoin="round"
                  className="cursor-pointer transition-[fill] duration-150 hover:fill-sky-100"
                >
                  <title>{label}</title>
                </path>
              </a>
            )
          })}

          {TURKEY_PROVINCE_PATHS.map((p) => {
            const status = resolveStatus(p.slug, activeSlugs)
            const label = nameBySlug.get(p.slug) ?? p.name
            return (
              <a key={`${p.slug}-dot`} href={`/admin/smm?city=${encodeURIComponent(p.slug)}`}>
                <g filter={status === 'active' ? 'url(#smm-dot-glow)' : undefined}>
                  {status === 'active' ? (
                    <circle cx={p.cx} cy={p.cy} r={4.2} fill="rgba(34,197,94,0.4)" />
                  ) : null}
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={2.2}
                    fill={STATUS_FILL[status]}
                    stroke="#0f172a"
                    strokeWidth={0.4}
                    className="cursor-pointer"
                  >
                    <title>{label}</title>
                  </circle>
                </g>
              </a>
            )
          })}
        </g>
      </svg>

      {showLegend ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/80 px-3 py-2 text-[10px] text-[rgb(var(--color-muted))]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
            Aktif ({activeCount})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Uyarı
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Pasif
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Seed bekleniyor
          </span>
        </div>
      ) : null}
    </div>
  )
}
