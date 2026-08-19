import { describe, expect, it } from 'vitest'
import { extractJsonLdArticle } from './jsonld'
import { extractOpenGraph } from './opengraph'
import { extractArticle } from './pipeline'

const JSON_LD_HTML = `<!doctype html>
<html lang="en"><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "City council approves budget",
  "description": "The council voted tonight.",
  "articleBody": "Paragraph one explains the vote in detail for readers who missed the session.\\n\\nParagraph two quotes the mayor on funding priorities and oversight.\\n\\nParagraph three covers next steps and the timeline for implementation across districts next month.",
  "datePublished": "2026-08-18T12:00:00Z",
  "author": { "@type": "Person", "name": "Ada News" },
  "image": "https://news.test/img.jpg",
  "mainEntityOfPage": "https://news.test/budget"
}
</script>
</head><body></body></html>`

const OG_HTML = `<!doctype html>
<html><head>
<meta property="og:title" content="Storm hits coast">
<meta property="og:description" content="Winds and rain overnight.">
<meta property="og:image" content="https://news.test/storm.jpg">
<meta property="article:published_time" content="2026-08-18T07:00:00Z">
<meta property="article:author" content="Weather Desk">
<link rel="canonical" href="https://news.test/storm">
</head><body>
<article>
<p>Residents woke to fallen trees and flooded streets after overnight storms moved across the coastline.</p>
<p>Emergency crews said power could remain out in several neighborhoods until late afternoon.</p>
<p>Officials asked people to avoid downed lines and to check on elderly neighbors.</p>
</article>
</body></html>`

const SEMANTIC_HTML = `<!doctype html>
<html lang="fr"><body>
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

describe('article extraction', () => {
  it('extracts NewsArticle JSON-LD', () => {
    const parsed = extractJsonLdArticle(JSON_LD_HTML, 'https://news.test/budget')
    expect(parsed?.title).toBe('City council approves budget')
    expect(parsed?.articleBody).toContain('Paragraph one')
    expect(parsed?.author).toBe('Ada News')
  })

  it('extracts OpenGraph metadata', () => {
    const og = extractOpenGraph(OG_HTML, 'https://news.test/storm')
    expect(og.title).toBe('Storm hits coast')
    expect(og.canonicalUrl).toBe('https://news.test/storm')
    expect(og.image).toContain('storm.jpg')
  })

  it('prefers JSON-LD body in the pipeline', () => {
    const extracted = extractArticle(JSON_LD_HTML, 'https://news.test/budget', 'en')
    expect(extracted.extractionMethod).toBe('jsonld')
    expect(extracted.articleBodyText).toContain('Paragraph two')
    expect(extracted.wordCount).toBeGreaterThan(20)
    expect(extracted.extractionConfidence).toBeGreaterThan(0.8)
  })

  it('uses semantic HTML when JSON-LD is absent', () => {
    const extracted = extractArticle(SEMANTIC_HTML, 'https://news.test/fr', 'fr')
    expect(extracted.extractionMethod).toBe('semantic-html')
    expect(extracted.articleBodyText).toContain('deputes')
    expect(extracted.language).toBe('fr')
  })
})
