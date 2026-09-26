import { getImageProps } from 'next/image'
import { shouldUseNextImage } from '@/lib/news/shouldUseNextImage'
import { newsImageProxyPath, parsePublicImageUrl } from '@/lib/newsImageProxy'

/** Must match FeaturedSlider SafeNewsImage sizes + quality. */
export const LCP_IMAGE_SIZES = '(max-width: 768px) 100vw, 860px'
export const LCP_IMAGE_QUALITY = 55
/** Homepage headline uses sizes="100vw" + priority → this width. */
export const HOME_LCP_WIDTH = 828
/** Article hero SliderImage requests this width. Category heroes stay at 828. */
export const ARTICLE_LCP_WIDTH = 1200

export type LcpPreload = {
  href: string
  imagesrcset?: string
  imagesizes: string
}

/**
 * Preload the exact URL the hero `<img>` will request.
 * A srcset here made the phone download a second, wider copy and delayed LCP.
 */
export function getLcpPreload(
  imageUrl: string,
  width: number = HOME_LCP_WIDTH
): LcpPreload | null {
  if (!shouldUseNextImage(imageUrl)) {
    if (!parsePublicImageUrl(imageUrl)) return null
    return {
      href: newsImageProxyPath(imageUrl, width),
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
