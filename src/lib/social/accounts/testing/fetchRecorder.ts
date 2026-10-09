/**
 * Test-only helpers: records outgoing platform HTTP calls and answers with
 * canned Meta-like responses. Never reaches a real Meta endpoint.
 */
export interface RecordedCall {
  url: string
  method: string
  body: string
}

function toBodyString(body: unknown): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  return String(body)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Canned responder. Image URLs (`https://img.example/…`) return a small
 * binary payload so the Facebook image gate can run against a mocked `sharp`.
 */
export function cannedMetaResponse(url: string, method: string): Response {
  if (url.startsWith('https://img.example/')) {
    return new Response(new Uint8Array(512), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  }
  const u = new URL(url)
  const path = u.pathname
  if (method === 'GET' && (u.searchParams.has('fields') || path.endsWith('/status'))) {
    return json({ status: 'FINISHED', status_code: 'FINISHED' })
  }
  if (path.endsWith('/media_publish')) return json({ id: 'ig-media-1' })
  if (path.endsWith('/media')) return json({ id: 'ig-container-1' })
  if (path.endsWith('/photo_stories')) return json({ post_id: 'fb-story-1' })
  if (path.endsWith('/photos')) return json({ id: 'fb-photo-1', post_id: 'fb-post-1' })
  if (path.endsWith('/comments')) return json({ id: 'fb-comment-1' })
  if (path.endsWith('/threads_publish')) return json({ id: 'th-media-1' })
  if (path.endsWith('/threads')) return json({ id: 'th-container-1' })
  return json({ error: { message: `unexpected test URL ${path}` } }, 404)
}

export function installFetchRecorder(): { calls: RecordedCall[]; restore: () => void } {
  const calls: RecordedCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url, method, body: toBodyString(init?.body) })
    return cannedMetaResponse(url, method)
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

/** Calls that went to a Meta API host (image downloads excluded). */
export function metaCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((c) => !c.url.startsWith('https://img.example/'))
}

/** Extract `access_token` from a JSON or form body or the query string. */
export function accessTokenOf(call: RecordedCall): string | null {
  const q = new URL(call.url).searchParams.get('access_token')
  if (q) return q
  if (!call.body) return null
  try {
    const parsed = JSON.parse(call.body) as Record<string, unknown>
    if (typeof parsed.access_token === 'string') return parsed.access_token
  } catch {
    /* form body */
  }
  return new URLSearchParams(call.body).get('access_token')
}
