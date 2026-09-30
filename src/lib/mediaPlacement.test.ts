import { describe, expect, it } from 'vitest'
import { planMediaPlacement } from '@/lib/mediaPlacement'
import type { MediaItem } from '@/types/post'

function image(url: string): MediaItem {
  return { type: 'image', url, thumbnailUrl: url, caption: null }
}

function video(url: string): MediaItem {
  return { type: 'video', url, thumbnailUrl: null, caption: null }
}

describe('planMediaPlacement', () => {
  it('keeps the image as hero when a video is also attached', () => {
    const cover = image('https://cdn.example/a.jpg')
    const clip = video('https://cdn.example/a.mp4')
    const plan = planMediaPlacement([clip, cover], 4)
    expect(plan.hero).toEqual(cover)
    expect([...plan.inlineAfter.values(), ...plan.trailing]).not.toContainEqual(clip)
  })

  it('uses the video as hero when there is no image', () => {
    const clip = video('https://cdn.example/a.mp4')
    const plan = planMediaPlacement([clip], 2)
    expect(plan.hero).toEqual(clip)
  })
})
