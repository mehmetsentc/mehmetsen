'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Zap } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { Badge } from '@/components/ui/Badge'
import type { NewsItem } from '@/types/newsItem'

interface BreakingStoriesProps {
  items: NewsItem[]
}

// Container: çocuklarını staggered olarak çağırır
const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
}

// Item: alta doğru hafif şişen + opaklaşan giriş
const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 220, damping: 28, mass: 0.7 } as const,
  },
}

function StoryCard({ item, priority = false }: { item: NewsItem; priority?: boolean }) {
  const href = newsItemDetailHref(item)
  const image = item.imageUrl || FEED_FALLBACK_LOGO

  return (
    <motion.div variants={ITEM_VARIANTS} className="shrink-0 snap-start">
      <Link
        href={href}
        className="group/story relative block h-[290px] w-[163px] overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/5 transition-transform duration-quick ease-out-soft hover:-translate-y-0.5 hover:shadow-xl"
        style={{ aspectRatio: '9/16' }}
      >
        <SafeNewsImage
          src={image}
          alt={item.title}
          fill
          sizes="163px"
          priority={priority}
          className="object-cover transition-transform duration-slow ease-out-soft group-hover/story:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" />

        <Badge
          variant="sondakika"
          size="sm"
          uppercase
          pulse
          className="absolute left-2 top-2 shadow-lg"
        >
          Son Dakika
        </Badge>

        <span className="absolute bottom-9 right-2 text-[8px] font-bold tracking-wide text-white/60">
          nahaber.com
        </span>
        <p className="absolute bottom-0 left-0 right-0 line-clamp-3 px-2.5 pb-3 text-[12px] font-bold leading-snug text-white">
          {item.title}
        </p>
      </Link>
    </motion.div>
  )
}

export function BreakingStories({ items }: BreakingStoriesProps) {
  return (
    <section className="home-section" aria-label="Son dakika hikayeleri">
      <div className="home-section-header">
        <Zap className="h-4 w-4 text-brand-500" />
        <h2 className="home-section-title">Son Dakika</h2>
      </div>

      {items.length === 0 ? (
        <div className="mx-1 rounded-2xl border border-dashed border-border bg-bg-card px-4 py-8 text-center">
          <p className="text-sm font-medium text-text-tertiary">
            Şu an aktif son dakika haberi yok.
          </p>
        </div>
      ) : (
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="show"
          className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory"
        >
          <motion.div variants={ITEM_VARIANTS} className="shrink-0 snap-start">
            <Link
              href={ROUTES.CATEGORY('son-dakika')}
              className="relative flex h-[290px] w-[163px] flex-col items-center justify-center overflow-hidden rounded-2xl p-3 text-center shadow-brand transition-transform duration-quick ease-out-soft hover:-translate-y-0.5"
              style={{
                aspectRatio: '9/16',
                background:
                  'linear-gradient(135deg, rgb(var(--brand-600)) 0%, rgb(var(--brand-700)) 60%, rgb(var(--brand-900)) 100%)',
              }}
            >
              <Zap className="mb-2 h-8 w-8 text-white" />
              <span className="text-sm font-black uppercase leading-tight text-white">
                Tüm Son Dakika
              </span>
            </Link>
          </motion.div>
          {items.map((item, index) => (
            <StoryCard key={item.id} item={item} priority={index === 0} />
          ))}
        </motion.div>
      )}
    </section>
  )
}
