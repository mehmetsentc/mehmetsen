import { Fragment } from 'react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ArticleGallery } from '@/components/news/ArticleGallery'
import {
  articleBlockImages,
  headingAnchor,
  type ArticleBlock,
} from '@/lib/articleBlocks'

interface ArticleBlocksRendererProps {
  blocks: ArticleBlock[]
  title: string
  longform?: boolean
}

function toYouTubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url)
    let id: string | null = null
    if (parsed.hostname === 'youtu.be') id = parsed.pathname.slice(1).split('/')[0] || null
    if (parsed.hostname.includes('youtube.com')) {
      id = parsed.searchParams.get('v')
      if (!id) id = parsed.pathname.match(/\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/)?.[1] ?? null
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null
  } catch {
    return null
  }
}

export function ArticleBlocksRenderer({
  blocks,
  title,
  longform = false,
}: ArticleBlocksRendererProps) {
  return (
    <div
      className={`article-prose news-body article-blocks text-[17px] leading-[1.85] text-[rgb(var(--color-body))] sm:text-[18px] ${
        longform ? 'article-blocks-longform' : ''
      }`}
    >
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const id = headingAnchor(block.text, `bolum-${index + 1}`)
          return block.level === 1 ? (
            <h1 key={block.id} id={id} className="article-block-heading article-block-h1">
              {block.text}
            </h1>
          ) : block.level === 3 ? (
            <h3 key={block.id} id={id} className="article-block-heading article-block-h3">
              {block.text}
            </h3>
          ) : block.level === 4 ? (
            <h4 key={block.id} id={id} className="article-block-heading article-block-h4">
              {block.text}
            </h4>
          ) : (
            <h2 key={block.id} id={id} className="article-block-heading article-block-h2">
              {block.text}
            </h2>
          )
        }

        if (block.type === 'paragraph') {
          return <p key={block.id}>{block.text}</p>
        }

        if (block.type === 'list') {
          const List = block.style === 'ordered' ? 'ol' : 'ul'
          return (
            <List key={block.id} className={block.style === 'ordered' ? 'list-decimal' : 'list-disc'}>
              {block.items.map((item, itemIndex) => (
                <li key={`${block.id}-${itemIndex}`}>{item}</li>
              ))}
            </List>
          )
        }

        if (block.type === 'image') {
          return (
            <figure key={block.id} className="article-block-media">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-[rgb(var(--color-surface))]">
                <SafeNewsImage
                  src={block.url}
                  alt={block.alt || block.caption || title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 760px"
                />
              </div>
              {(block.caption || block.credit) && (
                <figcaption>
                  {block.caption}
                  {block.caption && block.credit ? <span className="mx-1">·</span> : null}
                  {block.credit ? <span className="font-medium">{block.credit}</span> : null}
                </figcaption>
              )}
            </figure>
          )
        }

        if (block.type === 'video') {
          const youtubeEmbed = toYouTubeEmbed(block.url)
          return (
            <figure key={block.id} className="article-block-media article-block-video">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                {youtubeEmbed ? (
                  <iframe
                    src={youtubeEmbed}
                    title={block.caption || `${title} videosu`}
                    className="h-full w-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={block.url} controls preload="metadata" className="h-full w-full object-contain" />
                )}
              </div>
              {block.caption && <figcaption>{block.caption}</figcaption>}
            </figure>
          )
        }

        if (block.type === 'gallery') {
          return (
            <div key={block.id} className="article-block-gallery">
              <ArticleGallery
                items={articleBlockImages(block)}
                title={title}
                columns={block.columns}
              />
            </div>
          )
        }

        return (
          <Fragment key={block.id}>
            <hr className="article-block-divider" />
          </Fragment>
        )
      })}
    </div>
  )
}
