import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCrawlerAiDispatchEnabled } from './dispatch'
import { isLegacyDirectAiEnabled } from './legacyFlags'
import { isManualEditorAiEnabled } from './automatedAiPolicy'

type FlagReader = () => boolean

const MATRIX: Array<{ label: string; value: string | undefined }> = [
  { label: 'missing', value: undefined },
  { label: 'empty', value: '' },
  { label: 'true', value: 'true' },
  { label: '1', value: '1' },
  { label: 'on', value: 'on' },
  { label: 'false', value: 'false' },
  { label: '0', value: '0' },
  { label: 'off', value: 'off' },
  { label: 'unexpected', value: 'maybe' },
]

const ENABLE_VALUES = new Set(['true', '1', 'on'])

function expectFailClosed(reader: FlagReader, envName: string, value: string | undefined) {
  if (value === undefined) {
    vi.unstubAllEnvs()
    delete process.env[envName]
  } else {
    vi.stubEnv(envName, value)
  }
  const expected = value !== undefined && ENABLE_VALUES.has(value)
  expect(reader()).toBe(expected)
}

describe('P17.12 AI policy flag matrix — all three fail closed', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env.CRAWLER_AI_DISPATCH_ENABLED
    delete process.env.LEGACY_DIRECT_AI_ENABLED
    delete process.env.MANUAL_EDITOR_AI_ENABLED
  })

  describe.each([
    ['CRAWLER_AI_DISPATCH_ENABLED', isCrawlerAiDispatchEnabled] as const,
    ['LEGACY_DIRECT_AI_ENABLED', isLegacyDirectAiEnabled] as const,
    ['MANUAL_EDITOR_AI_ENABLED', isManualEditorAiEnabled] as const,
  ])('%s', (envName, reader) => {
    it.each(MATRIX)('$label → explicit allow only', ({ value }) => {
      expectFailClosed(reader, envName, value)
    })
  })

  it('MANUAL missing defaults false (fail-closed regression)', () => {
    delete process.env.MANUAL_EDITOR_AI_ENABLED
    expect(isManualEditorAiEnabled()).toBe(false)
  })
})
