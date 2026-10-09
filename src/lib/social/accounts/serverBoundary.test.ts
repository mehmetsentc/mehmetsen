/**
 * Sunucu/istemci sınırı (statik): sır veya Firestore erişimi olan hesap
 * modülleri `server-only` ile işaretli ve hiçbir 'use client' dosyası
 * bunları (veya platform yayıncılarını) içe aktarmıyor.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../../..')
const SERVER_MODULES = ['accountStore', 'secretStore', 'resolvePublishTarget', 'oauthState', 'authz', 'audit']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p)
  }
  return out
}

describe('sosyal hesap katmanı — sunucu sınırı', () => {
  it('sır/Firestore içeren modüller server-only içe aktarır', () => {
    for (const m of SERVER_MODULES) {
      const src = readFileSync(path.join(__dirname, `${m}.ts`), 'utf8')
      expect(src, m).toMatch(/^import 'server-only'$/m)
    }
  })

  it("hiçbir 'use client' dosyası hesap sunucu modüllerini veya platform yayıncılarını içe aktarmaz", () => {
    const forbidden = new RegExp(
      `from ['"](@/lib/social/accounts/(${SERVER_MODULES.join('|')})|@/lib/social/(facebook|instagram|threads|tokenStore|facebookCredentials|facebookAppStore))['"]`,
    )
    const offenders = walk(SRC).filter((f) => {
      const s = readFileSync(f, 'utf8')
      return /^['"]use client['"]/m.test(s) && forbidden.test(s)
    })
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })
})
