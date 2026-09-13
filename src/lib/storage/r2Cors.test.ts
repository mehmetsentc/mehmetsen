import { describe, expect, it } from 'vitest'
import {
  NAHABER_PLAYBACK_ORIGIN,
  classifyCorsS3Error,
  mergePlaybackCors,
  parseCorsXml,
  playbackCorsTemplate,
  serializeCorsXml,
} from './r2Cors'

describe('V1C.1R5 additive R2 CORS merge', () => {
  it('adds www.nahaber.com GET/HEAD/Range onto an empty policy', () => {
    const merged = mergePlaybackCors([])
    expect(merged.changed).toBe(true)
    expect(merged.wildcardPresent).toBe(false)
    expect(merged.rules).toHaveLength(1)
    expect(merged.rules[0].origins).toEqual([NAHABER_PLAYBACK_ORIGIN])
    expect(merged.rules[0].methods).toEqual(['GET', 'HEAD'])
    expect(merged.rules[0].headers).toContain('Range')
    expect(merged.rules[0].exposeHeaders).toEqual([
      'Accept-Ranges',
      'Content-Range',
      'Content-Length',
      'Content-Type',
      'ETag',
    ])
    expect(JSON.stringify(merged.rules)).not.toContain('*')
  })

  it('keeps an unrelated existing origin', () => {
    const existing = [
      {
        origins: ['https://media-other.example'],
        methods: ['GET', 'PUT'],
        headers: ['Content-Type'],
        exposeHeaders: ['ETag'],
        maxAgeSeconds: 600,
      },
    ]
    const merged = mergePlaybackCors(existing)
    expect(merged.rules).toHaveLength(2)
    expect(merged.rules[0]).toEqual(existing[0])
    expect(merged.rules[1].origins).toEqual([NAHABER_PLAYBACK_ORIGIN])
  })

  it('unions Range into an existing www.nahaber.com rule instead of replacing it', () => {
    const existing = [
      {
        origins: [NAHABER_PLAYBACK_ORIGIN, 'https://nahaber.com'],
        methods: ['GET'],
        headers: ['Content-Type'],
        exposeHeaders: ['ETag'],
        maxAgeSeconds: 60,
      },
    ]
    const merged = mergePlaybackCors(existing)
    expect(merged.rules).toHaveLength(1)
    expect(merged.rules[0].origins).toEqual([NAHABER_PLAYBACK_ORIGIN, 'https://nahaber.com'])
    expect(merged.rules[0].methods).toEqual(['GET', 'HEAD'])
    expect(merged.rules[0].headers).toEqual(['Content-Type', 'Range'])
  })

  it('round-trips XML without dropping rules', () => {
    const xml = serializeCorsXml([
      {
        origins: ['https://publisher.example'],
        methods: ['GET'],
        headers: [],
        exposeHeaders: [],
        maxAgeSeconds: 120,
      },
    ])
    const parsed = parseCorsXml(xml)
    expect(parsed[0].origins).toEqual(['https://publisher.example'])
    const merged = mergePlaybackCors(parsed)
    expect(parseCorsXml(serializeCorsXml(merged.rules))).toHaveLength(2)
  })

  it('is idempotent when the playback rule is already complete', () => {
    const merged = mergePlaybackCors([playbackCorsTemplate()])
    expect(merged.changed).toBe(false)
    expect(merged.wildcardPresent).toBe(false)
    expect(JSON.stringify(merged.rules)).not.toContain('*')
  })
})

describe('V1C.1R5B CORS S3 error classification', () => {
  it('redacts AccessDenied Message and classifies Permission', () => {
    const xml = `<Error><Code>AccessDenied</Code><Message>User: arn:aws:iam::AKIAEXAMPLE is not authorized to perform s3:PutBucketCORS with R2_SECRET_ACCESS_KEY</Message></Error>`
    const error = classifyCorsS3Error(403, xml)
    expect(error).toEqual({
      code: 'AccessDenied',
      httpStatus: 403,
      errorClass: 'Permission',
      safeMessage:
        'Object-scope R2 token cannot manage bucket CORS. Admin Read and Write is required, or set CORS in the Cloudflare dashboard.',
    })
    const serialized = JSON.stringify(error)
    expect(serialized).not.toContain('AKIAEXAMPLE')
    expect(serialized).not.toContain('R2_SECRET')
    expect(serialized).not.toContain('arn:aws')
    expect(serialized).not.toContain('PutBucketCORS')
    expect(serialized).not.toMatch(/secret|access[_-]?key|credential|authorization|aws4|r2_account/i)
  })

  it('does not leak unlisted S3 codes or InvalidAccessKeyId', () => {
    const leaked = classifyCorsS3Error(
      403,
      '<Error><Code>InvalidAccessKeyId</Code><Message>secret</Message></Error>',
    )
    expect(leaked.code).toBe('HTTP_403')
    expect(leaked.errorClass).toBe('Permission')
    expect(JSON.stringify(leaked)).not.toContain('InvalidAccessKeyId')
    expect(JSON.stringify(leaked)).not.toContain('secret')
  })
})
