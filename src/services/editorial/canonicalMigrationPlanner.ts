/**
 * P18.4B — READ-ONLY dry-run migration planner for a single Firestore news doc.
 *
 * NO writes. NO publish. NO social/seen remaps. executable always false.
 */

import 'server-only'

import { count, eq, inArray, or } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { newsClusters } from '@/db/schema/crawler'
import { publishers, publisherSources } from '@/db/schema/publishers'
import { articleComments, articleLikes, savedArticles } from '@/db/schema/socialGraph'
import { userContentImpressions } from '@/db/schema/smartFeed'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  classifyMigrationEligibility,
  migrationEvidenceFromFirestoreDoc,
  resolveMigrationTargetPgId,
  type MigrationEligibilityClass,
  type MigrationEligibilityResult,
} from '@/services/editorial/canonicalMigrationEligibility'
import { resolveCanonicalIdentityAliases } from '@/services/editorial/canonicalIdentityContinuity'

export type MigrationPlanResult = {
  firestoreId: string
  currentReadClass: MigrationEligibilityResult['currentReadClass']
  migrationClass: MigrationEligibilityClass
  targetPgId: string
  targetSlug: string | null
  publicationAuthority: MigrationEligibilityResult['proposedAuthority']
  publisherMapping: {
    status: 'resolved' | 'missing' | 'ambiguous'
    publisherId: string | null
    publisherSlug: string | null
    sourceId: string | null
  }
  clusterMapping: {
    status: 'resolved' | 'missing' | 'orphan_ref' | 'ambiguous'
    clusterId: string | null
    publishedNewsId: string | null
  }
  slugImpact: {
    status: 'available' | 'same_mirror' | 'collision' | 'invalid' | 'missing'
    collidingPgId: string | null
  }
  socialIdentityImpact: {
    likes: number
    saves: number
    comments: number
    strategy: 'prefer_fs_id_as_pg_id_alias'
  }
  seenIdentityImpact: {
    impressionRows: number
    strategy: 'expandArticleIdentities_alias'
  }
  seoImpact: {
    indexableToday: boolean
    preserveSlug: boolean
  }
  bodyEligibility: MigrationEligibilityResult['body']
  human: MigrationEligibilityResult['human']
  blockers: string[]
  /** Hard lock — P18.4B never executes. */
  executable: false
  writeCapability: 'NONE'
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

/**
 * Plan migration for one Firestore document. Read-only.
 */
export async function planCanonicalMigrationDryRun(
  firestoreId: string
): Promise<MigrationPlanResult> {
  const id = firestoreId.trim()
  if (!id) {
    return emptyBlockedPlan('', ['empty_firestore_id'])
  }

  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(id).get()
  if (!snap.exists) {
    return emptyBlockedPlan(id, ['firestore_doc_missing'])
  }

  const data = (snap.data() ?? {}) as Record<string, unknown>
  const evidence = migrationEvidenceFromFirestoreDoc(snap.id, data)

  const db = requireDb()
  const mirrors = await db
    .select({
      id: news.id,
      legacyFirestoreId: news.legacyFirestoreId,
      slug: news.slug,
      status: news.status,
    })
    .from(news)
    .where(or(eq(news.legacyFirestoreId, id), eq(news.id, id)))
    .limit(2)

  const pgMirror = mirrors[0]
    ? {
        id: mirrors[0].id,
        legacyFirestoreId: mirrors[0].legacyFirestoreId,
        slug: mirrors[0].slug,
        status: mirrors[0].status,
      }
    : null

  if (mirrors.length > 1) {
    // Should be impossible under unique legacy_firestore_id — surface as blocker.
  }

  const eligibility = classifyMigrationEligibility({ evidence, pgMirror })
  const blockers = [...eligibility.blockers]
  if (mirrors.length > 1) blockers.push('duplicate_pg_mirror_rows')

  // Slug continuity
  let slugImpact: MigrationPlanResult['slugImpact'] = {
    status: 'missing',
    collidingPgId: null,
  }
  const slug = eligibility.targetSlug
  if (!slug) {
    slugImpact = { status: 'missing', collidingPgId: null }
    blockers.push('slug_missing')
  } else {
    const slugRows = await db
      .select({ id: news.id, legacyFirestoreId: news.legacyFirestoreId })
      .from(news)
      .where(eq(news.slug, slug))
      .limit(2)
    if (!slugRows.length) {
      slugImpact = { status: 'available', collidingPgId: null }
    } else if (slugRows.some((r) => r.id === id || r.legacyFirestoreId === id || r.id === pgMirror?.id)) {
      slugImpact = { status: 'same_mirror', collidingPgId: slugRows[0]!.id }
    } else {
      slugImpact = { status: 'collision', collidingPgId: slugRows[0]!.id }
      blockers.push('slug_collision')
    }
  }

  // Publisher mapping via exact source ids only
  const sourceHint =
    (typeof data.ingestionSourceId === 'string' && data.ingestionSourceId.trim()) ||
    (typeof data.sourceId === 'string' && data.sourceId.trim()) ||
    null
  const publisherHint =
    typeof data.publisherId === 'string' && data.publisherId.trim() ? data.publisherId.trim() : null

  let publisherMapping: MigrationPlanResult['publisherMapping'] = {
    status: 'missing',
    publisherId: null,
    publisherSlug: null,
    sourceId: null,
  }

  if (publisherHint) {
    const pubs = await db
      .select({ id: publishers.id, slug: publishers.slug })
      .from(publishers)
      .where(eq(publishers.id, publisherHint))
      .limit(1)
    if (pubs[0]) {
      publisherMapping = {
        status: 'resolved',
        publisherId: pubs[0].id,
        publisherSlug: pubs[0].slug,
        sourceId: sourceHint,
      }
    }
  }

  if (publisherMapping.status === 'missing' && sourceHint) {
    const links = await db
      .select({
        publisherId: publisherSources.publisherId,
        sourceId: publisherSources.sourceId,
        slug: publishers.slug,
      })
      .from(publisherSources)
      .innerJoin(publishers, eq(publishers.id, publisherSources.publisherId))
      .where(eq(publisherSources.sourceId, sourceHint))
      .limit(3)
    if (links.length === 1) {
      publisherMapping = {
        status: 'resolved',
        publisherId: links[0]!.publisherId,
        publisherSlug: links[0]!.slug,
        sourceId: links[0]!.sourceId,
      }
    } else if (links.length > 1) {
      publisherMapping = {
        status: 'ambiguous',
        publisherId: null,
        publisherSlug: null,
        sourceId: sourceHint,
      }
      blockers.push('publisher_ambiguous')
    } else {
      blockers.push('publisher_missing')
    }
  } else if (publisherMapping.status === 'missing') {
    blockers.push('publisher_missing')
  }

  // Cluster mapping
  let clusterMapping: MigrationPlanResult['clusterMapping'] = {
    status: 'missing',
    clusterId: null,
    publishedNewsId: null,
  }
  const clusterId =
    typeof data.clusterId === 'string' && data.clusterId.trim() ? data.clusterId.trim() : null
  if (clusterId) {
    const clusters = await db
      .select({
        id: newsClusters.id,
        publishedNewsId: newsClusters.publishedNewsId,
      })
      .from(newsClusters)
      .where(eq(newsClusters.id, clusterId))
      .limit(1)
    if (!clusters[0]) {
      clusterMapping = { status: 'missing', clusterId, publishedNewsId: null }
    } else if (
      clusters[0].publishedNewsId &&
      clusters[0].publishedNewsId !== id &&
      clusters[0].publishedNewsId !== pgMirror?.id
    ) {
      // Check orphan
      const exists = await db
        .select({ id: news.id })
        .from(news)
        .where(eq(news.id, clusters[0].publishedNewsId))
        .limit(1)
      clusterMapping = {
        status: exists[0] ? 'ambiguous' : 'orphan_ref',
        clusterId,
        publishedNewsId: clusters[0].publishedNewsId,
      }
      if (!exists[0]) blockers.push('cluster_orphan_published_news_id')
      else blockers.push('cluster_points_elsewhere')
    } else {
      clusterMapping = {
        status: 'resolved',
        clusterId,
        publishedNewsId: clusters[0].publishedNewsId,
      }
    }
  }

  const aliases = resolveCanonicalIdentityAliases({
    firestoreId: id,
    pgId: eligibility.targetPgId,
    legacyFirestoreId: pgMirror?.legacyFirestoreId ?? id,
  })

  let likesN = 0
  let savesN = 0
  let commentsN = 0
  let seenN = 0
  if (aliases.length) {
    const [l] = await db
      .select({ c: count() })
      .from(articleLikes)
      .where(inArray(articleLikes.articleId, aliases))
    const [s] = await db
      .select({ c: count() })
      .from(savedArticles)
      .where(inArray(savedArticles.articleId, aliases))
    const [c] = await db
      .select({ c: count() })
      .from(articleComments)
      .where(inArray(articleComments.articleId, aliases))
    const [se] = await db
      .select({ c: count() })
      .from(userContentImpressions)
      .where(inArray(userContentImpressions.articleId, aliases))
    likesN = Number(l?.c ?? 0)
    savesN = Number(s?.c ?? 0)
    commentsN = Number(c?.c ?? 0)
    seenN = Number(se?.c ?? 0)
  }

  return {
    firestoreId: id,
    currentReadClass: eligibility.currentReadClass,
    migrationClass: eligibility.migrationClass,
    targetPgId: eligibility.targetPgId,
    targetSlug: eligibility.targetSlug,
    publicationAuthority: eligibility.proposedAuthority,
    publisherMapping,
    clusterMapping,
    slugImpact,
    socialIdentityImpact: {
      likes: likesN,
      saves: savesN,
      comments: commentsN,
      strategy: 'prefer_fs_id_as_pg_id_alias',
    },
    seenIdentityImpact: {
      impressionRows: seenN,
      strategy: 'expandArticleIdentities_alias',
    },
    seoImpact: {
      indexableToday:
        eligibility.currentReadClass === 'LEGACY_ALLOWED' ||
        eligibility.currentReadClass === 'CANONICAL' ||
        eligibility.currentReadClass === 'SYSTEM_ALERT',
      preserveSlug: slugImpact.status === 'available' || slugImpact.status === 'same_mirror',
    },
    bodyEligibility: eligibility.body,
    human: eligibility.human,
    blockers: Array.from(new Set(blockers)),
    executable: false,
    writeCapability: 'NONE',
  }
}

function emptyBlockedPlan(id: string, blockers: string[]): MigrationPlanResult {
  return {
    firestoreId: id,
    currentReadClass: 'NOT_PUBLIC',
    migrationClass: 'INSUFFICIENT_EVIDENCE',
    targetPgId: resolveMigrationTargetPgId(id || 'unknown', null),
    targetSlug: null,
    publicationAuthority: null,
    publisherMapping: {
      status: 'missing',
      publisherId: null,
      publisherSlug: null,
      sourceId: null,
    },
    clusterMapping: {
      status: 'missing',
      clusterId: null,
      publishedNewsId: null,
    },
    slugImpact: { status: 'missing', collidingPgId: null },
    socialIdentityImpact: {
      likes: 0,
      saves: 0,
      comments: 0,
      strategy: 'prefer_fs_id_as_pg_id_alias',
    },
    seenIdentityImpact: {
      impressionRows: 0,
      strategy: 'expandArticleIdentities_alias',
    },
    seoImpact: { indexableToday: false, preserveSlug: false },
    bodyEligibility: {
      bodyExists: false,
      bodyChars: 0,
      meetsMinimum: false,
      sourceUrlExists: false,
      rightsStatus: null,
      rightsBasis: null,
      similarityEvaluated: false,
      blocker: 'body_missing',
    },
    human: {
      proven: false,
      authority: null,
      approvedBy: null,
      publishedBy: null,
      reason: 'unavailable',
    },
    blockers,
    executable: false,
    writeCapability: 'NONE',
  }
}
