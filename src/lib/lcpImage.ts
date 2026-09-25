import { getImageProps } from 'next/image'
import { shouldUseNextImage } from '@/lib/news/shouldUseNextImage'
import { newsImageProxyPath, parsePublicImageUrl } from '@/lib/newsImageProxy'

/** Must match FeaturedSlider SafeNewsImage sizes + quality. */
export const LCP_IMAGE_SIZES = '(max-width: 768px) 100vw, 860px'
export const LCP_IMAGE_QUALITY = 55

export type LcpPreload = {
  href: string
  imagesrcset?: string
  imagesizes: string
}

/** Preload descriptors for LCP hero — resized WebP, not the raw publisher PNG. */
export function getLcpPreload(imageUrl: string): LcpPreload | null {
  if (!shouldUseNextImage(imageUrl)) {
    if (!parsePublicImageUrl(imageUrl)) return null
    const narrow = newsImageProxyPath(imageUrl, 828)
    const wide = newsImageProxyPath(imageUrl, 1200)
    return {
      href: wide,
      imagesrcset: `${narrow} 828w, ${wide} 1200w`,
      imagesizes: LCP_IMAGE_SIZES,
    }
  }

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
