import { cn } from '@/lib/utils'

interface NewsArticlePageProps {
  children: React.ReactNode
  className?: string
  id?: string
  articleId?: string
}

/** Responsive article column — phone → TV, sidebar open/closed aware via CSS. */
export function NewsArticlePage({ children, className, id, articleId }: NewsArticlePageProps) {
  return (
    <div id={id} className={cn('news-article-page', className)} data-article-id={articleId}>
      {children}
    </div>
  )
}

interface NewsArticleCardProps {
  children: React.ReactNode
  className?: string
  continued?: boolean
}

export function NewsArticleCard({ children, className, continued }: NewsArticleCardProps) {
  return (
    <article
      className={cn(
        'news-article-card overflow-hidden border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
        continued
          ? 'rounded-none border-t-0 sm:rounded-b-2xl'
          : 'rounded-none sm:rounded-2xl',
        className
      )}
    >
      {children}
    </article>
  )
}

export function NewsArticleBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('news-article-body', className)}>{children}</div>
}
