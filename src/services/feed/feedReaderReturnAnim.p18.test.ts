import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFeedReaderV1Enabled } from '@/lib/feed/featureFlag'

describe('P18 Feed Reader return animation + global ON', () => {
  const reader = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
    'utf8'
  )
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const returnCoach = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/ReaderReturnCoach.tsx'),
    'utf8'
  )
  const capabilityRoute = readFileSync(
    join(process.cwd(), 'src/app/api/feed/v2/reader/capability/route.ts'),
    'utf8'
  )

  it('Feed Reader global default is ON (guest open → overlay, not /haber)', () => {
    expect(isFeedReaderV1Enabled()).toBe(true)
    expect(capabilityRoute).toContain('globalDefault: isFeedReaderV1Enabled()')
  })

  it('close animation uses double-rAF so WebKit interpolates progress', () => {
    expect(reader).toContain('requestAnimationFrame(() => requestAnimationFrame(runCloseAnim))')
    expect(reader).toContain('progressRef.current')
    expect(reader).toContain("setInternalProgress(0)")
  })

  it('open ramp mounts at progress≈0 with transition armed (no null hard-cut)', () => {
    // Root cause of iOS Haberi Oku jump-cut: return null at progress≈0 meant first
    // paint was already progress=1 with nowhere to interpolate from.
    expect(reader).toMatch(
      /progress\s*<=\s*0\.001\s*&&\s*!committed\s*&&\s*!progressAnimating\s*&&\s*!animating/
    )
    expect(reader).toContain('hard cut, no page-turn')

    const openIdx = client.indexOf('Haberi Oku / button: same page-turn authority')
    const openBlock = client.slice(openIdx, openIdx + 2000)
    expect(openBlock).toContain('progressAnimating: true')
    expect(openBlock).toContain('requestAnimationFrame(() => requestAnimationFrame(runOpenAnim))')
    expect(openBlock).toMatch(/runOpenAnim[\s\S]{0,200}progress:\s*1/)
    // Must NOT start the ramp with progressAnimating:false (null mount window).
    expect(openBlock).not.toMatch(
      /setReaderSession\(\{\s*item,\s*index,\s*progress:\s*from,\s*committed:\s*false,\s*progressAnimating:\s*false/
    )
  })

  it('close/drag syncs Feed underlay via onVisualProgress', () => {
    expect(reader).toContain('onVisualProgress')
    expect(reader).toContain('syncVisualProgress')
    expect(client).toContain('onVisualProgress=')
    expect(client).toContain('readerUnderlayAnimating')
  })

  it('Reader header uses --reader-sat floor so Safari Akışa Dön clears status bar', () => {
    expect(reader).toContain('data-testid="feed-reader-header"')
    expect(reader).toContain('data-testid="feed-reader-close"')
    expect(reader).toContain('Akışa Dön')
    expect(reader).toContain('--reader-sat')
    expect(css).toContain('--reader-sat:')
    expect(css).toMatch(/--reader-sat:\s*max\([\s\S]{0,220}47px/)
    expect(reader).toMatch(/feed-reader-close[\s\S]{0,350}Akışa Dön/)
  })

  it('chrome lock applies on Reader mount (full open ramp), not only commit', () => {
    expect(reader).toContain('smart-feed-reader-open')
    expect(reader).toMatch(
      /Lock site chrome for the full open ramp[\s\S]{0,220}smart-feed-reader-open/
    )
  })

  it('return swipe captures pointer only after horizontal lock', () => {
    expect(reader).toContain('Capture only after horizontal lock')
    const downIdx = reader.indexOf('const onPointerDown = (e: ReactPointerEvent) => {')
    const moveIdx = reader.indexOf('const onPointerMove = (e: ReactPointerEvent) => {')
    const downBlock = reader.slice(downIdx, moveIdx)
    expect(downBlock).not.toContain('setPointerCapture')
    expect(reader.slice(moveIdx, moveIdx + 900)).toContain('setPointerCapture')
  })

  it('Akışa Dön coach: no transform on pointer-events-none root', () => {
    expect(returnCoach).toContain('reader-return-motion-shell')
    expect(returnCoach).toContain('onPointerUp')
    expect(returnCoach).not.toMatch(
      /pointer-events-none absolute[^"\n]*-translate-[xy]/
    )
    expect(returnCoach).toMatch(
      /reader-return-motion-shell[\s\S]{0,220}translate3d\(\$\{travel\}px, -50%/
    )
  })
})
