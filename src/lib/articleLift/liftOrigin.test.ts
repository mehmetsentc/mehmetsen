import { afterEach, describe, expect, it } from 'vitest'
import {
  clearLiftOrigin,
  focusLiftOrigin,
  getCurrentLiftOrigin,
  getLiftOrigin,
  setLiftOrigin,
} from '@/lib/articleLift/liftOrigin'

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
})
