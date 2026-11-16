import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyText'

function fakeDoc(execResult: boolean) {
  const body = { appendChild: vi.fn(), removeChild: vi.fn() }
  const ta = { value: '', style: {} as Record<string, string>, setAttribute: vi.fn(), select: vi.fn() }
  return {
    doc: { body, createElement: vi.fn(() => ta), execCommand: vi.fn(() => execResult) } as unknown as Document,
    body,
    ta,
  }
}

describe('TIKTOK-INBOX-CAPTION copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Clipboard API varsa onu kullanır', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('Açıklama #NaHaber')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('Açıklama #NaHaber')
  })

  it('Clipboard API reddederse gizli textarea ile kopyalar ve temizler', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('NotAllowed'))) } })
    const { doc, body, ta } = fakeDoc(true)
    expect(await copyText('metin', doc)).toBe(true)
    expect(ta.value).toBe('metin')
    expect(body.appendChild).toHaveBeenCalled()
    expect(body.removeChild).toHaveBeenCalled()
  })

  it('hiçbir yol yoksa false; boş metin kopyalanmaz', async () => {
    vi.stubGlobal('navigator', {})
    expect(await copyText('metin', fakeDoc(false).doc)).toBe(false)
    expect(await copyText('', fakeDoc(true).doc)).toBe(false)
  })
})
