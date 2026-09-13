export type PlaybackSize = {
  width: number
  height: number
  upscaled: false
}

function even(n: number): number {
  const rounded = Math.max(2, Math.round(n))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

/**
 * Fit to 720p without upscaling. Portrait stays portrait (720 wide if larger);
 * landscape stays landscape (720 tall if larger).
 */
export function computePlaybackSize(
  width: number,
  height: number,
  maxShortEdge = 720
): PlaybackSize {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  const portrait = h > w
  if (portrait) {
    if (w <= maxShortEdge) return { width: even(w), height: even(h), upscaled: false }
    const scaledH = even((h * maxShortEdge) / w)
    return { width: even(maxShortEdge), height: scaledH, upscaled: false }
  }
  if (h <= maxShortEdge) return { width: even(w), height: even(h), upscaled: false }
  const scaledW = even((w * maxShortEdge) / h)
  return { width: scaledW, height: even(maxShortEdge), upscaled: false }
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

export function formatAspectRatio(width: number, height: number): string {
  const g = gcd(width, height)
  return `${Math.round(width / g)}:${Math.round(height / g)}`
}
