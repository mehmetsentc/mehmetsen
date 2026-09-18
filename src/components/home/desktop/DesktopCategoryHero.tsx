import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import { desktopCategorySlogan } from '@/lib/home/desktopCategoryPortal'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

type DesktopCategoryHeroProps = {
  title: string
  categoryId: string
  lead?: NewsItem | null
  className?: string
}

export function DesktopCategoryHero({
  title,
  categoryId,
  lead = null,
  className,
}: DesktopCategoryHeroProps) {
  const accent = getCategoryAccent(categoryId)
  const slogan = desktopCategorySlogan(categoryId)
  const leadImage = lead?.imageUrl?.trim()
  const clock = lead ? formatNewsClockTime(lead.publishedAt ?? lead.createdAt) : null
  const dek = lead?.summary || lead?.description

  return (
    <section
      className={cn('dcp-hero', className)}
      aria-label={title}
      data-testid="desktop-category-hero"
      style={{ ['--cat-accent' as string]: accent.rgb }}
    >
      <header className="dcp-head">
        <p className="dcp-head__kicker">{accent.kicker}</p>
        <h1 className="dcp-head__title">{title}</h1>
        <p className="dcp-head__slogan">{slogan}</p>
      </header>

      {lead && leadImage ? (
        <article className="dcp-lead">
          <Link href={newsItemDetailHref(lead)} className="dcp-lead__media">
            <SafeNewsImage
              src={leadImage}
              alt={lead.title}
              fill
              priority
              sizes="(min-width: 1440px) 1440px, (min-width: 1024px) 1280px, 100vw"
              className="object-cover"
            />
            <span className="dcp-lead__shade" aria-hidden />
            <span className="dcp-lead__copy">
              {clock ? <span className="dcp-lead__time">{clock}</span> : null}
              <span className="dcp-lead__title">{lead.seoTitle || lead.title}</span>
              {dek ? <span className="dcp-lead__dek">{dek}</span> : null}
            </span>
          </Link>
        </article>
      ) : lead ? (
        <article className="dcp-lead dcp-lead--text">
          <Link href={newsItemDetailHref(lead)} className="dcp-lead__text">
            {clock ? <span className="dcp-lead__time">{clock}</span> : null}
            <span className="dcp-lead__title">{lead.seoTitle || lead.title}</span>
            {dek ? <span className="dcp-lead__dek">{dek}</span> : null}
          </Link>
        </article>
      ) : null}
    </section>
  )
}
