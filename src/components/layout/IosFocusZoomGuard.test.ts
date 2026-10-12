import { describe, expect, it } from 'vitest'
import { isIOSUserAgent, maxScaleOf, withMaxScale } from './IosFocusZoomGuard'

const NEXT_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover'

describe('IosFocusZoomGuard helpers', () => {
  it('detects iPhone Safari, Chrome on iOS and iPadOS, not Android/desktop', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/18.6 Mobile Safari/604.1', 'iPhone', 5)).toBe(true)
    expect(isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) CriOS/140.0 Mobile/15E148 Safari/604.1', 'iPhone', 5)).toBe(true)
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.6 Safari/605.1.15', 'MacIntel', 5)).toBe(true)
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.6 Safari/605.1.15', 'MacIntel', 0)).toBe(false)
    expect(isIOSUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0 Mobile Safari/537.36', 'Linux armv8l', 5)).toBe(false)
  })

  it('locks only maximum-scale and keeps viewport-fit=cover and width', () => {
    const locked = withMaxScale(NEXT_VIEWPORT, '1')
    expect(locked).toBe('width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    expect(maxScaleOf(NEXT_VIEWPORT)).toBe('5')
    expect(withMaxScale(locked, maxScaleOf(NEXT_VIEWPORT))).toBe(NEXT_VIEWPORT)
  })

  it('snap value differs from lock value so WebKit re-reads the viewport', () => {
    expect(withMaxScale(withMaxScale(NEXT_VIEWPORT, '1'), '1.0')).not.toBe(withMaxScale(NEXT_VIEWPORT, '1'))
  })

  it('never adds user-scalable=no', () => {
    expect(withMaxScale(NEXT_VIEWPORT, '1')).not.toMatch(/user-scalable/)
    expect(withMaxScale('width=device-width', '1')).toBe('width=device-width, maximum-scale=1')
  })
})
