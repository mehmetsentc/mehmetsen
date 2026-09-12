import { getImageProps } from 'next/image'
import { shouldUseNextImage } from '@/lib/news/shouldUseNextImage'

/** Must match FeaturedSlider SafeNewsImage sizes + quality. */
export const LCP_IMAGE_SIZES = '(max-width: 768px) 100vw, 860px'
export const LCP_IMAGE_QUALITY = 55

export type LcpPreload = {
  href: string
  imagesrcset?: string
  imagesizes: string
}

/** Preload descriptors for LCP hero — optimized WebP via next/image, not raw RSS CDN. */
export function getLcpPreload(imageUrl: string): LcpPreload | null {
  if (!shouldUseNextImage(imageUrl)) return null

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
