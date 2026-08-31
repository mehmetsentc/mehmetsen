import { describe, expect, it } from 'vitest'
import { extractArticle } from './pipeline'
import {
  COMMENT_TRAILER_FIXTURE,
  EVRENSEL_GORDES_FIXTURE,
  HABERTURK_LIKE_FIXTURE,
  JSON_LD_POLLUTED_EVRENSEL,
  LONG_ARTICLE_FIXTURE,
  SEMANTIC_WITH_RELATED_FIXTURE,
} from './extractionFixtures'
import {
  finalizeExtractedBody,
  trimArticleEndBoundary,
  trimBodyTextAtPublisherStops,
} from './semantic'
import * as cheerio from 'cheerio'

describe('P17.10 Evrensel golden fixture', () => {
  const url = 'https://www.evrensel.net/haber/5998608/gordes-belediye-baskani-ibrahim-buke-hakkinda-sorusturma-izni'
  const extracted = () => extractArticle(EVRENSEL_GORDES_FIXTURE, url, 'tr')

  it('retains real article blocks and headings', () => {
    const r = extracted()
    expect(r.articleBodyText).toContain('Manisa’nın Gördes ilçesinde')
    expect(r.articleBodyText).toContain('Savcılık adli soruşturma başlattı')
    expect(r.articleBodyText).toContain('Bazı maaş ödemeleri 1 hafta gecikti')
    expect(r.articleBodyText).toContain('ödeme talimatlarını zamanında')
    expect(r.articleBodyHtml).toMatch(/Savcılık adli soruşturma başlattı/)
    expect(r.articleBodyHtml).toMatch(/Bazı maaş ödemeleri 1 hafta gecikti/)
  })

  it('removes subscription and app promo blocks', () => {
    const r = extracted()
    expect(r.articleBodyText).not.toContain("Evrensel'e Abone Ol")
    expect(r.articleBodyText).not.toContain('31 yıldır emeğin sesi')
    expect(r.articleBodyText).not.toContain('Dijital Evrensel uygulamamız güncellendi')
    expect(r.articleBodyText).not.toContain("App Store'dan İndir")
    expect(r.articleBodyText).not.toContain("Google Play'den İndir")
    expect(r.articleBodyText).not.toContain('tercih edilen kaynak')
    expect(r.articleBodyText).not.toContain('Reklamsız Deneyim')
    expect(r.articleBodyText).not.toContain('Zaten abone misin')
  })

  it('does not truncate before last legitimate paragraph', () => {
    const r = extracted()
    expect(r.articleBodyText).toMatch(/talimatlarını zamanında düzenlemediği/)
    // Source attribution may remain
    expect(r.articleBodyText).toContain('Halk TV')
  })

  it('does not pull related preview articleBody', () => {
    const r = extracted()
    expect(r.articleBodyText).not.toContain('İlgili önizleme gövdesi')
  })

  it('trims polluted JSON-LD via text stop markers', () => {
    const r = extractArticle(JSON_LD_POLLUTED_EVRENSEL, url, 'tr')
    expect(r.extractionMethod).toBe('jsonld')
    expect(r.articleBodyText).toContain('soruşturma izni verildi')
    expect(r.articleBodyText).not.toContain("Evrensel'e Abone Ol")
    expect(r.articleBodyText).not.toContain('Dijital Evrensel')
    expect(r.articleBodyText).not.toContain('App Store')
  })
})

describe('P17.10 long article regression', () => {
  it('keeps all legitimate H2 sections and does not summarize', () => {
    const r = extractArticle(LONG_ARTICLE_FIXTURE, 'https://news.test/long', 'tr')
    expect(r.articleBodyText).toContain('Lead paragraph introduces')
    expect(r.articleBodyText).toContain("TÜPRAG'ın Kışladağ faaliyetleri ve çevresel etkileri")
    expect(r.articleBodyText).toContain('Background explains the scale')
    expect(r.articleBodyText).toContain("TÜPRAG'dan 'sahayla ilgilenmiyoruz' açıklaması")
    expect(r.articleBodyText).toContain('Company response denies')
    expect(r.articleBodyText).toContain('Expert comments from a hydrogeologist')
    expect(r.articleBodyText).toContain('Final reporting paragraph')
    expect(r.articleBodyText).not.toContain('Subscribe to our newsletter')
    expect(r.articleBodyText).not.toContain('Related: Other mine stories')
  })
})

