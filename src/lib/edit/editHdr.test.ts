import { describe, expect, it } from 'vitest'
import { hdrKindOf, hdrToSdrFilters } from './editFfmpeg'

describe('HDR kaynak', () => {
  it('iPhone HLG, PQ ve SDR ayırt edilir', () => {
    expect(hdrKindOf('  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1920x1080, 30 fps')).toBe('hlg')
    expect(hdrKindOf('  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160')).toBe('pq')
    expect(hdrKindOf('  Stream #0:0: Video: h264 (High), yuv420p(tv, bt709), 1080x1920')).toBeNull()
    expect(hdrKindOf('')).toBeNull()
  })
  it('HLG doğrudan BT.709\'a çevrilir, PQ ton eşlenir, SDR dokunulmaz', () => {
    expect(hdrToSdrFilters('hlg').join(',')).toContain('tin=arib-std-b67')
    expect(hdrToSdrFilters('pq').join(',')).toContain('tonemap=tonemap=hable')
    expect(hdrToSdrFilters(null)).toEqual([])
  })
})
