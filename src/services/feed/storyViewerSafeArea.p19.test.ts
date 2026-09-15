/**
 * StoryViewer iOS safe-area — progress + close chrome must clear status bar.
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('StoryViewer iOS top chrome', () => {
  it('progress and header clear safe-area-inset-top', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/home/StoryViewer.tsx'),
      'utf8'
    )
    expect(src).toContain('safe-area-inset-top')
    expect(src).toContain('data-testid="story-viewer-progress"')
    expect(src).toContain('data-testid="story-viewer-header"')
    expect(src).not.toMatch(/className="absolute inset-x-0 top-0 z-30 flex gap-1\.5 px-3 pt-3"/)
    expect(src).not.toMatch(/className="absolute inset-x-0 top-7 z-30/)
  })
})
