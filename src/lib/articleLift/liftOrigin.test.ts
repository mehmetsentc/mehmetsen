import { afterEach, describe, expect, it } from 'vitest'
import {
  captureLiftReaderOrigin,
  clearLiftOrigin,
  focusLiftOrigin,
  getCurrentLiftOrigin,
  getLiftOrigin,
  getLiftReaderOrigin,
  setLiftOrigin,
  shouldCaptureLiftReaderOrigin,
} from '@/lib/articleLift/liftOrigin'
import { applyLiftReaderOriginScroll } from '@/lib/articleLift/liftReaderScroll'

function fakeElement(rect: { top: number; left: number; width: number; height: number }) {
  return {
    getBoundingClientRect: () => rect as DOMRect,
  } as unknown as HTMLElement
}

afterEach(() => {
  clearLiftOrigin()
})

describe('liftOrigin', () => {
  it('returns null when nothing has been captured yet', () => {
    expect(getLiftOrigin('a1')).toBeNull()
  })

  it('captures and returns the geometry for the article that was clicked', () => {
    const rect = { top: 100, left: 20, width: 300, height: 180 }
    setLiftOrigin('a1', fakeElement(rect))
    expect(getLiftOrigin('a1')).toEqual(rect)
  })

  it('returns null for a DIFFERENT article id than the one captured - never guesses a wrong origin', () => {
    setLiftOrigin('a1', fakeElement({ top: 0, left: 0, width: 100, height: 100 }))
    expect(getLiftOrigin('a2')).toBeNull()
  })

  it('a later capture replaces the previous one', () => {
    setLiftOrigin('a1', fakeElement({ top: 0, left: 0, width: 100, height: 100 }))
    setLiftOrigin('a2', fakeElement({ top: 50, left: 50, width: 200, height: 200 }))
    expect(getLiftOrigin('a1')).toBeNull()
    expect(getLiftOrigin('a2')).toEqual({ top: 50, left: 50, width: 200, height: 200 })
  })

  it('clearLiftOrigin resets state for every article id', () => {
    setLiftOrigin('a1', fakeElement({ top: 0, left: 0, width: 100, height: 100 }))
    clearLiftOrigin()
    expect(getLiftOrigin('a1')).toBeNull()
  })

  it('getCurrentLiftOrigin falls back to click-time geometry when document is unavailable (this repo\'s test environment is node, matching a real SSR/non-browser context)', () => {
    const rect = { top: 10, left: 10, width: 50, height: 50 }
    setLiftOrigin('a1', fakeElement(rect))
    expect(getCurrentLiftOrigin('a1')).toEqual(rect)
  })

  it('getCurrentLiftOrigin returns null when there is no fallback and no document', () => {
    expect(getCurrentLiftOrigin('never-clicked')).toBeNull()
  })

  it('focusLiftOrigin does not throw when document is unavailable', () => {
    expect(() => focusLiftOrigin('a1')).not.toThrow()
  })

  it('captures reader origin pathname + scrollY before lift navigation', () => {
    expect(captureLiftReaderOrigin('/feed', 4730)).toEqual({ pathname: '/feed', scrollY: 4730 })
    expect(getLiftReaderOrigin()).toEqual({ pathname: '/feed', scrollY: 4730 })
  })

  it('never treats /haber as a return origin and never invents "/"', () => {
    expect(shouldCaptureLiftReaderOrigin('/haber/some-slug')).toBe(false)
    expect(captureLiftReaderOrigin('/haber/some-slug', 900)).toBeNull()
    expect(getLiftReaderOrigin()).toBeNull()
    expect(shouldCaptureLiftReaderOrigin('')).toBe(false)
    expect(captureLiftReaderOrigin('', 10)).toBeNull()
  })

  it('does not capture Feed2 / Feed3 origins (intentional Feed2 delta = 0)', () => {
    expect(shouldCaptureLiftReaderOrigin('/feed-v2')).toBe(false)
    expect(shouldCaptureLiftReaderOrigin('/feed-v2/x')).toBe(false)
    expect(shouldCaptureLiftReaderOrigin('/feed-v3')).toBe(false)
    expect(captureLiftReaderOrigin('/feed-v2', 1200)).toBeNull()
  })

  it('keeps category / local / search / publisher / living-paper as reader origins', () => {
    expect(shouldCaptureLiftReaderOrigin('/kategori/gundem')).toBe(true)
    expect(shouldCaptureLiftReaderOrigin('/yerel/istanbul')).toBe(true)
    expect(shouldCaptureLiftReaderOrigin('/search')).toBe(true)
    expect(shouldCaptureLiftReaderOrigin('/publisher/ornek')).toBe(true)
    expect(captureLiftReaderOrigin('/kategori/gundem', 880)).toEqual({
      pathname: '/kategori/gundem',
      scrollY: 880,
    })
  })

  it('clearLiftOrigin also clears captured reader scroll', () => {
    captureLiftReaderOrigin('/feed', 200)
    clearLiftOrigin()
    expect(getLiftReaderOrigin()).toBeNull()
  })

  it('return restore re-pins captured origin scroll, not a mutated footer-scale window.scrollY', () => {
    const pinned: Record<string, number> = { '/feed': 11502 }
    let windowScrollY = 11502
    applyLiftReaderOriginScroll(
      { pathname: '/feed', scrollY: 4730 },
      (path, scrollY) => {
        pinned[path] = scrollY
      },
      (scrollY) => {
        windowScrollY = scrollY
      },
    )
    expect(pinned['/feed']).toBe(4730)
    expect(windowScrollY).toBe(4730)
  })
})
