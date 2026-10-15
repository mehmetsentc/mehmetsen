import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn(), getAdminStorage: vi.fn() }))
vi.mock('./renderReel', () => ({ renderReel: vi.fn() }))

import { reelPhotoUrlsFromDoc } from './reelService'

describe('REELS-9 all photos, whole photos, whole text', () => {
  it('collects every photo of a story, cover first, no duplicates or videos', () => {
    const d = {
      thumbnail: 'https://cdn.x/cover.jpg?w=1200',
      mediaItems: [{ type: 'image', url: 'https://cdn.x/a.jpg' }, { type: 'video', url: 'https://cdn.x/v.mp4' }],
      additionalImages: [{ url: 'https://cdn.x/b.jpg' }, 'https://cdn.x/a.jpg'],
      bodyBlocks: [
        { type: 'paragraph', text: 'x' },
        { type: 'image', url: 'https://cdn.x/c.jpg' },
        { type: 'gallery', images: [{ url: 'https://cdn.x/d.jpg' }, { url: 'http://insecure/e.jpg' }] },
      ],
    }
    expect(reelPhotoUrlsFromDoc(d, 'https://cdn.x/cover.jpg')).toEqual([
      'https://cdn.x/cover.jpg', 'https://cdn.x/a.jpg', 'https://cdn.x/b.jpg', 'https://cdn.x/c.jpg', 'https://cdn.x/d.jpg',
    ])
  })
  it('dynamic reel: slideshow, landscape shown whole, no «…» on headline or summary', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/reels/renderDynamic.ts'), 'utf8')
    expect(src).toContain('input.media.more')
    expect(src).toContain('function makeSlide')
    expect(src).toContain('summaryOptions(')
    expect(src).not.toMatch(/wrapLines\([^)]*TEXT_W, \d\)/)
  })
})
