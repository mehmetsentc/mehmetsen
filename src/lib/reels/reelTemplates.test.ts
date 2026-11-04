import { describe, expect, it } from 'vitest'
import { REEL_TEMPLATES, fallbackTemplate, isReelTemplateId, readingSeconds, recommendTemplate, reelTemplate, templateHasVoice } from './reelTemplates'
import { templateAudioGraph } from './audio'

describe('REELS-T1 templates', () => {
  it('every template has a unique id and a Turkish label', () => {
    const ids = REEL_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of REEL_TEMPLATES) expect(t.label.length).toBeGreaterThan(2)
  })
  it('no-voice templates spend no TTS', () => {
    expect(templateHasVoice(reelTemplate('orijinal'))).toBe(false)
    expect(templateHasVoice(reelTemplate('daktilo'))).toBe(false)
    expect(templateHasVoice(reelTemplate('sahadan'))).toBe(true)
  })
  it('suggests by story type', () => {
    expect(recommendTemplate({ breaking: true, hasVideo: true })).toBe('sondakika')
    expect(recommendTemplate({ style: 'spor', hasVideo: true })).toBe('spor')
    expect(recommendTemplate({ hasVideo: true })).toBe('sahadan')
    expect(recommendTemplate({ style: 'analiz' })).toBe('analiz')
    expect(recommendTemplate({})).toBe('klasik')
  })
  it('falls back when the story has no video sound, keeping the voice rule', () => {
    expect(fallbackTemplate('sahadan')).toBe('klasik')
    expect(fallbackTemplate('spor')).toBe('klasik')
    expect(fallbackTemplate('orijinal')).toBe('daktilo')
    expect(templateHasVoice(reelTemplate(fallbackTemplate('orijinal')))).toBe(false)
    expect(fallbackTemplate('analiz')).toBe('analiz')
  })
  it('validates ids', () => {
    expect(isReelTemplateId('sahadan')).toBe(true)
    expect(isReelTemplateId('auto')).toBe(false)
    expect(isReelTemplateId(null)).toBe(false)
  })
  it('reading time stays within 8–40 s', () => {
    expect(readingSeconds('kısa')).toBe(8)
    expect(readingSeconds('x'.repeat(5000))).toBe(40)
  })
})

describe('REELS-T1 audio graphs', () => {
  const base = { voiceStart: 6.2, voiceEnd: 15, endStart: 15.5, bedVolume: 0.5 }
  it('video_then_voice ducks the original sound before the voice', () => {
    const g = templateAudioGraph({ ...base, mode: 'video_then_voice', videoAudio: true })
    expect(g).toContain('[4:a]')
    expect(g).toContain("volume='if(lt(t,5.600),1")
    expect(g).toContain('amix=inputs=4')
  })
  it('music_only has no dangling voice split', () => {
    const g = templateAudioGraph({ ...base, mode: 'music_only', videoAudio: false })
    expect(g).not.toContain('[vsc]')
    expect(g).toContain('amix=inputs=3')
  })
  it('video_only mixes the story sound at full level', () => {
    const g = templateAudioGraph({ ...base, mode: 'video_only', videoAudio: true })
    expect(g).toContain('[4:a]')
    expect(g).toContain('[vsc]sidechaincompress')
  })
})
