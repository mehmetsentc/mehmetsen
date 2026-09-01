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

const sql = neon(process.env.DATABASE_URL)

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
  }
}

async function deepAudit() {
  const now = new Date();

  // 1. Inventory Counts
  const newsRows = await sql`SELECT * FROM news ORDER BY created_at ASC`;
  const clusterRows = await sql`SELECT * FROM news_clusters ORDER BY created_at ASC`;
  const membershipRows = await sql`SELECT * FROM cluster_memberships`;
  const sourceRows = await sql`SELECT id, name, domain, status, country_code FROM news_sources`;
  const publisherRows = await sql`SELECT * FROM publishers`;

  const rawCountRes = await sql`SELECT count(*)::int AS count FROM raw_articles`;
  const rawTotal = rawCountRes[0].count;

  const rawEditorialGroup = await sql`
    SELECT editorial_status, count(*)::int AS count 
    FROM raw_articles 
    GROUP BY editorial_status
  `;
  const rawEditorialCounts = {};
  for (const g of rawEditorialGroup) {
    rawEditorialCounts[g.editorial_status] = g.count;
  }

  const sourcesById = new Map(sourceRows.map(s => [s.id, s]));
  const clustersById = new Map(clusterRows.map(c => [c.id, c]));

  // Memberships by cluster
  const membersByCluster = new Map();
  for (const m of membershipRows) {
    if (!membersByCluster.has(m.cluster_id)) membersByCluster.set(m.cluster_id, []);
    membersByCluster.get(m.cluster_id).push(m);
  }

  // Clusters by published_news_id
  const clustersByNewsId = new Map();
  for (const c of clusterRows) {
    if (c.published_news_id) {
      if (!clustersByNewsId.has(c.published_news_id)) clustersByNewsId.set(c.published_news_id, []);
      clustersByNewsId.get(c.published_news_id).push(c);
    }
  }

  // Find all cluster IDs associated with the 30 news rows
  const relevantClusterIds = [];
  for (const n of newsRows) {
    const list = clustersByNewsId.get(n.id) || [];
    for (const c of list) {
      relevantClusterIds.push(c.id);
    }
  }

  // Find membership article IDs only for those relevant clusters
  const relevantMembershipArticleIds = [];
  for (const cid of relevantClusterIds) {
    const members = membersByCluster.get(cid) || [];
    for (const m of members) {
      relevantMembershipArticleIds.push(m.article_id);
    }
  }

  // Fetch only the relevant raw articles!
  const relevantRawRows = await sql`
    SELECT id, source_id, cluster_id, title, article_body_text, original_url, canonical_url, published_at, editorial_status
    FROM raw_articles
    WHERE cluster_id = ANY(${relevantClusterIds.length ? relevantClusterIds : ['none']}) 
       OR id = ANY(${relevantMembershipArticleIds.length ? relevantMembershipArticleIds : ['none']})
  `;

  const rawById = new Map(relevantRawRows.map(r => [r.id, r]));
  const rawByClusterId = new Map();
  for (const r of relevantRawRows) {
    if (r.cluster_id) {
      if (!rawByClusterId.has(r.cluster_id)) rawByClusterId.set(r.cluster_id, []);
      rawByClusterId.get(r.cluster_id).push(r);
    }
  }

  console.log('=== GLOBAL INVENTORY ===');
  console.log('news total:', newsRows.length);
  const newsStatusCounts = {};
  for (const n of newsRows) {
    newsStatusCounts[n.status] = (newsStatusCounts[n.status] || 0) + 1;
  }
  console.log('news by status:', newsStatusCounts);

  console.log('raw_articles total:', rawTotal);
  console.log('raw_articles by editorial_status:', rawEditorialCounts);
  console.log('news_clusters total:', clusterRows.length);
  console.log('cluster_memberships total:', membershipRows.length);
  console.log('news_sources total:', sourceRows.length);
  console.log('publishers total:', publisherRows.length);

  // Controls to exclude
  const pilotId = 'FS6T7WazJeEe0kjOHJ5T';
  const controlId = 'IBeli7VLsE3OVfOKKRmu';

  const remainingDrafts = newsRows.filter(n => n.status === 'draft');
  console.log('\n=== DRAFT INTEGRITY ===');
  console.log('remaining drafts:', remainingDrafts.length);

  let draftsWithCluster = 0;
  let draftsWithoutCluster = 0;
  let draftsWithProvenance = 0;
  let draftsWithoutProvenance = 0;

  const draftAudits = [];

  for (const draft of remainingDrafts) {
    const matchedClusters = clustersByNewsId.get(draft.id) || [];
    const primaryCluster = matchedClusters[0] || null;

    if (primaryCluster) draftsWithCluster++;
    else draftsWithoutCluster++;

    // Find all raw articles for this draft
    let rawList = [];
    if (primaryCluster) {
      const clusterMembers = membersByCluster.get(primaryCluster.id) || [];
      for (const m of clusterMembers) {
        const r = rawById.get(m.article_id);
        if (r) {
          const s = sourcesById.get(r.source_id);
          rawList.push({
            ...r,
            domain: s?.domain || 'unknown',
            sourceName: s?.name || 'unknown',
          });
        }
      }
      // If no members in cluster_memberships, check raw_articles by cluster_id
      if (rawList.length === 0) {
        const rawByClust = rawByClusterId.get(primaryCluster.id) || [];
        for (const r of rawByClust) {
          const s = sourcesById.get(r.source_id);
          rawList.push({
            ...r,
            domain: s?.domain || 'unknown',
            sourceName: s?.name || 'unknown',
          });
        }
      }
    }

    // Also check if draft has direct source_url in relevant raw_articles
    if (rawList.length === 0 && draft.source_url) {
      const matchUrl = relevantRawRows.filter(r => r.original_url === draft.source_url || r.canonical_url === draft.source_url);
      for (const r of matchUrl) {
        const s = sourcesById.get(r.source_id);
        rawList.push({
          ...r,
          domain: s?.domain || 'unknown',
          sourceName: s?.name || 'unknown',
        });
      }
    }

    if (rawList.length > 0) draftsWithProvenance++;
    else draftsWithoutProvenance++;

    // Distinct domains
    const uniqueDomains = new Set(rawList.map(r => r.domain).filter(d => d && d !== 'unknown'));
    const uniqueDomainCount = uniqueDomains.size;
    const rawSourceCount = rawList.length;

    // Primary source domain
    let primaryDomain = Array.from(uniqueDomains)[0] || 'none';

    // Source publication time: earliest / latest of raw articles
    let sourcePubTime = null;
    for (const r of rawList) {
      if (r.published_at) {
        if (!sourcePubTime || new Date(r.published_at) > new Date(sourcePubTime)) {
          sourcePubTime = r.published_at;
        }
      }
    }
    if (!sourcePubTime && primaryCluster) {
      sourcePubTime = primaryCluster.first_seen_at || primaryCluster.created_at;
    }

    // Similarity & Overlap Audit
    const draftText = `${draft.title || ''}\n${draft.description || ''}\n${draft.content || ''}`;
    let maxSimilarity = 0;
    let maxOverlapCat = 'LOW_OVERLAP';
    let highestOverlapSource = null;

    for (const r of rawList) {
      const rawText = `${r.title || ''}\n${r.article_body_text || ''}`;
      const sim = checkTextSimilarity(draftText, rawText);
      if (sim.similarity > maxSimilarity) {
        maxSimilarity = sim.similarity;
        maxOverlapCat = sim.overlapCategory;
        highestOverlapSource = r.domain;
      }
    }

    // Quality Audit
    const titleClean = (draft.title || '').trim();
    const bodyClean = (draft.content || '').trim();
    let qualityCat = 'PASS';
    if (!titleClean || titleClean.length < 12) {
      qualityCat = 'MISSING_HEADLINE';
    } else if (!bodyClean || bodyClean.length < 80) {
      qualityCat = 'TOO_THIN';
    } else if (rawSourceCount === 0) {
      qualityCat = 'MISSING_PROVENANCE';
    }

    // Staleness
    let ageDays = null;
    let staleBucket = '>30d';
    if (sourcePubTime) {
      const diffMs = now.getTime() - new Date(sourcePubTime).getTime();
      ageDays = diffMs / (1000 * 60 * 60 * 24);
      if (ageDays < 1) staleBucket = '<24h';
      else if (ageDays <= 3) staleBucket = '1–3d';
      else if (ageDays <= 7) staleBucket = '4–7d';
      else if (ageDays <= 30) staleBucket = '8–30d';
      else staleBucket = '>30d';
    }

    draftAudits.push({
      draftId: draft.id,
      clusterId: primaryCluster?.id || null,
      eventKey: primaryCluster?.event_key || null,
      headline: draft.title,
      category: draft.category_id,
      city: draft.city_name || draft.city_slug || null,
      country: 'TR',
      createdAt: draft.created_at,
      sourcePubTime,
      ageDays: ageDays ? Number(ageDays.toFixed(1)) : null,
      staleBucket,
      primarySourceDomain: primaryDomain,
      rawSourceCount,
      uniqueDomainCount,
      domains: Array.from(uniqueDomains),
      maxSimilarity: Number(maxSimilarity.toFixed(3)),
      maxOverlapCat,
      highestOverlapSource,
      qualityCat,
      bodyLength: bodyClean.length,
      classification: 'READY_FOR_HUMAN_REWRITE', // will be refined below
    });
  }

  // Duplicate check across remaining drafts
  const eventKeyCounts = {};
  const clusterIdCounts = {};
  for (const d of draftAudits) {
    if (d.eventKey) eventKeyCounts[d.eventKey] = (eventKeyCounts[d.eventKey] || 0) + 1;
    if (d.clusterId) clusterIdCounts[d.clusterId] = (clusterIdCounts[d.clusterId] || 0) + 1;
  }

  // Assign Primary Classification
  // Hierarchy:
  // 1. DUPLICATE_EVENT (if multiple drafts represent exact same cluster/event)
  // 2. INVALID_SOURCE (if source missing/invalid/empty domain)
  // 3. INSUFFICIENT_PROVENANCE (if 0 sources or raw_articles missing)
  // 4. HIGH_SOURCE_OVERLAP (if overlap >= 70% with raw source)
  // 5. TOO_THIN (if body < 80 chars or missing body/headline)
  // 6. STALE (if source publication date > 30 days or explicitly stale)
  // 7. READY_FOR_HUMAN_REWRITE (if pass quality, has provenance, not duplicate, not high overlap)
  // 8. OTHER_BLOCKED
  for (const d of draftAudits) {
    if (d.eventKey && eventKeyCounts[d.eventKey] > 1) {
      d.classification = 'DUPLICATE_EVENT';
    } else if (d.rawSourceCount === 0) {
      d.classification = 'INSUFFICIENT_PROVENANCE';
    } else if (!d.primarySourceDomain || d.primarySourceDomain === 'unknown' || d.primarySourceDomain === 'none') {
      d.classification = 'INVALID_SOURCE';
    } else if (d.maxOverlapCat === 'HIGH_OVERLAP') {
      d.classification = 'HIGH_SOURCE_OVERLAP';
    } else if (d.qualityCat === 'TOO_THIN' || d.qualityCat === 'MISSING_BODY' || d.qualityCat === 'MISSING_HEADLINE') {
      d.classification = 'TOO_THIN';
    } else if (d.staleBucket === '>30d') {
      d.classification = 'STALE';
    } else {
      d.classification = 'READY_FOR_HUMAN_REWRITE';
    }
  }

  console.log(`drafts with cluster: ${draftsWithCluster}`);
  console.log(`drafts without cluster: ${draftsWithoutCluster}`);
  console.log(`drafts with provenance: ${draftsWithProvenance}`);
  console.log(`drafts without provenance: ${draftsWithoutProvenance}`);

  // Aggregates
  const diversityCounts = { '0 unique': 0, '1 unique': 0, '2 unique': 0, '3+ unique': 0 };
  const overlapCounts = { LOW_OVERLAP: 0, MEDIUM_OVERLAP: 0, HIGH_OVERLAP: 0, UNKNOWN: 0 };
  const qualityCounts = { PASS: 0, TOO_THIN: 0, MISSING_BODY: 0, MISSING_HEADLINE: 0, BAD_IMAGE: 0, MISSING_PROVENANCE: 0, OTHER: 0 };
  const staleCounts = { '<24h': 0, '1–3d': 0, '4–7d': 0, '8–30d': 0, '>30d': 0 };
  const classCounts = {
    READY_FOR_HUMAN_REWRITE: 0,
    INSUFFICIENT_PROVENANCE: 0,
    HIGH_SOURCE_OVERLAP: 0,
    TOO_THIN: 0,
    DUPLICATE_EVENT: 0,
    STALE: 0,
    INVALID_SOURCE: 0,
    OTHER_BLOCKED: 0,
  };

  for (const d of draftAudits) {
    if (d.uniqueDomainCount === 0) diversityCounts['0 unique']++;
    else if (d.uniqueDomainCount === 1) diversityCounts['1 unique']++;
    else if (d.uniqueDomainCount === 2) diversityCounts['2 unique']++;
    else diversityCounts['3+ unique']++;

    overlapCounts[d.maxOverlapCat] = (overlapCounts[d.maxOverlapCat] || 0) + 1;
    qualityCounts[d.qualityCat] = (qualityCounts[d.qualityCat] || 0) + 1;
    staleCounts[d.staleBucket] = (staleCounts[d.staleBucket] || 0) + 1;
    classCounts[d.classification] = (classCounts[d.classification] || 0) + 1;
  }

  console.log('\n=== SOURCE DIVERSITY ===', diversityCounts);
  console.log('\n=== OVERLAP COUNTS ===', overlapCounts);
  console.log('\n=== QUALITY COUNTS ===', qualityCounts);
  console.log('\n=== STALENESS COUNTS ===', staleCounts);
  console.log('\n=== CLASSIFICATION COUNTS ===', classCounts);

  // Print all drafts summary table
  console.log('\n=== DRAFT AUDITS DETAIL (TABLE) ===');
  draftAudits.forEach((d, idx) => {
    console.log(`[${idx + 1}] ID: ${d.draftId} | Cluster: ${d.clusterId} | Sources: ${d.rawSourceCount} (${d.uniqueDomainCount} unq) | Dom: ${d.domains.join(',')} | Sim: ${d.maxSimilarity} (${d.maxOverlapCat}) | Age: ${d.ageDays}d (${d.staleBucket}) | Qual: ${d.qualityCat} | Class: ${d.classification} | Title: ${d.headline.slice(0, 45)}`);
  });

  writeFileSync('artifacts/_p17_9_draft_audits.json', JSON.stringify({
    timestamp: now.toISOString(),
    globalCounts: {
      newsTotal: newsRows.length,
      newsByStatus: newsStatusCounts,
      rawArticlesTotal: rawTotal,
      rawArticlesByEditorial: rawEditorialCounts,
      newsClustersTotal: clusterRows.length,
      clusterMembershipsTotal: membershipRows.length,
      newsSourcesTotal: sourceRows.length,
      publishersTotal: publisherRows.length,
    },
    draftIntegrity: {
      remainingDrafts: remainingDrafts.length,
      draftsWithCluster,
      draftsWithoutCluster,
      draftsWithProvenance,
      draftsWithoutProvenance,
    },
    diversityCounts,
    overlapCounts,
    qualityCounts,
    staleCounts,
    classCounts,
    drafts: draftAudits,
  }, null, 2));
}

deepAudit().catch(console.error);
