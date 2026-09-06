import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  editorialMemoryModeStatus,
  getEditorialMemoryMode,
  isEditorialMemoryInjectionEnabled,
  isEditorialMemoryShadowEnabled,
  parseEditorialMemoryMode,
} from './editorialMemoryMode'

describe('Faz A3 Task 17 — editorialMemoryMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to OFF for undefined/null/empty/garbage input', () => {
    expect(parseEditorialMemoryMode(undefined)).toBe('OFF')
    expect(parseEditorialMemoryMode(null)).toBe('OFF')
    expect(parseEditorialMemoryMode('')).toBe('OFF')
    expect(parseEditorialMemoryMode('nonsense')).toBe('OFF')
  })

  it('parses SHADOW and ON case-insensitively, with whitespace', () => {
    expect(parseEditorialMemoryMode('shadow')).toBe('SHADOW')
    expect(parseEditorialMemoryMode('  SHADOW  ')).toBe('SHADOW')
    expect(parseEditorialMemoryMode('on')).toBe('ON')
    expect(parseEditorialMemoryMode('On')).toBe('ON')
  })

  it('getEditorialMemoryMode reads EDITORIAL_MEMORY_MODE env, default OFF', () => {
    vi.stubEnv('EDITORIAL_MEMORY_MODE', '')
    expect(getEditorialMemoryMode()).toBe('OFF')
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'SHADOW')
    expect(getEditorialMemoryMode()).toBe('SHADOW')
  })

  it('isEditorialMemoryShadowEnabled is true for SHADOW and ON, false for OFF', () => {
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'OFF')
    expect(isEditorialMemoryShadowEnabled()).toBe(false)
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'SHADOW')
    expect(isEditorialMemoryShadowEnabled()).toBe(true)
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'ON')
    expect(isEditorialMemoryShadowEnabled()).toBe(true)
  })

  it('isEditorialMemoryInjectionEnabled is ALWAYS false in A3, regardless of mode', () => {
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'ON')
    expect(isEditorialMemoryInjectionEnabled()).toBe(false)
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'SHADOW')
    expect(isEditorialMemoryInjectionEnabled()).toBe(false)
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'OFF')
    expect(isEditorialMemoryInjectionEnabled()).toBe(false)
  })

  it('editorialMemoryModeStatus never reports injectionEnabled true', () => {
    vi.stubEnv('EDITORIAL_MEMORY_MODE', 'ON')
    const status = editorialMemoryModeStatus()
    expect(status.mode).toBe('ON')
    expect(status.injectionEnabled).toBe(false)
    expect(status.notesTr.join(' ')).toContain('Manuel admin')
  })
})
