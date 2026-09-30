'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import type { MediaItem } from '@/types/post'
import { SliderImage } from '@/components/widgets/SliderImage'
import { Modal } from '@/components/ui/Modal'
import { isEmbedPlayerUrl } from '@/lib/videoEmbed'
import { PublisherVideoPrerollPlayer } from '@/components/publisher/PublisherVideoPrerollPlayer'
import type { PublisherAdViewModel } from '@/components/publisher/PublisherAdRenderer'

function playbackUrl(url: string): string {
  if (!isEmbedPlayerUrl(url) || /[?&]autoplay=/.test(url)) return url
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}autoplay=1&rel=0&modestbranding=1&playsinline=1`
}

/** Cover image stays visible; the corner play control opens the attached video. */
export function ArticleCoverPlay({
  image,
  video,
  title,
  prerollAd,
  prerollEnabled,
}: {
  image: MediaItem
  video: MediaItem
  title: string
  prerollAd?: PublisherAdViewModel | null
  prerollEnabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const isEmbed = isEmbedPlayerUrl(video.url)
  const usePreroll = !isEmbed && prerollEnabled && Boolean(prerollAd?.mediaUrl)

  return (
    <figure className="news-article-hero-block relative">
      <div className="news-article-hero">
        <SliderImage
          src={image.url}
          alt={image.alt ?? image.caption ?? title}
          priority
          fit="natural"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Videoyu oynat"
          className="absolute bottom-3 left-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/75 text-white shadow-md ring-2 ring-white/90 transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Play className="ml-0.5 h-5 w-5 fill-white" aria-hidden />
        </button>
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/70">
          nahaber.com
        </span>
      </div>
      {(image.caption || image.credit) && (
        <figcaption className="py-2 text-xs text-[rgb(var(--color-muted))]">
          {image.caption}
          {image.caption && image.credit && <span className="mx-1">·</span>}
          {image.credit && <span className="font-medium">{image.credit}</span>}
        </figcaption>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={video.caption?.trim() || 'Video'} size="xl">
        {usePreroll ? (
          <PublisherVideoPrerollPlayer
            contentUrl={video.url}
            contentPoster={image.url}
            contentTitle={title}
            isEmbed={false}
            ad={prerollAd ?? null}
            enabled
          />
        ) : (
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {isEmbed ? (
              <iframe
                src={playbackUrl(video.url)}
                title={video.caption?.trim() || title}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={video.url}
                poster={image.url}
                controls
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
          </div>
        )}
      </Modal>
    </figure>
  )
}
