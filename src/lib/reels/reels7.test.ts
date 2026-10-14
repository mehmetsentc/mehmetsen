import { describe, expect, it } from 'vitest'
import { dynamicAudioGraph } from './audio'
import { parseVoiceSettings } from './voiceRules'

describe('REELS-7 dinamik reel', () => {
  it('story video sound starts after the voice-over, music fades there', () => {
    const g = dynamicAudioGraph({ voiceStart: 0.45, voiceEnd: 10.5, bedVolume: 0.9, videoAudio: true })
    expect(g).toContain('[4:a]')
    expect(g).toContain('atrim=start=10.500')
    expect(g).toContain('adelay=10500|10500')
    expect(g).toContain('afade=t=out:st=10.500')
    expect(g).toContain('amix=inputs=4')
  })
  it('no story sound → three inputs only', () => {
    const g = dynamicAudioGraph({ voiceStart: 0.45, voiceEnd: 10.5, bedVolume: 0.9, videoAudio: false })
    expect(g).not.toContain('[4:a]')
    expect(g).toContain('amix=inputs=3')
  })
  it('dinamik is a valid layout setting', () => {
    expect(parseVoiceSettings({ layout: 'dinamik' }).layout).toBe('dinamik')
  })
})
