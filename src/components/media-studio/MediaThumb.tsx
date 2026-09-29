import { cn } from '@/lib/utils'

const SCENES: { hue: number; src: string }[] = [
  { hue: 198, src: '/media-studio/mock/shore.svg' },
  { hue: 168, src: '/media-studio/mock/coast.svg' },
  { hue: 28, src: '/media-studio/mock/market.svg' },
  { hue: 262, src: '/media-studio/mock/harbor.svg' },
  { hue: 220, src: '/media-studio/mock/city.svg' },
  { hue: 210, src: '/media-studio/mock/city.svg' },
  { hue: 350, src: '/media-studio/mock/stone.svg' },
  { hue: 12, src: '/media-studio/mock/stone.svg' },
  { hue: 0, src: '/media-studio/mock/stone.svg' },
  { hue: 120, src: '/media-studio/mock/grove.svg' },
  { hue: 140, src: '/media-studio/mock/grove.svg' },
  { hue: 250, src: '/media-studio/mock/night.svg' },
  { hue: 330, src: '/media-studio/mock/night.svg' },
]

function sceneForHue(hue: number): string {
  let best = SCENES[0]
  let distance = 360
  for (const scene of SCENES) {
    const delta = Math.abs(scene.hue - hue) % 360
    const wrapped = Math.min(delta, 360 - delta)
    if (wrapped < distance) {
      distance = wrapped
      best = scene
    }
  }
  return best.src
}

/** Local generated still. No remote fetch. */
export function MediaThumb({
  hue,
  src,
  className,
  label,
}: {
  hue: number
  src?: string
  className?: string
  label?: string
}) {
  return (
    <img
      src={src || sceneForHue(hue)}
      alt={label ?? ''}
      className={cn('bg-[rgb(var(--color-surface))] object-cover', className)}
    />
  )
}
