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
    gramsA.add(`${tokensA[i]} ${tokensA[i + 1]} ${tokensA[i + 2]}`)
  }
  const gramsB = new Set()
  for (let i = 0; i <= tokensB.length - 3; i++) {
    gramsB.add(`${tokensB[i]} ${tokensB[i + 1]} ${tokensB[i + 2]}`)
  }
  let intersection = 0
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++
  }
  const union = new Set([...gramsA, ...gramsB]).size
  return union === 0 ? 0 : intersection / union
}

function computeTokenMatchRatio(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0
  const setB = new Set(tokensB)
  let matched = 0
  for (const t of tokensA) {
    if (setB.has(t)) matched++
  }
  return matched / Math.max(tokensA.length, 1)
}

function checkTextSimilarity(canonicalText, rawSourceText) {
  const canTokens = tokenize(canonicalText)
  const rawTokens = tokenize(rawSourceText)

  if (canTokens.length === 0 || rawTokens.length === 0) {
    return {
      similarity: 0,
      jaccard: 0,
      ngram3: 0,
      tokenMatchRatio: 0,
      overlapCategory: 'LOW_OVERLAP',
      flaggedForReview: false,
    }
  }

  const jaccard = computeJaccard(canTokens, rawTokens)
  const ngram3 = compute3GramOverlap(canTokens, rawTokens)
  const tokenMatchRatio = computeTokenMatchRatio(canTokens, rawTokens)

  const similarity = jaccard * 0.4 + ngram3 * 0.3 + tokenMatchRatio * 0.3

  let overlapCategory = 'LOW_OVERLAP'
  if (similarity >= 0.7) {
    overlapCategory = 'HIGH_OVERLAP'
  } else if (similarity >= 0.3) {
    overlapCategory = 'MEDIUM_OVERLAP'
  }

  return {
    similarity,
    jaccard,
    ngram3,
    tokenMatchRatio,
    overlapCategory,
    flaggedForReview: overlapCategory === 'HIGH_OVERLAP',
  }
}

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const sql = neon(url)

  console.log('=== P17.7: 28-ARTICLE REMEDIATION INVENTORY ===')

  const rows = await sql`
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
      nc.canonical_title as cluster_title,
      nc.source_count as cluster_source_count,
      nc.importance_score as cluster_importance,
      nc.editorial_decision,
      nc.editorial_decided_by,
      nc.editorial_decided_at,
      ns.name as primary_source_name,
      ns.domain as primary_source_domain,
      ra.id as primary_raw_article_id,
      ra.title as raw_title,
      ra.article_body_text as raw_body,
      ra.description as raw_description,
      ra.editorial_status as raw_editorial_status,
      pci.id as content_item_id,
      pci.status as content_item_status,
      pci.rights_status as content_rights_status,
      pci.rights_basis as content_rights_basis,
      pci.approved_by as content_approved_by
    FROM news n
    LEFT JOIN news_clusters nc ON nc.published_news_id = n.id
    LEFT JOIN news_sources ns ON ns.id = nc.primary_source_id
    LEFT JOIN raw_articles ra ON ra.cluster_id = nc.id AND ra.source_id = nc.primary_source_id
    LEFT JOIN publisher_content_items pci ON pci.published_news_id = n.id
    WHERE n.status = 'published'
      AND n.published_at IS NOT NULL
      AND n.published_at <= NOW()
    ORDER BY n.published_at DESC
  `

  const dedupped = new Map()
  for (const r of rows) {
    if (!dedupped.has(r.canonical_news_id)) {
      dedupped.set(r.canonical_news_id, r)
    }
  }

  const articles = Array.from(dedupped.values())
  console.log(`Auditing ${articles.length} active published articles...`)

  const inventory = []

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i]
    const canText = art.content || art.summary || art.headline || ''
    const rawText = art.raw_body || art.raw_description || art.raw_title || ''

    const sim = checkTextSimilarity(canText, rawText)

    const rightsStatus = art.content_rights_status || 'UNKNOWN'
    const rightsBasis = art.content_rights_basis || 'UNKNOWN'
    const isLicensed = ['LICENSED', 'SYNDICATED', 'PRESS_RELEASE', 'OFFICIAL_STATEMENT', 'PUBLIC_STATEMENT', 'PUBLISHER_OWNED', 'OWNED'].includes(rightsStatus.toUpperCase()) ||
                       ['LICENSED', 'SYNDICATED', 'PRESS_RELEASE', 'OFFICIAL_STATEMENT', 'PUBLIC_STATEMENT', 'PUBLISHER_OWNED', 'OWNED'].includes(rightsBasis.toUpperCase())

    let classification = 'INSUFFICIENT_RIGHTS_EVIDENCE'
    if (isLicensed) {
      classification = 'SAFE_LICENSED'
    } else if (sim.overlapCategory === 'HIGH_OVERLAP') {
      classification = 'NEEDS_HUMAN_REVIEW'
    } else if (sim.overlapCategory === 'LOW_OVERLAP') {
      classification = 'SAFE_LICENSED'
    } else {
      classification = 'NEEDS_HUMAN_REVIEW'
    }

    inventory.push({
      index: i + 1,
      canonical_news_id: art.canonical_news_id,
      headline: art.headline,
      source: art.primary_source_name || art.primary_source_domain || 'Unknown',
      overlap_percentage: (sim.similarity * 100).toFixed(1) + '%',
      overlap_category: sim.overlapCategory,
      rights_metadata: {
        rightsStatus,
        rightsBasis,
        hasExplicitRights: isLicensed
      },
      editorial_review_evidence: {
        cluster_id: art.cluster_id || 'NONE',
        editorial_decision: art.editorial_decision || 'NONE',
        editorial_decided_by: art.editorial_decided_by || 'NONE',
        content_item_id: art.content_item_id || 'NONE',
        approved_by: art.content_approved_by || 'NONE'
      },
      current_public_status: art.news_status,
      remediation_classification: classification,
      proposed_action: classification === 'NEEDS_HUMAN_REVIEW' || classification === 'INSUFFICIENT_RIGHTS_EVIDENCE'
        ? 'HOLD_FOR_EDITORIAL_REWRITE'
        : 'RETAIN_PUBLIC'
    })
  }

  const summary = {
    totalAudited: inventory.length,
    classificationCounts: {
      SAFE_LICENSED: inventory.filter(x => x.remediation_classification === 'SAFE_LICENSED').length,
      NEEDS_HUMAN_REVIEW: inventory.filter(x => x.remediation_classification === 'NEEDS_HUMAN_REVIEW').length,
      INSUFFICIENT_RIGHTS_EVIDENCE: inventory.filter(x => x.remediation_classification === 'INSUFFICIENT_RIGHTS_EVIDENCE').length
    },
    proposedHoldCount: inventory.filter(x => x.proposed_action === 'HOLD_FOR_EDITORIAL_REWRITE').length,
    inventory
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p17_7_remediation_out.json'), JSON.stringify(summary, null, 2))
  console.log('Saved remediation inventory to scripts/_phase_p17_7_remediation_out.json')
  console.log('Summary:', summary.classificationCounts, 'Proposed Hold Count:', summary.proposedHoldCount)
}

run().catch(console.error)
