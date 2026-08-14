'use client'

import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'

/** Approximate normalized positions for a stylized Turkey outline (viewBox 0 0 100 55). */
const CITY_DOTS: Array<{ slug: string; x: number; y: number }> = [
  { slug: 'edirne', x: 8, y: 12 },
  { slug: 'istanbul', x: 14, y: 14 },
  { slug: 'tekirdag', x: 11, y: 16 },
  { slug: 'kirklareli', x: 10, y: 10 },
  { slug: 'canakkale', x: 9, y: 22 },
  { slug: 'balikesir', x: 13, y: 24 },
  { slug: 'bursa', x: 18, y: 20 },
  { slug: 'yalova', x: 16, y: 17 },
  { slug: 'kocaeli', x: 18, y: 15 },
  { slug: 'sakarya', x: 21, y: 16 },
  { slug: 'bilecik', x: 22, y: 20 },
  { slug: 'izmir', x: 12, y: 30 },
  { slug: 'manisa', x: 15, y: 28 },
  { slug: 'aydin', x: 14, y: 34 },
  { slug: 'mugla', x: 16, y: 38 },
  { slug: 'denizli', x: 19, y: 34 },
  { slug: 'usak', x: 20, y: 28 },
  { slug: 'afyonkarahisar', x: 24, y: 28 },
  { slug: 'kutahya', x: 22, y: 24 },
  { slug: 'eskisehir', x: 26, y: 22 },
  { slug: 'ankara', x: 32, y: 22 },
  { slug: 'bolu', x: 26, y: 16 },
  { slug: 'duzce', x: 24, y: 14 },
  { slug: 'zonguldak', x: 28, y: 12 },
  { slug: 'karabuk', x: 30, y: 14 },
  { slug: 'bartin', x: 30, y: 10 },
  { slug: 'kastamonu', x: 34, y: 12 },
  { slug: 'cankiri', x: 34, y: 18 },
  { slug: 'corum', x: 38, y: 18 },
  { slug: 'sinop', x: 38, y: 10 },
  { slug: 'samsun', x: 44, y: 12 },
  { slug: 'amasya', x: 42, y: 16 },
  { slug: 'tokat', x: 46, y: 18 },
  { slug: 'ordu', x: 50, y: 14 },
  { slug: 'giresun', x: 54, y: 14 },
  { slug: 'trabzon', x: 58, y: 13 },
  { slug: 'rize', x: 62, y: 12 },
  { slug: 'artvin', x: 66, y: 12 },
  { slug: 'gumushane', x: 56, y: 17 },
  { slug: 'bayburt', x: 60, y: 18 },
  { slug: 'erzurum', x: 66, y: 20 },
  { slug: 'erzincan', x: 58, y: 22 },
  { slug: 'sivas', x: 48, y: 24 },
  { slug: 'yozgat', x: 40, y: 24 },
  { slug: 'kirikkale', x: 36, y: 22 },
  { slug: 'kirsehir', x: 38, y: 28 },
  { slug: 'nevsehir', x: 40, y: 32 },
  { slug: 'aksaray', x: 36, y: 34 },
  { slug: 'konya', x: 32, y: 36 },
  { slug: 'karaman', x: 34, y: 42 },
  { slug: 'mersin', x: 38, y: 44 },
  { slug: 'adana', x: 44, y: 42 },
  { slug: 'hatay', x: 48, y: 48 },
  { slug: 'osmaniye', x: 48, y: 42 },
  { slug: 'kahramanmaras', x: 50, y: 36 },
  { slug: 'gaziantep', x: 52, y: 40 },
  { slug: 'kilis', x: 52, y: 44 },
  { slug: 'sanliurfa', x: 58, y: 40 },
  { slug: 'adiyaman', x: 54, y: 34 },
  { slug: 'malatya', x: 54, y: 30 },
  { slug: 'elazig', x: 58, y: 28 },
  { slug: 'tunceli', x: 58, y: 26 },
  { slug: 'bingol', x: 62, y: 28 },
  { slug: 'mus', x: 68, y: 28 },
  { slug: 'bitlis', x: 70, y: 30 },
  { slug: 'siirt', x: 72, y: 32 },
  { slug: 'batman', x: 68, y: 34 },
  { slug: 'diyarbakir', x: 64, y: 34 },
  { slug: 'mardin', x: 68, y: 38 },
  { slug: 'sirnak', x: 74, y: 38 },
  { slug: 'hakkari', x: 78, y: 36 },
  { slug: 'van', x: 76, y: 30 },
  { slug: 'agri', x: 74, y: 24 },
  { slug: 'igdir', x: 78, y: 22 },
  { slug: 'kars', x: 72, y: 18 },
  { slug: 'ardahan', x: 70, y: 14 },
  { slug: 'isparta', x: 24, y: 34 },
  { slug: 'burdur', x: 22, y: 36 },
  { slug: 'antalya', x: 26, y: 42 },
  { slug: 'nigde', x: 40, y: 38 },
  { slug: 'kayseri', x: 44, y: 32 },
]

type DotStatus = 'active' | 'warn' | 'down' | 'unknown'

export function TurkeySmmMap({
  activeSlugs,
  className,
}: {
  activeSlugs?: Set<string>
  className?: string
}) {
  const known = new Set(TURKISH_PROVINCES.map((p) => p.slug))

  return (
    <div className={cn('relative w-full', className)}>
      <svg viewBox="0 0 100 55" className="h-auto w-full" role="img" aria-label="81 il SMM haritası">
        <path
          d="M6 18 C8 8, 18 6, 28 8 C40 6, 52 8, 64 10 C74 8, 84 12, 90 18 C94 24, 92 32, 86 36 C78 42, 68 46, 56 48 C44 50, 34 48, 24 44 C16 40, 10 34, 7 28 C5 24, 5 20, 6 18 Z"
          fill="rgb(226 232 240 / 0.55)"
          stroke="rgb(148 163 184)"
          strokeWidth="0.6"
        />
        {CITY_DOTS.filter((d) => known.has(d.slug)).map((d) => {
          const status: DotStatus = activeSlugs?.has(d.slug) ? 'active' : 'unknown'
          const fillByStatus: Record<DotStatus, string> = {
            active: 'rgb(16 185 129)',
            warn: 'rgb(245 158 11)',
            down: 'rgb(239 68 68)',
            unknown: 'rgb(148 163 184)',
          }
          return (
            <a key={d.slug} href={`/admin/smm?city=${d.slug}`}>
              <circle
                cx={d.x}
                cy={d.y}
                r={1.15}
                fill={fillByStatus[status]}
                className="cursor-pointer hover:opacity-80"
              >
                <title>{d.slug}</title>
              </circle>
            </a>
          )
        })}
      </svg>
    </div>
  )
}
