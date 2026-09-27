import { describe, expect, it } from 'vitest'
import { resolveProfileTab } from '@/lib/profile/profileTabs'

describe('resolveProfileTab', () => {
  it('hides saved and liked from visitors', () => {
    expect(resolveProfileTab('saved', false)).toBe('posts')
    expect(resolveProfileTab('liked', false)).toBe('posts')
    expect(resolveProfileTab('posts', false)).toBe('posts')
    expect(resolveProfileTab('reels', false)).toBe('reels')
  })

  it('keeps owner tabs for the owner', () => {
    expect(resolveProfileTab('saved', true)).toBe('saved')
    expect(resolveProfileTab('liked', true)).toBe('liked')
  })
})
