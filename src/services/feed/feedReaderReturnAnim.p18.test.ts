import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFeedReaderV1Enabled } from '@/lib/feed/featureFlag'

describe('P18 Feed Reader return animation + global ON', () => {
  const reader = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
    'utf8'
  )
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
