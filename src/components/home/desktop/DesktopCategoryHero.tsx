import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { desktopCategorySlogan } from '@/lib/home/desktopCategoryPortal'
import { cn } from '@/lib/utils'

type DesktopCategoryHeroProps = {
  title: string
  categoryId: string
  imageUrl?: string
  className?: string
}

export function DesktopCategoryHero({
  title,
  categoryId,
  imageUrl,
  className,
}: DesktopCategoryHeroProps) {
  const accent = getCategoryAccent(categoryId)
  const slogan = desktopCategorySlogan(categoryId)

  return (
    <section
      className={cn('dcp-hero', className)}
      aria-label={title}
      data-testid="desktop-category-hero"
      style={{ ['--cat-accent' as string]: accent.rgb }}
    >
      {imageUrl ? (
        <SafeNewsImage
          src={imageUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="dcp-hero__image object-cover"
        />
      ) : null}
      <div className="dcp-hero__shade" aria-hidden />
      <div className="dcp-hero__copy">
        <h1 className="dcp-hero__title">{title}</h1>
        <p className="dcp-hero__slogan">{slogan}</p>
      </div>
    </section>
  )
}
