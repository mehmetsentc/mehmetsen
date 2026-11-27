import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn() }))
import { isReelJobId, reelJobId } from './reelJobs'

describe('REELS-12 background reel jobs', () => {
  it('stable ids join a running job, random ids otherwise', () => {
    expect(reelJobId(['build', 'nca5402c88977e896577c00d4'])).toBe('build_nca5402c88977e896577c00d4')
    expect(reelJobId(['share', 'n1', 'instagram_178', 'reel'])).toBe('share_n1_instagram-178_reel')
    expect(reelJobId(null)).toMatch(/^job_[0-9a-f]{18}$/)
    expect(isReelJobId('build_abc123')).toBe(true)
    expect(isReelJobId('../etc')).toBe(false)
  })
  it('routes start jobs and the clients poll instead of waiting in one request', () => {
    const share = readFileSync('src/app/api/admin/social/reels/share/route.ts', 'utf8')
    const render = readFileSync('src/app/api/admin/social/reels/render/route.ts', 'utf8')
    expect(share).toContain("reelJobId(['build', newsId, ...(music ? [music] : [])])")
    expect(share).toContain("reelJobId(['share', newsId, target.accountId, format])")
    expect(render).toContain('body.async === true')
    const flow = readFileSync('src/components/admin/social/ManualShareFlow.tsx', 'utf8')
    expect(flow).toContain("runReelJob('/api/admin/social/reels/share', { newsId: input.newsId, format: input.mode, prepare: true, ...(input.music ? { music: input.music } : {}) })")
    expect(flow).toContain('async: true')
    expect(readFileSync('src/components/admin/social/ReelsStudio.tsx', 'utf8')).toContain('reelsJob<')
  })
})

describe('MÜZİK-SEÇİMİ (27.11.2026)', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('onay ekranında otomatik «ağır haber» uyarısı yok; müzikli / müziksiz seçimi var ve hazırlamaya gider', () => {
    const ui = read('src/components/admin/social/ManualShareFlow.tsx')
    expect(ui).not.toContain('notice=1')
    expect(ui).not.toContain('Onayla ve')
    expect(ui).toContain('Müzikli')
    expect(ui).toContain('Müziksiz')
    expect(ui).toContain('prepare: true, ...(input.music ? { music: input.music } : {})')
  })
  it('video hazırlarken hassas haber otomatik sessize alınmaz; yalnız editörün «Müziksiz» seçimi', () => {
    const svc = read('src/lib/reels/reelService.ts')
    expect(svc).not.toContain('isGraveNews(d)')
    expect(svc).toContain("opts.musicChoice === 'off'")
    const share = read('src/app/api/admin/social/reels/share/route.ts')
    expect(share).toContain("if (url.searchParams.get('notice') === '1') return json({ notice: null })")
    const h = read('src/lib/reels/reelJobHandlers.ts')
    expect(h).toContain('buildReelForNews(newsId, { by: uid, musicChoice })')
    expect(h).not.toContain('sensitiveShareNotice')
  })
})
