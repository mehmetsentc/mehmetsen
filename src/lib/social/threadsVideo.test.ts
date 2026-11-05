/** THREADS-VIDEO-1 — Threads video post: container → poll FINISHED → threads_publish. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishThreadsVideo, threadsVideoText } from './reelAdapters'
import { buildThreadsVideoText } from './reelPublish'
import { apiBaseFor } from './accounts/apiHosts'
import type { ThreadsPublishTarget } from './accounts/targetTypes'

const raw = (text: string, status = 200) => new Response(text, { status, headers: { 'content-type': 'application/json' } })
const target = () => {
  const t = { platform: 'threads', accountId: 'threads_39373226298991726', connectionMethod: 'threads_oauth', apiBase: apiBaseFor('threads', 'threads_oauth')!, threadsUserId: '39373226298991726' } as ThreadsPublishTarget
  Object.defineProperty(t, 'accessToken', { value: 'TH_TOKEN', enumerable: false })
  return t
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Threads video', () => {
  it('VIDEO kapsayıcısı → FINISHED → threads_publish; büyük sayısal kimlik bozulmaz', async () => {
    vi.useFakeTimers()
    const calls: Array<{ url: string; body: string }> = []
    let polls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? '') })
      if (url.endsWith('/39373226298991726/threads')) return raw('{"id": 18027761234567890123}')
      if (url.includes('/18027761234567890123?fields=status')) return raw(JSON.stringify({ status: ++polls > 1 ? 'FINISHED' : 'IN_PROGRESS' }))
      if (url.endsWith('/threads_publish')) return raw('{"id": 18027769999999999999}')
      return raw('{"error":{"code":100}}', 400)
    }))
    const p = publishThreadsVideo({ newsId: 'n1', videoUrl: 'https://storage.googleapis.com/b/v.mp4', caption: 'Başlık' }, target())
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(p).resolves.toEqual({ success: true, platformId: '18027769999999999999' })
    const create = new URLSearchParams(calls[0].body)
    expect(create.get('media_type')).toBe('VIDEO')
    expect(create.get('video_url')).toBe('https://storage.googleapis.com/b/v.mp4')
    expect(new URLSearchParams(calls.at(-1)!.body).get('creation_id')).toBe('18027761234567890123')
  })

  it('işleme hatası ve zaman aşımı yayınlama adımına geçmez (kesin hata, belirsiz değil)', async () => {
    vi.useFakeTimers()
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      if (url.endsWith('/threads')) return raw('{"id":"c9"}')
      if (url.includes('/c9?fields=status')) return raw('{"status":"ERROR"}')
      return raw('{"id":"x"}')
    }))
    const p = publishThreadsVideo({ newsId: 'n1', videoUrl: 'https://s/v.mp4', caption: 'c' }, target())
    await vi.advanceTimersByTimeAsync(10_000)
    const r = await p
    expect(r.success).toBe(false)
    expect(urls.some((u) => u.endsWith('/threads_publish'))).toBe(false)
  })

  it('http video ve geçersiz hedef Meta çağrısı yapmadan reddedilir', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect((await publishThreadsVideo({ newsId: 'n1', videoUrl: 'http://x/v.mp4', caption: 'c' }, target())).success).toBe(false)
    expect((await publishThreadsVideo({ newsId: 'n1', videoUrl: 'https://x/v.mp4', caption: 'c' }, { ...target(), threadsUserId: 'bad id' } as ThreadsPublishTarget)).success).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('metin 500 karakteri aşmaz; haber bağlantısı kesilmez', () => {
    expect(threadsVideoText('a '.repeat(600)).length).toBeLessThanOrEqual(500)
    const t = buildThreadsVideoText({ title: 'Çok uzun başlık '.repeat(60), categoryId: 'gundem' }, 'https://www.nahaber.com/haber/x?utm_source=threads')
    expect(t.length).toBeLessThanOrEqual(500)
    expect(t).toContain('https://www.nahaber.com/haber/x?utm_source=threads')
  })
})
