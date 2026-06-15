import { getImageProps } from 'next/image'
import { isKnownNewsImageHost } from '@/constants/imageHosts'

function parseHostname(src: string): string | null {
  try {
    const raw = src.startsWith('//') ? `https:${src}` : src
    if (raw.startsWith('/')) return null
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Preload URL for LCP hero — optimized WebP via next/image, not raw RSS CDN. */
export function getLcpPreloadHref(imageUrl: string): string | null {
  const hostname = parseHostname(imageUrl)
  if (hostname && !isKnownNewsImageHost(hostname)) return null

  const { props } = getImageProps({
    src: imageUrl,
    alt: '',
    width: 640,
    height: 352,
    quality: 60,
    sizes: '(max-width: 768px) 100vw, 1200px',
  })

  return props.src
}
