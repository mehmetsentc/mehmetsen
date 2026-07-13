import { getImageProps } from 'next/image'
import { isKnownNewsImageHost } from '@/constants/imageHosts'

/** Must match FeaturedSlider SafeNewsImage sizes + quality. */
export const LCP_IMAGE_SIZES = '(max-width: 768px) 100vw, 860px'
export const LCP_IMAGE_QUALITY = 55

function parseHostname(src: string): string | null {
  try {
    const raw = src.startsWith('//') ? `https:${src}` : src
    if (raw.startsWith('/')) return null
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

export type LcpPreload = {
  href: string
  imagesrcset?: string
  imagesizes: string
}

/** Preload descriptors for LCP hero — optimized WebP via next/image, not raw RSS CDN. */
export function getLcpPreload(imageUrl: string): LcpPreload | null {
  const hostname = parseHostname(imageUrl)
  if (hostname && !isKnownNewsImageHost(hostname)) return null

  const { props } = getImageProps({
    src: imageUrl,
    alt: '',
    width: 1200,
    height: 675,
    quality: LCP_IMAGE_QUALITY,
    sizes: LCP_IMAGE_SIZES,
  })

  return {
    href: props.src,
    imagesrcset: props.srcSet,
    imagesizes: props.sizes ?? LCP_IMAGE_SIZES,
  }
}

/** @deprecated Prefer getLcpPreload for srcset-aware preload. */
export function getLcpPreloadHref(imageUrl: string): string | null {
  return getLcpPreload(imageUrl)?.href ?? null
}
