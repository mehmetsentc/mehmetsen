import { describe, expect, it } from 'vitest'
import {
  buildFollowUpContext,
  followUpMarkers,
  formatTrDate,
  headlineRepeatsPrevious,
  pickRelatedNews,
  splitBackgroundSection,
  timeContextBlock,
} from './followUp'
import { gateKeep } from '@/services/newsroom/editors/stage4_gateKeeper'
import { buildStage1WriterPrompt } from '@/services/newsroom/editors/stage1_contentWriter'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-01T09:00:00+03:00')
const ORIGINAL = {
  id: 'n1',
  title: "Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü öldü",
  summary: 'Küçükçekmece Halkalı Caddesi’nde motosiklet ile otomobil çarpıştı.',
  publishedAt: NOW - 10 * DAY,
}
const FOLLOW_TITLE = "Küçükçekmece'de motosikletlinin öldüğü kazada otomobil sürücüsü tutuklandı"
const FOLLOW_BODY =
  "İstanbul Küçükçekmece'de 21 yaşındaki motosiklet sürücüsünün hayatını kaybettiği kazaya ilişkin soruşturma kapsamında gözaltına alınan otomobil sürücüsü tutuklandı. Hatırlanacağı üzere kaza 22 Ekim'de Halkalı Caddesi'nde meydana gelmişti."

describe('tarih bilinci', () => {
  it('bugünün ve kaynağın tarihi Türkçe yazılır', () => {
    expect(formatTrDate(NOW, true)).toBe('1 Kasım 2026 Pazar')
    const b = timeContextBlock({ now: NOW, sourcePublishedAt: NOW - DAY })
    expect(b).toContain('Bugün: 1 Kasım 2026 Pazar')
    expect(b).toContain('Kaynağın yayın tarihi: 31 Ekim 2026')
    expect(b).toContain('GEÇMİŞTİR')
  })
})

describe('takip haberi tespiti', () => {
  it('kaynak işaretleri', () => {
    expect(followUpMarkers(FOLLOW_TITLE, FOLLOW_BODY)).toEqual(expect.arrayContaining(['hatırlanacağı üzere', 'olaya ilişkin', 'soruşturma kapsamında']))
    expect(followUpMarkers('Belediye yeni parkı açtı', 'Park 3 dönüm alana kuruldu.')).toEqual([])
  })
  it('daha önce yayımlanan aynı olay haberi bulunur; ilgisiz ve çok yeni olanlar alınmaz', () => {
    const cands = [
      ORIGINAL,
      { id: 'n2', title: "Küçükçekmece'de belediye yeni park açtı", summary: 'Park açıldı.', publishedAt: NOW - 2 * DAY },
      { id: 'n3', title: "Küçükçekmece'de motosiklet otomobille çarpıştı", summary: '', publishedAt: NOW - 60 * 60 * 1000 },
      { id: 'n4', title: "Küçükçekmece'de motosiklet otomobille çarpıştı: sürücü öldü", summary: '', publishedAt: NOW - 45 * DAY },
    ]
    const r = pickRelatedNews(cands, { title: FOLLOW_TITLE, body: FOLLOW_BODY, now: NOW })
    expect(r.map((x) => x.id)).toEqual(['n1'])
  })
  it('takip kipinde talimat yeni gelişmeyi öne alır ve önceki haberi listeler', () => {
    const related = pickRelatedNews([ORIGINAL], { title: FOLLOW_TITLE, body: FOLLOW_BODY, now: NOW })
    const c = buildFollowUpContext({ now: NOW, sourcePublishedAt: NOW, title: FOLLOW_TITLE, body: FOLLOW_BODY, related })
    expect(c.isFollowUp).toBe(true)
    expect(c.block).toContain('TAKİP (GELİŞME) HABERİ')
    expect(c.block).toContain('## Olayın Geçmişi')
    expect(c.block).toContain('22 Ekim 2026: Küçükçekmece')
    const plain = buildFollowUpContext({ now: NOW, title: 'Belediye yeni parkı açtı', body: 'Park açıldı.', related: [] })
    expect(plain.isFollowUp).toBe(false)
    expect(plain.block).toContain('Bugün:')
    expect(plain.block).not.toContain('TAKİP')
  })
  it('bağlam yazar sistem talimatına eklenir (persona ve varsayılan)', () => {
    const base = { sourceLabel: 'DHA', originalTitle: FOLLOW_TITLE, originalSummary: '', originalContent: FOLLOW_BODY, sourceUrl: 'https://x' }
    expect(buildStage1WriterPrompt({ ...base, editorialContext: 'ZAMAN BİLGİSİ test' }).systemContent).toContain('ZAMAN BİLGİSİ test')
    expect(buildStage1WriterPrompt({ ...base, systemPromptOverride: 'Persona', editorialContext: 'TAKİP test' }).systemContent).toMatch(/Persona[\s\S]*TAKİP test$/)
    expect(buildStage1WriterPrompt(base).systemContent).not.toContain('ZAMAN BİLGİSİ')
  })
})

describe('kalite kapısı: ana olayı tekrar eden manşet', () => {
  const written = (title: string) => ({ title, spot: 's', summary: 's', content: 'c', seoTitle: 't', seoDescription: 'd', aiWritten: true })
  const factCheck = { score: 90, flags: [], shortContent: false, titleMismatch: false } as never
  const category = { categoryId: 'yerel-asayis', confidence: 90, isBreaking: false } as never
  it('eski manşeti tekrar eden takip haberi yayınlanmaz, yeniden yazıma döner', () => {
    expect(headlineRepeatsPrevious("Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü hayatını kaybetti", [ORIGINAL.title])).toBe(true)
    const bad = gateKeep({ written: written("Küçükçekmece'de motosiklet otomobille çarpıştı: 21 yaşındaki sürücü öldü"), factCheck, category, previousTitles: [ORIGINAL.title] })
    expect(bad.decision).toBe('draft')
    expect(bad.reasons.join(' ')).toContain('takip haberi')
  })
  it('yeni gelişmeyi söyleyen manşet geçer', () => {
    expect(headlineRepeatsPrevious("Küçükçekmece'deki kazada otomobil sürücüsü tutuklandı", [ORIGINAL.title])).toBe(false)
    const ok = gateKeep({ written: written("Küçükçekmece'deki kazada otomobil sürücüsü tutuklandı"), factCheck, category, previousTitles: [ORIGINAL.title] })
    expect(ok.decision).toBe('publish')
  })
})

describe('Reels: hatırlatma bölümü seslendirmeye girmez', () => {
  it('markdown ve HTML', () => {
    const md = 'Sürücü tutuklandı.\n\n## Mahkeme Kararı\nKarar verildi.\n\n## Olayın Geçmişi\nKaza 22 Ekim\'de oldu.'
    expect(splitBackgroundSection(md)).toEqual({ main: 'Sürücü tutuklandı.\n\n## Mahkeme Kararı\nKarar verildi.', background: "## Olayın Geçmişi\nKaza 22 Ekim'de oldu." })
    expect(splitBackgroundSection('<p>A</p><h2>Olayın geçmişi</h2><p>B</p>').main).toBe('<p>A</p>')
    expect(splitBackgroundSection('Geçmiş yok.').main).toBe('Geçmiş yok.')
  })
})
