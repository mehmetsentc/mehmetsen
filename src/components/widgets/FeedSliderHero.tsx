import Link from 'next/link'
import type { FeedSliderItem } from '@/types/feedSlider'
import { SLIDER_HEIGHT_CLASS, SLIDER_OUTER_STYLE } from './sliderConstants'
import { SliderImage } from './SliderImage'

interface FeedSliderHeroProps {
  item: FeedSliderItem
}

/** Server-rendered first slide — paints before client JS (LCP). */
export function FeedSliderHero({ item }: FeedSliderHeroProps) {
  return (
    <div style={SLIDER_OUTER_STYLE}>
      <div className={`relative overflow-hidden ${SLIDER_HEIGHT_CLASS}`}>
        <Link href={`/news/${item.slug}`} className="absolute inset-0 block">
          {item.imageUrl ? (
            <SliderImage src={item.imageUrl} alt={item.title} priority />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
                  backgroundSize: '20px 20px',
                }}
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10" />
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-16">
            {item.categoryId && (
              <span className="mb-3 inline-block rounded-sm bg-[rgb(var(--color-brand))] px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-white">
                {item.categoryId.replace('-', ' ')}
              </span>
            )}
            <h2 className="line-clamp-3 text-[22px] font-black leading-snug text-white drop-shadow-lg">
              {item.title}
            </h2>
          </div>
        </Link>
      </div>
    </div>
  )
}
