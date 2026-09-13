import type { VideoProvider } from './types'
import { facebookProvider } from './facebook'
import { genericProvider } from './generic'
import { instagramProvider } from './instagram'
import { tiktokProvider } from './tiktok'
import { xProvider } from './x'
import { youtubeProvider } from './youtube'

const PROVIDERS: VideoProvider[] = [
  youtubeProvider,
  instagramProvider,
  tiktokProvider,
  xProvider,
  facebookProvider,
]

export function listVideoProviders(): VideoProvider[] {
  return [...PROVIDERS, genericProvider]
}

export function detectVideoProvider(url: string): VideoProvider {
  for (const provider of PROVIDERS) {
    if (provider.supports(url)) return provider
  }
  if (genericProvider.supports(url)) return genericProvider
  throw new Error('UNSUPPORTED_URL')
}