describe('P17.10 other publisher fixtures', () => {
  it('Habertürk-like cms-container retains body, strips related', () => {
    const r = extractArticle(HABERTURK_LIKE_FIXTURE, 'https://www.haberturk.com/ekonomi/butce', 'tr')
    expect(r.articleBodyText).toContain('Milletvekilleri gece oturumunda')
    expect(r.articleBodyText).toContain('Muhalefet partileri')
    expect(r.articleBodyText).not.toContain('Bunları da okuyun')
  })

  it('semantic article strips related-news module', () => {
    const r = extractArticle(SEMANTIC_WITH_RELATED_FIXTURE, 'https://news.test/storm', 'en')
    expect(r.articleBodyText).toContain('fallen trees')
    expect(r.articleBodyText).toContain('elderly neighbors')
    expect(r.articleBodyText).not.toContain('Related news module')
  })

  it('itemprop articleBody stops before comments', () => {
    const r = extractArticle(COMMENT_TRAILER_FIXTURE, 'https://news.test/fire', 'en')
    expect(r.articleBodyText).toContain('warehouse fire')
    expect(r.articleBodyText).toContain('maintenance logs')
    expect(r.articleBodyText).not.toContain('User comment one')
  })

  it('existing JSON-LD clean article still preferred', () => {
    const html = `<!doctype html><html><head>
<script type="application/ld+json">
{"@type":"NewsArticle","headline":"City council approves budget",
"articleBody":"Paragraph one explains the vote in detail for readers who missed the session.\\n\\nParagraph two quotes the mayor on funding priorities and oversight.\\n\\nParagraph three covers next steps and the timeline for implementation across districts next month."}
</script></head><body></body></html>`
    const r = extractArticle(html, 'https://news.test/budget', 'en')
    expect(r.extractionMethod).toBe('jsonld')
    expect(r.articleBodyText).toContain('Paragraph three')
  })

  it('generic semantic French fixture still works', () => {
    const html = `<!doctype html><html lang="fr"><body>
<header>Nav</header>
<aside class="related">Lisez aussi</aside>
<article>
<h1>Le parlement vote</h1>
<p>Les deputes ont adopte le texte apres un long debat dans l'hemicycle parisien hier soir.</p>
<p>Le ministre a declare que la reforme entrerait en vigueur le mois prochain pour toutes les regions.</p>
<p>Les syndicats restent prudents et demandent des garanties supplementaires pour les salaries.</p>
</article>
<footer>Newsletter</footer>
</body></html>`
    const r = extractArticle(html, 'https://news.test/fr', 'fr')
    expect(r.articleBodyText).toContain('deputes')
    expect(r.articleBodyText).not.toContain('Lisez aussi')
  })
})

describe('P17.10 end-boundary helpers', () => {
  it('trimArticleEndBoundary removes stop and following siblings only', () => {
    const $ = cheerio.load(
      `<div id="root"><p>Keep A</p><h3>Keep B</h3><div class="evr-sub-cta">DROP</div><p>After</p></div>`
    )
    trimArticleEndBoundary($, $('#root'), ['.evr-sub-cta'])
    const text = $('#root').text()
    expect(text).toContain('Keep A')
    expect(text).toContain('Keep B')
    expect(text).not.toContain('DROP')
    expect(text).not.toContain('After')
  })

  it('text stop markers do not fire on short / mid-sentence matches', () => {
    const kept = trimBodyTextAtPublisherStops(
      'Short body without enough content before marker Evrensel\'e Abone Ol trailing',
      'evrensel.net',
      220
    )
    expect(kept).toContain("Evrensel'e Abone Ol")

    const longEnough =
      'x'.repeat(230) +
      '\nEvrensel\'e Abone Ol\n31 yıldır emeğin sesi'
    const trimmed = trimBodyTextAtPublisherStops(longEnough, 'evrensel.net', 220)
    expect(trimmed).not.toContain("Evrensel'e Abone Ol")
    expect(trimmed.length).toBeGreaterThanOrEqual(220)
  })

  it('finalizeExtractedBody is host-aware', () => {
    const html = `<p>${'Para '.repeat(80)}</p><div class="evr-sub-cta"><p>Evrensel'e Abone Ol</p></div>`
    const out = finalizeExtractedBody(html, '', 'evrensel.net')
    expect(out.text).not.toContain("Evrensel'e Abone Ol")
    expect(out.text.length).toBeGreaterThan(200)
  })
})
