import { describe, expect, it } from 'vitest'
import { arrangeVideoAware } from './videoAwareOrder'

const row = (id: string, video = false) => ({ id, video: video ? `https://v/${id}.mp4` : null })
const ids = (r: { id: string }[]) => r.map((x) => x.id).join(' ')

describe('FEED-UX-2 video-aware page order', () => {
  it('lifts a video three places, keeps the first card and the page contents', () => {
    const page = [row('a'), row('b'), row('c'), row('d'), row('e'), row('V', true), row('f')]
    const out = arrangeVideoAware(page)
    expect(ids(out)).toBe('a b V c d e f')
    expect(out.length).toBe(page.length)
  })
  it('keeps two videos apart when it can', () => {
    const out = arrangeVideoAware([row('a'), row('b'), row('V1', true), row('V2', true), row('c'), row('d')])
    expect(ids(out)).toBe('a V1 b V2 c d')
  })
  it('is a no-op without videos or when switched off', () => {
    const page = [row('a'), row('b'), row('c')]
    expect(arrangeVideoAware(page)).toBe(page)
    process.env.FEED_VIDEO_BOOST = 'off'
    const v = [row('a'), row('b'), row('c'), row('V', true)]
    expect(arrangeVideoAware(v)).toBe(v)
    delete process.env.FEED_VIDEO_BOOST
  })
})
