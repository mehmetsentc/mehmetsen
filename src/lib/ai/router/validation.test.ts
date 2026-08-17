import { describe, expect, it } from 'vitest'
import {
  classifyJsonFailure,
  extractJsonObject,
  looksLikeJsonObject,
} from '@/lib/ai/router/validation'

const OBJ = '{"categoryId":"gundem","confidence":90,"reason":"ok"}'

describe('extractJsonObject', () => {
  it('accepts raw JSON', () => {
    expect(extractJsonObject(OBJ)).toBe(OBJ)
  })

  it('accepts markdown-fenced JSON', () => {
    const raw = '```json\n' + OBJ + '\n```'
    expect(extractJsonObject(raw)).toBe(OBJ)
  })

  it('accepts reasoning text before JSON', () => {
    expect(extractJsonObject('The article is local politics.\n' + OBJ)).toBe(OBJ)
  })

  it('accepts reasoning text after JSON', () => {
    expect(extractJsonObject(OBJ + '\nDone.')).toBe(OBJ)
  })

  it('returns null for empty, truncated, or non-object text', () => {
    expect(extractJsonObject('')).toBeNull()
    expect(extractJsonObject('{"categoryId":"gundem","confidence":')).toBeNull()
    expect(extractJsonObject('not json at all')).toBeNull()
  })

  it('returns null for a JSON array of primitives', () => {
    expect(extractJsonObject('["gundem","siyaset"]')).toBeNull()
  })
})

describe('classifyJsonFailure', () => {
  it('labels empty, truncated, fence, and prose-around-json failures', () => {
    expect(classifyJsonFailure('')).toBe('empty_content')
    expect(classifyJsonFailure('{"categoryId":')).toBe('truncated_json')
    expect(classifyJsonFailure('```json\nnot-json\n```')).toBe('markdown_fenced_json')
    expect(classifyJsonFailure('because...\n{"bad":')).toBe('truncated_json')
    expect(classifyJsonFailure('because... no braces')).toBe('invalid_json')
  })
})

describe('looksLikeJsonObject', () => {
  it('is true for fenced or wrapped objects', () => {
    expect(looksLikeJsonObject(OBJ)).toBe(true)
    expect(looksLikeJsonObject('```json\n' + OBJ + '\n```')).toBe(true)
    expect(looksLikeJsonObject('note\n' + OBJ)).toBe(true)
    expect(looksLikeJsonObject('not-json')).toBe(false)
  })
})
