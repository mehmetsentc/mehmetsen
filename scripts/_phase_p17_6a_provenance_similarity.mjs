import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(k in process.env)) process.env[k] = v
    }
  } catch (e) {}
}

loadEnvLocal()

function tokenize(text) {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function computeJaccard(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

function compute3GramOverlap(tokensA, tokensB) {
  if (tokensA.length < 3 || tokensB.length < 3) return computeJaccard(tokensA, tokensB)
  const gramsA = new Set()
  for (let i = 0; i <= tokensA.length - 3; i++) {
    gramsA.add(`${tokensA[i]} ${tokensA[i+1]} ${tokensA[i+2]}`)
  }
  const gramsB = new Set()
  for (let i = 0; i <= tokensB.length - 3; i++) {
    gramsB.add(`${tokensB[i]} ${tokensB[i+1]} ${tokensB[i+2]}`)
  }
  let intersection = 0
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++
  }
  const union = new Set([...gramsA, ...gramsB]).size
  return union === 0 ? 0 : intersection / union
}

function computeLcsRatio(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0
  // Approximate LCS length with token window matching to prevent O(N*M) explosions
  const setB = new Set(tokensB)
  let matchedA = 0
  for (const t of tokensA) {
    if (setB.has(t)) matchedA++
  }
  return matchedA / Math.max(tokensA.length, 1)
}

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== PHASE P17.6A: 29-ARTICLE PROVENANCE & SIMILARITY AUDIT ===')

  // Query the 29 canonical published news
  const canonicalNews = await sql`
    SELECT 
      n.id as canonical_news_id,
      n.title as headline,
      n.summary,
      n.content,
      n.category_id,
      n.status as news_status,
      n.published_at,
      n.created_at,
      n.slug,
      nc.id as cluster_id,
      nc.source_count as cluster_source_count,
      nc.importance_score as cluster_importance,
      nc.editorial_decision,
      nc.editorial_decided_by,
      nc.editorial_decided_at,
      nc.approval_source,
      ns.name as primary_source_name,
      ns.domain as primary_source_domain,
      ra.id as primary_raw_article_id,
      ra.title as raw_title,
      ra.article_body_text as raw_body,
      ra.description as raw_description,
      ra.editorial_status as raw_editorial_status,
      pci.id as content_item_id,
      pci.status as content_item_status,
      pci.approved_by as content_approved_by,
      pcr.id as revision_id
    FROM news n
    LEFT JOIN news_clusters nc ON nc.published_news_id = n.id
    LEFT JOIN news_sources ns ON ns.id = nc.primary_source_id
    LEFT JOIN raw_articles ra ON ra.cluster_id = nc.id AND ra.source_id = nc.primary_source_id
    LEFT JOIN publisher_content_items pci ON pci.published_news_id = n.id
    LEFT JOIN publisher_content_revisions pcr ON pcr.content_id = pci.id
    WHERE (n.status = 'published' OR lower(n.status::text) in ('published', 'active'))
      AND n.published_at IS NOT NULL
      AND n.published_at <= NOW()
    ORDER BY n.published_at DESC
  `

  console.log(`Retrieved ${canonicalNews.length} joined records from DB.`)

  // Group by canonical_news_id
  const articleMap = new Map()
  for (const row of canonicalNews) {
    if (!articleMap.has(row.canonical_news_id)) {
      articleMap.set(row.canonical_news_id, row)
    }
  }

  const articles = Array.from(articleMap.values())
  console.log(`Deduplicated canonical articles count: ${articles.length}`)

  const provenanceMatrix = []
  let highOverlapCount = 0
  let mediumOverlapCount = 0
  let lowOverlapCount = 0

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i]
    const canonicalText = (art.content || art.summary || art.headline || '')
    const rawText = (art.raw_body || art.raw_description || art.raw_title || '')

    const canTokens = tokenize(canonicalText)
    const rawTokens = tokenize(rawText)

    const jaccard = computeJaccard(canTokens, rawTokens)
    const gram3 = compute3GramOverlap(canTokens, rawTokens)
    const tokenMatchRatio = computeLcsRatio(canTokens, rawTokens)

    // Composite similarity index (0 to 1)
    const similarity = canTokens.length === 0 || rawTokens.length === 0
      ? 0
      : (jaccard * 0.4 + gram3 * 0.3 + tokenMatchRatio * 0.3)

    let overlapCategory = 'LOW_OVERLAP'
    if (similarity >= 0.70) {
      overlapCategory = 'HIGH_OVERLAP'
      highOverlapCount++
    } else if (similarity >= 0.30) {
      overlapCategory = 'MEDIUM_OVERLAP'
      mediumOverlapCount++
    } else {
      lowOverlapCount++
    }

    // Provenance classification
    let copyClass = 'B' // B: deterministic transformed source copy (default pipeline)
    if (art.content_item_id && art.content_approved_by) {
      copyClass = 'A' // A: manually authored / rewritten editorial copy
    } else if (overlapCategory === 'HIGH_OVERLAP' && !art.content_approved_by) {
      copyClass = 'C' // C: direct/substantial source-body reuse
    } else if (!art.cluster_id && !art.primary_raw_article_id) {
      copyClass = 'D' // D: insufficient evidence
    }

    const copyClassLabel = {
      A: 'A (Manual/Rewritten Editorial Copy)',
      B: 'B (Deterministic Transformed Source Copy)',
      C: 'C (Substantial Source-Body Reuse)',
      D: 'D (Insufficient Evidence)',
    }[copyClass]

    const publicationPath = art.content_item_id
      ? 'publisher_content_pipeline'
      : art.cluster_id
        ? 'editorial_supply_pipeline (P16 deterministic)'
        : 'direct_canonical_publication'

    provenanceMatrix.push({
      index: i + 1,
      canonical_news_id: art.canonical_news_id,
      cluster_id: art.cluster_id || 'NONE',
      headline: (art.headline || '').slice(0, 70),
      primary_source: art.primary_source_name || art.primary_source_domain || 'Unknown',
      primary_raw_article_id: art.primary_raw_article_id || 'NONE',
      supporting_source_count: Math.max(1, art.cluster_source_count || 1),
      content_item_id: art.content_item_id || 'NONE',
      revision_id: art.revision_id || 'NONE',
      editorial_status: art.editorial_decision || art.raw_editorial_status || 'APPROVED',
      reviewed_by: art.editorial_decided_by || art.content_approved_by || 'system_editorial_gate',
      approved_at: art.editorial_decided_at || art.published_at || 'NONE',
      publication_mechanism: publicationPath,
      similarity_score: (similarity * 100).toFixed(1) + '%',
      jaccard_score: (jaccard * 100).toFixed(1) + '%',
      overlap_category: overlapCategory,
      copy_class: copyClass,
      copy_class_label: copyClassLabel,
      flagged_for_review: overlapCategory === 'HIGH_OVERLAP'
    })
  }

  const summary = {
    totalArticles: articles.length,
    overlapDistribution: {
      LOW_OVERLAP: lowOverlapCount,
      MEDIUM_OVERLAP: mediumOverlapCount,
      HIGH_OVERLAP: highOverlapCount
    },
    copyClassDistribution: {
      A: provenanceMatrix.filter(p => p.copy_class === 'A').length,
      B: provenanceMatrix.filter(p => p.copy_class === 'B').length,
      C: provenanceMatrix.filter(p => p.copy_class === 'C').length,
      D: provenanceMatrix.filter(p => p.copy_class === 'D').length,
    },
    flaggedCount: provenanceMatrix.filter(p => p.flagged_for_review).length,
    matrix: provenanceMatrix
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p17_6a_provenance_out.json'), JSON.stringify(summary, null, 2))
  console.log('Saved provenance and similarity analysis to scripts/_phase_p17_6a_provenance_out.json')
  console.log('\n--- SUMMARY ---')
  console.log(`Total canonical articles audited: ${summary.totalArticles}`)
  console.log(`Overlap breakdown: LOW: ${lowOverlapCount}, MEDIUM: ${mediumOverlapCount}, HIGH: ${highOverlapCount}`)
  console.log(`Copy class breakdown: A: ${summary.copyClassDistribution.A}, B: ${summary.copyClassDistribution.B}, C: ${summary.copyClassDistribution.C}, D: ${summary.copyClassDistribution.D}`)
  console.log(`Flagged for editorial review: ${summary.flaggedCount}`)
}

run().catch(console.error)
