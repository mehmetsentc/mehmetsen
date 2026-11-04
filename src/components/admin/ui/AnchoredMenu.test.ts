import { describe, expect, it } from 'vitest'
import { placeMenu } from './AnchoredMenu'

const vp = { width: 1440, height: 900 }

describe('placeMenu (ADMIN-UX-1)', () => {
  it('opens below when there is room', () => {
    const p = placeMenu({ top: 100, bottom: 130, left: 600, right: 700 }, vp, { width: 224, maxHeight: 360, align: 'right' })
    expect(p.up).toBe(false)
    expect(p.top).toBe(134)
    expect(p.bottom).toBeNull()
    expect(p.left).toBe(700 - 224)
  })
  it('opens upwards for the last row near the bottom of the screen', () => {
    const p = placeMenu({ top: 840, bottom: 870, left: 600, right: 700 }, vp, { width: 224, maxHeight: 360, align: 'right' })
    expect(p.up).toBe(true)
    // anchored to the button's top edge: bottom = 900 - 840 + 4
    expect(p.bottom).toBe(64)
    expect(p.maxHeight).toBeLessThanOrEqual(840 - 12)
  })
  it('stays inside the viewport horizontally', () => {
    const p = placeMenu({ top: 100, bottom: 130, left: 10, right: 40 }, { width: 390, height: 844 }, { width: 384, maxHeight: 360, align: 'right' })
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.left + p.width).toBeLessThanOrEqual(390 - 8)
  })
  it('never lets the panel be taller than the space it opens into', () => {
    const p = placeMenu({ top: 300, bottom: 330, left: 100, right: 200 }, { width: 1024, height: 600 }, { width: 200, maxHeight: 520, align: 'left' })
    if (p.up) expect(900 - (p.bottom ?? 0) - p.maxHeight).toBeGreaterThanOrEqual(0)
    else expect((p.top ?? 0) + p.maxHeight).toBeLessThanOrEqual(600)
  })
})
