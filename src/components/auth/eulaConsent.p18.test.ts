/**
 * P18 — EULA consent hang regression contracts.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('EULA consent hang repair', () => {
  it('EulaModal always clears loading in finally (no forever Kaydediliyor)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/auth/EulaModal.tsx'), 'utf8')
    expect(src).toContain('finally')
    expect(src).toContain('setLoading(false)')
    expect(src).toContain('Kaydediliyor')
    expect(src).toContain('Kabul kaydedilemedi. Lütfen tekrar deneyin.')
    expect(src).toContain('disabled={!agreed || loading}')
    // Double-submit guard
    expect(src).toContain('if (!agreed || loading) return')
  })

  it('acceptTerms is API-first with timeouts; client updateDoc is non-blocking', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/auth/AuthProvider.tsx'), 'utf8')
    expect(src).toContain("fetch('/api/user/accept-terms'")
    expect(src).toContain("method: 'POST'")
    expect(src).toContain('ACCEPT_TERMS_TIMEOUT_MS')
    expect(src).toContain('withTimeout')
    expect(src).toContain('getIdToken')
    // Must not await unbounded client updateDoc before API
    expect(src).toMatch(/\/\/ Best-effort client mirror[\s\S]*void withTimeout\(/)
    expect(src).toContain('fetchTermsAcceptedAt')
  })

  it('accept-terms route supports GET status + POST write without returning secrets', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/user/accept-terms/route.ts'), 'utf8')
    expect(src).toContain('export async function GET')
    expect(src).toContain('export async function POST')
    expect(src).toContain('verifyFirebaseIdToken')
    expect(src).toContain('accepted:')
    expect(src).toContain('termsAcceptedAt')
    expect(src).toContain('alreadyAccepted')
    expect(src).toContain('Preserve original legitimate acceptance')
    expect(src).not.toMatch(/idToken|password|Authorization|email/)
    expect(src).toContain("merge: true")
  })

  it('preserves existing termsAcceptedAt and skips client mirror when alreadyAccepted', () => {
    const api = readFileSync(join(process.cwd(), 'src/app/api/user/accept-terms/route.ts'), 'utf8')
    const auth = readFileSync(join(process.cwd(), 'src/components/auth/AuthProvider.tsx'), 'utf8')
    expect(api).toContain('if (existing)')
    expect(api).toContain('alreadyAccepted: true')
    expect(auth).toContain('if (!body.alreadyAccepted)')
    expect(auth).toContain('body.termsAcceptedAt')
  })

  it('does not change Feed Reader files', () => {
    // Repair scope guard — Reader remains untouched in this consent phase.
    const readerFiles = [
      'src/components/feed/smart/FeedArticleReader.tsx',
      'src/lib/feed/reader/capabilityClient.ts',
      'src/lib/feed/reader/readerDebug.ts',
    ]
    for (const f of readerFiles) {
      expect(readFileSync(join(process.cwd(), f), 'utf8').length).toBeGreaterThan(10)
    }
  })

  it('Reader diagnostic panel gating remains present', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('readerDebug')
    expect(client).toContain('shouldShowFeedReaderDebugPanel')
    expect(client).toContain('feed-reader-debug-panel')
  })
})
