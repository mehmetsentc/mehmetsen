import { cn } from '@/lib/utils'

/**
 * The red «E» sign every Turkish pharmacy hangs outside — instantly readable as
 * «eczane». `live` adds a soft pulsing ring for pharmacies on duty right now.
 */
export function PharmacyMark({
  size = 40,
  live = false,
  className,
}: {
  size?: number
  live?: boolean
  className?: string
}) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {live ? (
        <span className="absolute inset-0 animate-ping rounded-[28%] bg-red-500/35 motion-reduce:animate-none" />
      ) : null}
      <svg viewBox="0 0 40 40" width={size} height={size} className="relative drop-shadow-sm">
        <rect x="1" y="1" width="38" height="38" rx="11" fill="#e30a17" />
        <rect x="4" y="4" width="32" height="32" rx="8.5" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
        <path d="M13 10.5h14v4.2h-9.2v3.4h8.3v4h-8.3v3.7H27v4.2H13z" fill="#fff" />
      </svg>
    </span>
  )
}
