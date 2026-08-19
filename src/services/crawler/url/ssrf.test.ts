import { describe, expect, it } from 'vitest'
import { UnsafeUrlError, assertSafeUrl, isPrivateOrReservedIp } from './ssrf'

describe('SSRF protection', () => {
  it('blocks localhost and metadata hosts', async () => {
    await expect(assertSafeUrl('http://localhost/admin')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl('http://127.0.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl('http://metadata.google.internal/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('blocks private IPv4', () => {
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.9')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
  })

  it('blocks credentials and non-http schemes', async () => {
    await expect(assertSafeUrl('ftp://example.com')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl('https://user:pass@example.com')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('re-checks DNS results', async () => {
    await expect(
      assertSafeUrl('http://evil.test', async () => ['127.0.0.1'])
    ).rejects.toMatchObject({ code: 'SSRF_BLOCKED' })
    await expect(assertSafeUrl('http://ok.test', async () => ['93.184.216.34'])).resolves.toBeInstanceOf(URL)
  })
})
