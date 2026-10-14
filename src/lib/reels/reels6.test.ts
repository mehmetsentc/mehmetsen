import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn(), getAdminStorage: vi.fn() }))

import { parseVoiceSettings } from './voiceRules'
import { postThemeIsNahaber } from '@/lib/social/nahaberCard'

describe('REELS-6 bülten theme settings', () => {
  it('layout / cover / post theme are validated studio settings', () => {
    const s = parseVoiceSettings({ layout: 'bulten', cover: 'bulten', postTheme: 'onyeditivi' })
    expect(s.layout).toBe('bulten')
    expect(s.cover).toBe('bulten')
    expect(s.postTheme).toBe('onyeditivi')
    const bad = parseVoiceSettings({ layout: 'x', postTheme: 'y' })
    expect(bad.layout).toBeNull()
    expect(bad.postTheme).toBeNull()
  })
  it('SOCIAL_POST_THEME env wins over the studio setting', async () => {
    process.env.SOCIAL_POST_THEME = 'onyeditivi'
    expect(await postThemeIsNahaber()).toBe(false)
    process.env.SOCIAL_POST_THEME = 'nahaber'
    expect(await postThemeIsNahaber()).toBe(true)
    delete process.env.SOCIAL_POST_THEME
  })
})
