import { afterEach, describe, expect, it } from 'vitest'
import { DATABASE_URL_ENV_KEYS, hasDatabaseUrl, resolveDatabaseUrl } from '@/db'

const KEYS = [...DATABASE_URL_ENV_KEYS]

describe('resolveDatabaseUrl', () => {
  const previous = new Map<string, string | undefined>()

  afterEach(() => {
    for (const key of KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    previous.clear()
  })

  function snapshot() {
    for (const key of KEYS) previous.set(key, process.env[key])
  }

  function clearAll() {
    snapshot()
    for (const key of KEYS) delete process.env[key]
  }

  it('returns null when no postgres url is set', () => {
    clearAll()
    expect(resolveDatabaseUrl()).toBeNull()
    expect(hasDatabaseUrl()).toBe(false)
  })

  it('prefers DATABASE_URL over Neon integration aliases', () => {
    clearAll()
    process.env.POSTGRES_URL = 'postgres://alias'
    process.env.DATABASE_URL = 'postgres://canonical'
    expect(resolveDatabaseUrl()).toBe('postgres://canonical')
    expect(hasDatabaseUrl()).toBe(true)
  })

  it('falls back to POSTGRES_URL when DATABASE_URL is missing', () => {
    clearAll()
    process.env.POSTGRES_URL = 'postgres://neon-integration'
    expect(resolveDatabaseUrl()).toBe('postgres://neon-integration')
    expect(hasDatabaseUrl()).toBe(true)
  })

  it('ignores blank values', () => {
    clearAll()
    process.env.DATABASE_URL = '   '
    process.env.POSTGRES_URL = 'postgres://ok'
    expect(resolveDatabaseUrl()).toBe('postgres://ok')
  })
})
