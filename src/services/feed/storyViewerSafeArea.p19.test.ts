/**
 * StoryViewer iOS safe-area — progress must clear status bar (App Store WKWebView).
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('StoryViewer iOS top chrome', () => {
  it('stacks progress above header with a 47px safe-area floor', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/home/StoryViewer.tsx'),
      'utf8'
    )
    expect(src).toContain('data-testid="story-viewer-top-chrome"')
    expect(src).toContain('data-testid="story-viewer-progress"')
    expect(src).toContain('data-testid="story-viewer-header"')
    expect(src).toContain('47px')
    expect(src).toContain('safe-area-inset-top')
    expect(src).toContain('bg-black/55')
    expect(src).toContain('h-1 flex-1')
    // Progress must not be independently absolutely positioned above a fixed header top.
    expect(src).not.toMatch(
      /data-testid="story-viewer-progress"[\s\S]{0,120}absolute inset-x-0 top-0/
    )
    expect(src).not.toMatch(/top:\s*'max\(2\.75rem,\s*calc\(var\(--mobile-sat/)
  })
})
