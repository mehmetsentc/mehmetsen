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

export function ArticleBlocksRenderer({
  blocks,
  title,
  longform = false,
}: ArticleBlocksRendererProps) {
  return (
    <div
      className={`article-prose news-body article-blocks text-[17px] leading-[1.85] text-[rgb(var(--color-text))] sm:text-[18px] ${
        longform ? 'article-blocks-longform' : ''
      }`}
    >
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const id = headingAnchor(block.text, `bolum-${index + 1}`)
          return block.level === 3 ? (
            <h3 key={block.id} id={id} className="article-block-heading article-block-h3">
              {block.text}
            </h3>
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
