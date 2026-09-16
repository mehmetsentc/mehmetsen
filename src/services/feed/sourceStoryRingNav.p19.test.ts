/**
 * Instagram-style source story ring navigation.
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  jumpSourceStoryGroup,
  stepSourceStoryCursor,
  type SourceStoryGroup,
} from '@/lib/home/sourceStories'
import type { NewsItem } from '@/types/newsItem'

function item(id: string, source = 'X'): NewsItem {
  return {
    id,
    slug: id,
    title: id,
    source,
    category: 'gundem',
    publishedAt: '2026-09-16T10:00:00.000Z',
  } as NewsItem
}

function groups(): SourceStoryGroup[] {
  return [
    { key: 'a', label: 'A', items: [item('a1', 'A'), item('a2', 'A')] },
    { key: 'b', label: 'B', items: [item('b1', 'B'), item('b2', 'B'), item('b3', 'B')] },
    { key: 'c', label: 'C', items: [item('c1', 'C')] },
  ]
}

describe('stepSourceStoryCursor', () => {
  it('advances within a source ring', () => {
    expect(stepSourceStoryCursor(groups(), { groupIndex: 0, itemIndex: 0 }, 1)).toEqual({
      groupIndex: 0,
      itemIndex: 1,
    })
  })

  it('crosses to next source after last story', () => {
    expect(stepSourceStoryCursor(groups(), { groupIndex: 0, itemIndex: 1 }, 1)).toEqual({
      groupIndex: 1,
      itemIndex: 0,
    })
  })

  it('closes after the last story of the last source', () => {
    expect(stepSourceStoryCursor(groups(), { groupIndex: 2, itemIndex: 0 }, 1)).toBe('close')
  })

  it('goes to previous source last story when stepping back from start', () => {
    expect(stepSourceStoryCursor(groups(), { groupIndex: 1, itemIndex: 0 }, -1)).toEqual({
      groupIndex: 0,
      itemIndex: 1,
    })
  })

  it('stays on first story of first source when stepping back', () => {
    expect(stepSourceStoryCursor(groups(), { groupIndex: 0, itemIndex: 0 }, -1)).toEqual({
      groupIndex: 0,
      itemIndex: 0,
    })
  })
})

describe('jumpSourceStoryGroup', () => {
  it('jumps to next source first story', () => {
    expect(jumpSourceStoryGroup(groups(), { groupIndex: 0, itemIndex: 1 }, 1)).toEqual({
      groupIndex: 1,
      itemIndex: 0,
    })
  })

  it('jumps to previous source first story', () => {
    expect(jumpSourceStoryGroup(groups(), { groupIndex: 2, itemIndex: 0 }, -1)).toEqual({
      groupIndex: 1,
      itemIndex: 0,
    })
  })

  it('closes when swiping past last source', () => {
    expect(jumpSourceStoryGroup(groups(), { groupIndex: 2, itemIndex: 0 }, 1)).toBe('close')
  })

  it('noops when swiping before first source', () => {
    expect(jumpSourceStoryGroup(groups(), { groupIndex: 0, itemIndex: 0 }, -1)).toBe('noop')
  })
})

describe('SourceStories + StoryViewer wiring', () => {
  it('SourceStories passes full groups (not single-source slice)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/home/SourceStories.tsx'),
      'utf8'
    )
    expect(src).toContain('groups={groups}')
    expect(src).toContain('initialGroupIndex')
    expect(src).toContain('openAt(groupIndex')
    expect(src).not.toContain('openGroup(group.items')
    expect(src).not.toContain('sourceStoryTour')
  })

  it('StoryViewer supports horizontal source swipe + multi-source step', () => {
    const viewer = readFileSync(
      join(process.cwd(), 'src/components/home/StoryViewer.tsx'),
      'utf8'
    )
    expect(viewer).toContain('jumpSourceStoryGroup')
    expect(viewer).toContain('stepSourceStoryCursor')
    expect(viewer).toContain('dragDirectionLock')
    expect(viewer).toContain('goNextSource')
    expect(viewer).toContain('data-multi-source')
  })
})
