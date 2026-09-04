/**
 * P18.4A — READ-ONLY Legacy Firestore migration dry-run audit.
 * NO writes. Disposable; do not deploy.
 *
 * Usage: npx tsx scripts/_p18_4a_legacy_dry_run.mts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  classifyPublicRead,
  canAppearInSmartFeed,
  canBeIndexable,
  canResolveArticleDetail,
  publicReadMetaFromFirestoreDoc,
  type PublicReadClass,
} from '../src/services/editorial/publicReadPolicy'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
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
}

loadEnvLocal()

type FsClass =
  | 'CANONICAL_MIRROR'
  | 'SYSTEM_ALERT'
  | 'LEGACY_ALLOWED'
  | 'LEGACY_QUARANTINED'
  | 'NOT_PUBLIC'
  | 'UNKNOWN'

type RelClass = 'FS_ONLY' | 'FS_WITH_PG_MIRROR' | 'PG_CANONICAL_WITH_FS_LEGACY_COPY' | 'AMBIGUOUS'

type ProvenanceBucket = 'A' | 'B' | 'C' | 'D' | 'E' | 'UNKNOWN'

function initFs() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!.trim()
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!.trim()
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n').trim()
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId })
  }
  return getFirestore()
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function mapFsPublicClass(
  readClass: PublicReadClass,
  hasPgMirror: boolean
): FsClass {
  if (hasPgMirror) return 'CANONICAL_MIRROR'
  if (readClass === 'CANONICAL') return 'CANONICAL_MIRROR' // HUMAN_EDITOR on FS without PG — still treat as mirror-class modern
  if (readClass === 'SYSTEM_ALERT') return 'SYSTEM_ALERT'
  if (readClass === 'LEGACY_ALLOWED') return 'LEGACY_ALLOWED'
  if (readClass === 'LEGACY_QUARANTINED') return 'LEGACY_QUARANTINED'
  if (readClass === 'NOT_PUBLIC') return 'NOT_PUBLIC'
  return 'UNKNOWN'
}

function provenanceBucket(opts: {
  fsClass: FsClass
  hasPgMirror: boolean
  approvedBy: string | null
  publishedBy: string | null
  authorId: string | null
  sourceUrl: string | null
  editorialNewsId: string | null
  clusterId: string | null
  readClass: PublicReadClass
}): ProvenanceBucket {
  if (opts.fsClass === 'CANONICAL_MIRROR' || opts.hasPgMirror) return 'A'
  if (opts.fsClass === 'LEGACY_QUARANTINED' || opts.readClass === 'LEGACY_QUARANTINED') return 'E'
  if (opts.fsClass === 'NOT_PUBLIC') return 'E'
  if (opts.fsClass === 'SYSTEM_ALERT') return 'B'
  const human =
    Boolean(opts.approvedBy) ||
    Boolean(opts.publishedBy) ||
    (Boolean(opts.authorId) && !opts.authorId!.startsWith('bot') && !opts.authorId!.includes('automation'))
  if (opts.fsClass === 'LEGACY_ALLOWED' && human) return 'B'
  if (opts.fsClass === 'LEGACY_ALLOWED' && (opts.sourceUrl || opts.editorialNewsId || opts.clusterId)) return 'C'
  if (opts.fsClass === 'LEGACY_ALLOWED') return 'D'
  return 'UNKNOWN'
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const sql = neon(url)
  const db = initFs()

  console.log('[p18.4a] PG inventory…')
  const pgStatus = await sql`
    SELECT status::text AS status, count(*)::int AS c
    FROM news GROUP BY 1 ORDER BY 1`
  const pgLegacy = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE legacy_firestore_id IS NOT NULL)::int AS with_legacy_fs,
      count(*) FILTER (WHERE published_at IS NOT NULL)::int AS with_published_at,
      count(*) FILTER (WHERE author_id IS NOT NULL)::int AS with_author,
      count(*) FILTER (WHERE status = 'published')::int AS published,
      count(*) FILTER (WHERE status = 'published' AND legacy_firestore_id IS NOT NULL)::int AS published_with_legacy
    FROM news`
  const pgCluster = await sql`
    SELECT
      count(*)::int AS clusters,
      count(*) FILTER (WHERE published_news_id IS NOT NULL)::int AS with_published_news,
      count(DISTINCT published_news_id) FILTER (WHERE published_news_id IS NOT NULL)::int AS distinct_published_news
    FROM news_clusters`
  const rawCounts = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE editorial_status::text = 'PUBLISHED')::int AS editorial_published,
      count(*) FILTER (WHERE cluster_id IS NOT NULL)::int AS with_cluster
    FROM raw_articles`
  // Note: publicationAuthority / approvedBy / approvedAt / publishedBy are NOT PG news columns.
  const pgAuthorityNote = {
    publicationAuthority: 'N/A — not a PG news column (Firestore/Post meta only)',
    approvedBy: 'N/A — not a PG news column',
    approvedAt: 'N/A — not a PG news column',
    publishedBy: 'N/A — not a PG news column',
  }

  const pgLegacyIds = await sql`
    SELECT id, legacy_firestore_id AS fs_id, slug, status::text AS status
    FROM news
    WHERE legacy_firestore_id IS NOT NULL`
  const legacyMap = new Map<string, { id: string; slug: string; status: string }>()
  for (const r of pgLegacyIds) {
    if (r.fs_id) legacyMap.set(String(r.fs_id), { id: String(r.id), slug: String(r.slug), status: String(r.status) })
  }
  const pgIdSet = new Set(pgLegacyIds.map((r) => String(r.id)))

  console.log('[p18.4a] Social / seen FS-only identity probes…')
  const socialFsOnly = await sql`
    SELECT
      (SELECT count(*)::int FROM article_likes al
        WHERE NOT EXISTS (SELECT 1 FROM news n WHERE n.id = al.article_id)
          AND NOT EXISTS (SELECT 1 FROM news n WHERE n.legacy_firestore_id = al.article_id)) AS likes_fs_only,
      (SELECT count(*)::int FROM saved_articles sa
        WHERE NOT EXISTS (SELECT 1 FROM news n WHERE n.id = sa.article_id)
          AND NOT EXISTS (SELECT 1 FROM news n WHERE n.legacy_firestore_id = sa.article_id)) AS saves_fs_only,
      (SELECT count(*)::int FROM article_comments ac
        WHERE NOT EXISTS (SELECT 1 FROM news n WHERE n.id = ac.article_id)
          AND NOT EXISTS (SELECT 1 FROM news n WHERE n.legacy_firestore_id = ac.article_id)) AS comments_fs_only,
      (SELECT count(*)::int FROM user_content_impressions uci
        WHERE NOT EXISTS (SELECT 1 FROM news n WHERE n.id = uci.article_id)
          AND NOT EXISTS (SELECT 1 FROM news n WHERE n.legacy_firestore_id = uci.article_id)) AS impressions_fs_only,
      (SELECT count(DISTINCT article_id)::int FROM user_content_impressions uci
        WHERE NOT EXISTS (SELECT 1 FROM news n WHERE n.id = uci.article_id)
          AND NOT EXISTS (SELECT 1 FROM news n WHERE n.legacy_firestore_id = uci.article_id)) AS impressions_fs_only_distinct
  `

  const publishers = await sql`
    SELECT id, slug, name, display_name, status::text AS state
    FROM publishers
    WHERE lower(slug) IN ('sozcu','evrensel','cumhuriyet','hurriyet','guardian','trt','le-monde','dw','bbc-world','bbc')
       OR lower(name) LIKE '%sözcü%' OR lower(name) LIKE '%sozcu%'
       OR lower(name) LIKE '%evrensel%'
       OR lower(name) LIKE '%cumhuriyet%'
       OR lower(name) LIKE '%hürriyet%' OR lower(name) LIKE '%hurriyet%'
       OR lower(name) LIKE '%guardian%'
       OR lower(name) LIKE '%trt%'
       OR lower(name) LIKE '%le monde%'
       OR lower(name) LIKE '%deutsche%'
       OR lower(slug) LIKE '%bbc%'
    ORDER BY slug`

  const publisherSources = await sql`
    SELECT ps.publisher_id, ps.source_id, p.slug, p.name
    FROM publisher_sources ps
    JOIN publishers p ON p.id = ps.publisher_id
    WHERE p.id = ANY(${publishers.map((p) => p.id)})`

  // PG published counts by publisher via cluster → source → publisher_sources
  const pgByPublisher = await sql`
    SELECT p.id AS publisher_id, p.slug, count(DISTINCT n.id)::int AS pg_published
    FROM publishers p
    JOIN publisher_sources ps ON ps.publisher_id = p.id
    JOIN news_clusters nc ON nc.primary_source_id = ps.source_id
    JOIN news n ON n.id = nc.published_news_id
    WHERE n.status = 'published' AND p.id = ANY(${publishers.map((x) => x.id)})
    GROUP BY p.id, p.slug`

  console.log('[p18.4a] Firestore news full enumeration (paginated)…')
  const PAGE = 500
  let last: import('firebase-admin/firestore').QueryDocumentSnapshot | undefined
  let scanned = 0
  let truncated = false
  const MAX_DOCS = Number(process.env.P18_4A_MAX_DOCS || 60000)

  const classCounts: Record<FsClass, number> = {
    CANONICAL_MIRROR: 0,
    SYSTEM_ALERT: 0,
    LEGACY_ALLOWED: 0,
    LEGACY_QUARANTINED: 0,
    NOT_PUBLIC: 0,
    UNKNOWN: 0,
  }
  const readClassCounts: Record<PublicReadClass, number> = {
    CANONICAL: 0,
    SYSTEM_ALERT: 0,
    LEGACY_ALLOWED: 0,
    LEGACY_QUARANTINED: 0,
    NOT_PUBLIC: 0,
  }
  const relCounts: Record<RelClass, number> = {
    FS_ONLY: 0,
    FS_WITH_PG_MIRROR: 0,
    PG_CANONICAL_WITH_FS_LEGACY_COPY: 0,
    AMBIGUOUS: 0,
  }
  const provenance: Record<ProvenanceBucket, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    UNKNOWN: 0,
  }

  let feedEligible = 0
  let indexable = 0
  let detailResolvable = 0
  let legacyAllowedFsOnly = 0
  let legacyAllowedWithMirror = 0
  let publishedStatus = 0
  let withSlug = 0
  let withSourceUrl = 0
  let withClusterId = 0
  let withEditorialNewsId = 0
  let withApprovedBy = 0
  let withPublishedBy = 0
  let withAuthorId = 0
  let humanEditorAuth = 0
  let systemAlertAuth = 0
  let legacyAuth = 0
  let noAuth = 0

  const clusterGroups = new Map<string, number>()
  const editorialGroups = new Map<string, number>()
  const publisherFsLegacyOnly = new Map<string, number>()
  const publisherFsMirror = new Map<string, number>()
  const publisherFsQuarantine = new Map<string, number>()
  const publisherFsUnknown = new Map<string, number>()

  const bodySamples: Array<{
    id: string
    fsClass: FsClass
    titleLen: number
    contentLen: number
    hasSourceUrl: boolean
    hasApprovedBy: boolean
    contentStartsLikeHtml: boolean
  }> = []

  const pilotCandidates: Array<{
    id: string
    slug: string | null
    fsClass: FsClass
    bucket: ProvenanceBucket
    publisherHint: string | null
  }> = []

  // Track PG mirrors seen from FS side
  const fsIdsSeenWithPg = new Set<string>()

  for (;;) {
    let q = db.collection('news').orderBy('__name__').limit(PAGE)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break

    for (const doc of snap.docs) {
      scanned += 1
      const data = doc.data() as Record<string, unknown>
      const meta = publicReadMetaFromFirestoreDoc(doc.id, data)
      const readClass = classifyPublicRead(meta)
      readClassCounts[readClass] += 1

      const hasPgMirror = legacyMap.has(doc.id) || pgIdSet.has(doc.id)
      if (hasPgMirror) fsIdsSeenWithPg.add(doc.id)

      const fsClass = mapFsPublicClass(readClass, hasPgMirror)
      classCounts[fsClass] += 1

      let rel: RelClass
      if (hasPgMirror) {
        // FS doc id == PG.legacy_firestore_id (or equals PG.id) → mirror pair
        rel = 'FS_WITH_PG_MIRROR'
        // Also counts as PG having FS legacy copy
        relCounts.PG_CANONICAL_WITH_FS_LEGACY_COPY += 0 // tallied via PG separately
      } else if (!meta.status) {
        rel = 'AMBIGUOUS'
      } else {
        rel = 'FS_ONLY'
      }
      relCounts[rel] += 1

      const approvedBy = asStr(data.approvedBy)
      const publishedBy = asStr(data.publishedBy)
      const authorId = asStr(data.authorId)
      const sourceUrl = asStr(data.sourceUrl) || asStr(data.source_url)
      const editorialNewsId = asStr(data.editorialNewsId) || asStr(data.editorial_news_id)
      const clusterId = asStr(data.clusterId) || asStr(data.cluster_id)
      const ingestionSourceId = asStr(data.ingestionSourceId) || asStr(data.sourceId)
      const publisherId = asStr(data.publisherId)
      const publisherHint = publisherId || ingestionSourceId || asStr(data.source) || null

      const bucket = provenanceBucket({
        fsClass,
        hasPgMirror,
        approvedBy,
        publishedBy,
        authorId,
        sourceUrl,
        editorialNewsId,
        clusterId,
        readClass,
      })
      provenance[bucket] += 1

      if (isPublishedLike(meta.status)) publishedStatus += 1
      if (meta.slug) withSlug += 1
      if (sourceUrl) withSourceUrl += 1
      if (clusterId) {
        withClusterId += 1
        clusterGroups.set(clusterId, (clusterGroups.get(clusterId) || 0) + 1)
      }
      if (editorialNewsId) {
        withEditorialNewsId += 1
        editorialGroups.set(editorialNewsId, (editorialGroups.get(editorialNewsId) || 0) + 1)
      }
      if (approvedBy) withApprovedBy += 1
      if (publishedBy) withPublishedBy += 1
      if (authorId) withAuthorId += 1

      const auth = (meta.publicationAuthority || '').toUpperCase()
      if (auth === 'HUMAN_EDITOR') humanEditorAuth += 1
      else if (auth === 'SYSTEM_ALERT') systemAlertAuth += 1
      else if (auth === 'LEGACY') legacyAuth += 1
      else noAuth += 1

      if (canAppearInSmartFeed(readClass)) feedEligible += 1
      if (canBeIndexable(readClass)) indexable += 1
      if (canResolveArticleDetail(readClass)) detailResolvable += 1

      if (fsClass === 'LEGACY_ALLOWED' && !hasPgMirror) {
        legacyAllowedFsOnly += 1
        bump(publisherFsLegacyOnly, publisherHint || '_unknown')
      }
      if (fsClass === 'CANONICAL_MIRROR') {
        legacyAllowedWithMirror += 0
        bump(publisherFsMirror, publisherHint || '_unknown')
      }
      if (hasPgMirror && fsClass === 'CANONICAL_MIRROR') {
        // counted in mirror
      }
      if (fsClass === 'LEGACY_QUARANTINED') bump(publisherFsQuarantine, publisherHint || '_unknown')
      if (fsClass === 'UNKNOWN') bump(publisherFsUnknown, publisherHint || '_unknown')

      // Body samples (bounded)
      if (
        bodySamples.length < 12 &&
        (fsClass === 'LEGACY_ALLOWED' || fsClass === 'LEGACY_QUARANTINED') &&
        !hasPgMirror
      ) {
        const content = asStr(data.content) || asStr(data.htmlContent) || asStr(data.html_content) || ''
        const title = asStr(data.title) || ''
        bodySamples.push({
          id: doc.id,
          fsClass,
          titleLen: title.length,
          contentLen: content.length,
          hasSourceUrl: Boolean(sourceUrl),
          hasApprovedBy: Boolean(approvedBy),
          contentStartsLikeHtml: content.trimStart().startsWith('<'),
        })
      }

      // Pilot candidates: LEGACY_ALLOWED FS-only with human or source evidence, distinct publishers
      if (
        pilotCandidates.length < 8 &&
        fsClass === 'LEGACY_ALLOWED' &&
        !hasPgMirror &&
        meta.slug &&
        (bucket === 'B' || bucket === 'C')
      ) {
        if (!pilotCandidates.some((p) => p.publisherHint === publisherHint)) {
          pilotCandidates.push({
            id: doc.id,
            slug: meta.slug,
            fsClass,
            bucket,
            publisherHint,
          })
        }
      }
    }

    last = snap.docs[snap.docs.length - 1]
    if (scanned % 2000 === 0) console.log(`[p18.4a] scanned=${scanned}`)
    if (scanned >= MAX_DOCS) {
      truncated = true
      break
    }
    if (snap.size < PAGE) break
  }

  // PG side: how many published PG rows have legacy FS id (copies)
  const pgWithFsCopy = Number(pgLegacy[0]?.published_with_legacy || 0)
  relCounts.PG_CANONICAL_WITH_FS_LEGACY_COPY = pgWithFsCopy

  const duplicateClusters = [...clusterGroups.entries()].filter(([, n]) => n > 1)
  const duplicateEditorial = [...editorialGroups.entries()].filter(([, n]) => n > 1)

  // Top publisher dependency from FS maps — join by source ids when possible
  const sourceToPublisher = new Map<string, { id: string; slug: string; name: string }>()
  for (const row of publisherSources) {
    sourceToPublisher.set(String(row.source_id), {
      id: String(row.publisher_id),
      slug: String(row.slug),
      name: String(row.name),
    })
  }

  function rollPublisher(map: Map<string, number>, pubId: string) {
    let n = 0
    for (const [hint, c] of map) {
      if (hint === pubId) n += c
      else {
        const via = sourceToPublisher.get(hint)
        if (via?.id === pubId) n += c
      }
    }
    // also try matching slug-like hints
    const pub = publishers.find((p) => p.id === pubId)
    if (pub) {
      for (const [hint, c] of map) {
        const h = hint.toLowerCase()
        if (h.includes(String(pub.slug).toLowerCase()) || h.includes(String(pub.name).toLowerCase().slice(0, 5))) {
          // avoid double count if already exact
          if (hint !== pubId && !sourceToPublisher.has(hint)) n += c
        }
      }
    }
    return n
  }

  const publisherTable = publishers.map((p) => {
    const pgRow = pgByPublisher.find((x) => x.publisher_id === p.id)
    const fsOnly = rollPublisher(publisherFsLegacyOnly, String(p.id))
    const mirror = rollPublisher(publisherFsMirror, String(p.id))
    const quar = rollPublisher(publisherFsQuarantine, String(p.id))
    const unk = rollPublisher(publisherFsUnknown, String(p.id))
    const pgPub = Number(pgRow?.pg_published || 0)
    const denom = pgPub + fsOnly
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      state: p.state,
      sourceIds: publisherSources.filter((s) => s.publisher_id === p.id).map((s) => s.source_id),
      pgPublished: pgPub,
      fsCanonicalMirrorApprox: mirror,
      legacyAllowedFsOnlyApprox: fsOnly,
      quarantinedApprox: quar,
      unknownApprox: unk,
      profileDependencyPctFsOnly: denom > 0 ? Math.round((1000 * fsOnly) / denom) / 10 : null,
    }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    coverage: {
      firestoreDocsScanned: scanned,
      truncated,
      maxDocsCap: MAX_DOCS,
      confidence: truncated ? 'BOUNDED_PARTIAL' : 'FULL_ENUMERATION',
    },
    pg: {
      byStatus: pgStatus,
      summary: pgLegacy[0],
      clusters: pgCluster[0],
      authorityColumns: pgAuthorityNote,
      publishedWithLegacyFirestoreId: pgWithFsCopy,
    },
    rawArticles: rawCounts[0],
    firestore: {
      classCounts,
      readClassCounts,
      percentages: Object.fromEntries(
        Object.entries(classCounts).map(([k, v]) => [k, scanned ? Math.round((10000 * v) / scanned) / 100 : 0])
      ),
      publishedStatus,
      withSlug,
      withSourceUrl,
      withClusterId,
      withEditorialNewsId,
      withApprovedBy,
      withPublishedBy,
      withAuthorId,
      authorityField: { humanEditorAuth, systemAlertAuth, legacyAuth, noAuth },
      feedEligible,
      indexable,
      detailResolvable,
      legacyAllowedFsOnly,
      legacyAllowedWithMirrorNote: 'CANONICAL_MIRROR includes FS docs with PG legacyFirestoreId link',
    },
    relationships: {
      ...relCounts,
      uniqueFsPublicDocsApprox: publishedStatus,
      uniqueClustersOnFs: clusterGroups.size,
      duplicateClusterGroups: duplicateClusters.length,
      duplicateClusterDocs: duplicateClusters.reduce((a, [, n]) => a + n, 0),
      uniqueEditorialNewsIds: editorialGroups.size,
      duplicateEditorialGroups: duplicateEditorial.length,
      fsIdsWithPgMirror: fsIdsSeenWithPg.size,
      pgLegacyMapSize: legacyMap.size,
    },
    provenance,
    socialSeen: socialFsOnly[0],
    publishers: publisherTable,
    bodySamples,
    pilotCandidates,
    topFsOnlyPublisherHints: [...publisherFsLegacyOnly.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25),
  }

  const outPath = resolve(process.cwd(), 'scripts/_p18_4a_legacy_dry_run_out.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log('[p18.4a] wrote', outPath)
  console.log(JSON.stringify({
    scanned,
    truncated,
    classCounts,
    legacyAllowedFsOnly,
    feedEligible,
    socialSeen: socialFsOnly[0],
    pgPublished: pgLegacy[0]?.published,
    rawTotal: rawCounts[0]?.total,
  }, null, 2))
}

function isPublishedLike(status: string | null | undefined) {
  const s = (status || '').toLowerCase()
  return s === 'published' || s === 'active'
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
