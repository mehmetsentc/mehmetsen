import { describe, expect, it } from 'vitest'
import { R2StorageProvider } from './r2Client'

describe('R2StorageProvider object I/O', () => {
  it('keeps shared upload/download/delete/exists/getPublicUrl', () => {
    const proto = R2StorageProvider.prototype
    expect(typeof proto.upload).toBe('function')
    expect(typeof proto.download).toBe('function')
    expect(typeof proto.delete).toBe('function')
    expect(typeof proto.exists).toBe('function')
    expect(typeof proto.getPublicUrl).toBe('function')
  })
})
