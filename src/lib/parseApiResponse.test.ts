import { describe, expect, it } from 'vitest'
import { parseApiResponse } from '@/lib/parseApiResponse'

describe('parseApiResponse', () => {
  it('parses JSON payloads', async () => {
    const res = new Response(JSON.stringify({ title: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(parseApiResponse<{ title: string }>(res)).resolves.toEqual({ title: 'ok' })
  })

  it('maps HTML 504 to a DeepSeek timeout message', async () => {
    const res = new Response('<!DOCTYPE html><html><body>Gateway Timeout</body></html>', {
      status: 504,
      headers: { 'Content-Type': 'text/html' },
    })
    await expect(parseApiResponse(res)).rejects.toThrow(/zaman aşımı|DeepSeek/)
  })

  it('maps HTML 500 to a non-JSON platform error', async () => {
    const res = new Response('<!DOCTYPE html><html><head><title>Error</title></head></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
    await expect(parseApiResponse(res)).rejects.toThrow(/HTML hata sayfası/)
  })
})
