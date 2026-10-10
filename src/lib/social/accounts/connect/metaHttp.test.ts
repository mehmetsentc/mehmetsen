import { describe, expect, it } from 'vitest'
import { parseMetaJson } from './metaHttp'

describe('parseMetaJson — Meta kimlikleri yuvarlanmaz', () => {
  it('MAX_SAFE_INTEGER üstündeki tamsayı kimliği tam dizge olarak korur', () => {
    const r = parseMetaJson('{"access_token":"x","token_type":"bearer","user_id":39373226298991729}') as Record<string, unknown>
    expect(r.user_id).toBe('39373226298991729')
    // Düz JSON.parse aynı girdiyi bozar (hatanın kendisi)
    expect(String((JSON.parse('{"user_id":39373226298991729}') as { user_id: number }).user_id)).toBe('39373226298991730')
  })

  it('dizi içindeki ve iç içe büyük kimlikler de korunur; negatif büyük tamsayı da', () => {
    const r = parseMetaJson('{"data":{"user_id":17841405793187219,"ids":[12345678901234567,1]},"n":-12345678901234567}') as {
      data: { user_id: unknown; ids: unknown[] }
      n: unknown
    }
    expect(r.data.user_id).toBe('17841405793187219')
    expect(r.data.ids).toEqual(['12345678901234567', 1])
    expect(r.n).toBe('-12345678901234567')
  })

  it('küçük sayılar, ondalık ve üslü sayılar, boolean ve null değişmez', () => {
    const r = parseMetaJson('{"expires_in":5183944,"ms":1791642663172,"f":1.5,"e":1e21,"b":true,"z":null,"neg":-3}')
    expect(r).toEqual({ expires_in: 5183944, ms: 1791642663172, f: 1.5, e: 1e21, b: true, z: null, neg: -3 })
  })

  it('dizge içeriği (kaçışlı tırnaklar dahil) hiç değişmez', () => {
    const text = '{"name":"He said \\"id\\": 12345678901234567890","id":"17841405793187218","u":"a\\\\"}'
    const r = parseMetaJson(text) as Record<string, unknown>
    expect(r.name).toBe('He said "id": 12345678901234567890')
    expect(r.id).toBe('17841405793187218')
    expect(r.u).toBe('a\\')
    expect(r).toEqual(JSON.parse(text))
  })

  it('geçersiz JSON hata fırlatır (çağıran null sayar)', () => {
    expect(() => parseMetaJson('')).toThrow()
    expect(() => parseMetaJson('<html>')).toThrow()
  })
})
