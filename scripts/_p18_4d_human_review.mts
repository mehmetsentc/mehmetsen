/**
 * P18.4D — READ-ONLY human editorial + copyright review of 3 pilot drafts.
 * No writes. No AI. No publish.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()
{
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(stubDir)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
  }
}

const IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function fingerprint(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function asDateIso(v: unknown): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof v === 'object' && v && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString()
  }
  return null
}

function qualityFlags(text: string, title: string, summary: string | null): string[] {
  const flags: string[] = []
  const lower = text.toLowerCase()
  if (text.length < 400) flags.push('body_short')
  if (!text) flags.push('body_empty')
  if (/(cookie|kişisel verilerin|tüm hakları saklıdır|copyright ©|reklam|abone ol|whatsapp'ta paylaş)/i.test(text)) {
    flags.push('possible_boilerplate_or_nav')
  }
  if (/(<script|<iframe|onclick=)/i.test(text)) flags.push('suspicious_html')
  // duplicate paragraphs
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 80)
  const seen = new Set<string>()
  for (const p of paras) {
    const k = p.slice(0, 120).toLowerCase()
    if (seen.has(k)) flags.push('duplicate_paragraph')
    seen.add(k)
  }
  const titleToks = title.toLowerCase().split(/\s+/).filter((t) => t.length > 3)
  const hit = titleToks.filter((t) => lower.includes(t)).length
  if (titleToks.length >= 3 && hit / titleToks.length < 0.3) flags.push('title_body_weak_overlap')
  if (summary) {
    const sToks = summary.toLowerCase().split(/\s+/).filter((t) => t.length > 3)
    const sHit = sToks.filter((t) => lower.includes(t)).length
    if (sToks.length >= 5 && sHit / sToks.length < 0.25) flags.push('summary_body_weak_overlap')
  }
  return Array.from(new Set(flags))
}

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const { initializeApp, cert, getApps } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const {
    checkTextSimilarity,
    validatePublicationRights,
  } = await import('../src/services/editorial/editorialSimilarityGate')
  const { evaluateProvenHumanActor, TRUSTED_EDITORIAL_ROLES, migrationEvidenceFromFirestoreDoc } =
    await import('../src/services/editorial/canonicalMigrationEligibility')

  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!.trim(),
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!.trim(),
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n').trim(),
      }),
    })
  }
  const fs = getFirestore()

  const [counts] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status='draft')::int AS draft,
           count(*) FILTER (WHERE status='published')::int AS published
    FROM news`
  const pilots = await sql`
    SELECT id, slug, title, summary, description, content, html_content AS html,
           status::text AS status, source, source_url,
           publication_authority::text AS authority,
           approved_by IS NOT NULL AS has_approved_by,
           published_by IS NOT NULL AS has_published_by,
           approved_at IS NOT NULL AS has_approved_at,
           approved_by AS approved_by_uid,
           published_by AS published_by_uid,
           legacy_firestore_id AS legacy,
           migration_batch_id AS batch,
           migrated_at, published_at, created_at, updated_at,
           thumbnail_url, cover_image_url, author_id IS NOT NULL AS has_author,
           author_display_name
    FROM news WHERE id = ANY(${[...IDS]})
    ORDER BY id`

  const pilotPublished = pilots.filter((p) => p.status === 'published').length
  if (pilotPublished > 0) {
    console.log(JSON.stringify({ STOP: true, reason: 'pilot_already_published', pilotPublished }, null, 2))
    process.exit(2)
  }

  const trustedRows = await sql`
    SELECT firebase_uid AS uid FROM users
    WHERE role::text = ANY(${[...TRUSTED_EDITORIAL_ROLES]})`
  const trusted = new Set(trustedRows.map((r) => String(r.uid)))

  const reviews = []
  for (const pg of pilots) {
    const id = String(pg.id)
    const snap = await fs.collection('news').doc(id).get()
    const fsData = snap.exists ? (snap.data() as Record<string, unknown>) : null
    const evidence = fsData ? migrationEvidenceFromFirestoreDoc(id, fsData) : null
    const human = evidence ? evaluateProvenHumanActor(evidence, trusted) : null

    const pgBody = stripHtml(String(pg.content || pg.html || ''))
    const fsBody = stripHtml(
      String(fsData?.content || fsData?.htmlContent || fsData?.html_content || '')
    )
    const pgTitle = String(pg.title || '')
    const fsTitle = asStr(fsData?.title) || ''
    const summary = asStr(pg.summary) || asStr(pg.description)
    const sourceUrl = asStr(pg.source_url) || asStr(fsData?.sourceUrl)

    // Publisher exact mapping
    const pub = await sql`
      SELECT p.id, p.slug, p.name, p.status::text AS status,
             p.verification_status::text AS verification_status
      FROM publishers p WHERE p.slug = ${String(pg.source)}
      LIMIT 1`
    const srcLinks = await sql`
      SELECT ps.source_id, ps.publisher_id, p.slug
      FROM publisher_sources ps
      INNER JOIN publishers p ON p.id = ps.publisher_id
      WHERE p.slug = ${String(pg.source)}
      LIMIT 5`

    // Cluster
    const clusters = await sql`
      SELECT id, published_news_id FROM news_clusters
      WHERE published_news_id = ${id} OR id = ${asStr(fsData?.clusterId) || '__none__'}
      LIMIT 5`

    // Social / seen
    const [social] = await sql`
      SELECT
        (SELECT count(*)::int FROM article_likes WHERE article_id = ${id}) AS likes,
        (SELECT count(*)::int FROM saved_articles WHERE article_id = ${id}) AS saves,
        (SELECT count(*)::int FROM article_comments WHERE article_id = ${id}) AS comments,
        (SELECT count(*)::int FROM user_content_impressions WHERE article_id = ${id}) AS seen`

    // Deterministic similarity vs source page (fetch text lightly if URL exists)
    let sourceText: string | null = null
    let sourceFetch: { ok: boolean; status?: number; note?: string } = { ok: false }
    if (sourceUrl) {
      try {
        const ctrl = AbortSignal.timeout(12000)
        const res = await fetch(sourceUrl, {
          signal: ctrl,
          headers: { 'User-Agent': 'NaHaberP184DReview/1.0 (read-only editorial review)' },
          redirect: 'follow',
        })
        sourceFetch = { ok: res.ok, status: res.status }
        if (res.ok) {
          const html = await res.text()
          // crude extract: strip scripts/styles/tags
          sourceText = stripHtml(
            html
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          ).slice(0, 50000)
        }
      } catch (e) {
        sourceFetch = { ok: false, note: e instanceof Error ? e.message.slice(0, 120) : 'fetch_failed' }
      }
    }

    const simRaw =
      sourceText && pgBody
        ? checkTextSimilarity(pgBody, sourceText)
        : checkTextSimilarity(pgBody, null)
    const rights = validatePublicationRights({
      canonicalText: pgBody,
      rawSourceText: sourceText,
      rightsStatus: asStr(fsData?.rightsStatus),
      rightsBasis: asStr(fsData?.rightsBasis),
    })
    const sim = {
      evaluated: Boolean(sourceText && pgBody),
      limitation: !sourceText ? 'SOURCE_BODY_UNAVAILABLE' : !pgBody ? 'CANDIDATE_BODY_EMPTY' : null,
      overlapCategory: simRaw.overlapCategory,
      similarity: simRaw.similarity,
      flaggedForReview: simRaw.flaggedForReview,
      rightsAllowed: rights.allowed,
      rightsReason: rights.reason,
    }

    // PG vs FS fidelity
    const fidelity = {
      titleExact: pgTitle === fsTitle,
      bodyExact: pgBody === fsBody,
      bodyLenPg: pgBody.length,
      bodyLenFs: fsBody.length,
      bodyLenDelta: pgBody.length - fsBody.length,
      contentFpPg: fingerprint(pgBody),
      contentFpFs: fingerprint(fsBody),
      slugExact: String(pg.slug) === asStr(fsData?.slug),
      sourceUrlExact: asStr(pg.source_url) === asStr(fsData?.sourceUrl),
      statusPg: pg.status,
      statusFs: asStr(fsData?.status),
    }

    const qFlags = qualityFlags(pgBody, pgTitle, summary)

    // Transformation class (conservative; no invented certainty)
    let transformClass: 'A' | 'B' | 'C' | 'D' | 'E' = 'E'
    let transformNote = 'insufficient_evidence'
    if (!sourceText) {
      transformClass = 'E'
      transformNote = 'source_body_unavailable_or_fetch_failed'
    } else if (!sim.evaluated) {
      transformClass = 'E'
      transformNote = String(sim.limitation || 'not_evaluated')
    } else if (simRaw.overlapCategory === 'HIGH_OVERLAP') {
      transformClass = rights.allowed ? 'C' : 'D'
      transformNote = `${simRaw.overlapCategory}; rights_allowed=${rights.allowed}`
    } else if (simRaw.overlapCategory === 'MEDIUM_OVERLAP') {
      transformClass = 'B'
      transformNote = simRaw.overlapCategory
    } else {
      // LOW_OVERLAP against full page HTML can be false-negative (noise) OR true rewrite.
      // Do not claim "clearly independently rewritten" without stronger evidence.
      transformClass = 'B'
      transformNote = `${simRaw.overlapCategory}; needs_human_judgment_page_noise_possible`
    }

    // Actor
    const actorStatus =
      human?.proven && human.actorInTrustedEditorialMap
        ? 'VERIFIED'
        : !human || (!pg.has_approved_by && !pg.has_published_by)
          ? 'MISSING'
          : 'NOT VERIFIED'

    // HTTP public continuity
    const slug = String(pg.slug)
    const httpRes = await fetch(`https://www.nahaber.com/haber/${slug}`, { redirect: 'manual' })
    const httpStatus = httpRes.status

    reviews.push({
      id,
      headline: pgTitle,
      slug,
      publisherSlug: pg.source,
      publisherRow: pub[0]
        ? {
            exists: true,
            slug: pub[0].slug,
            name: pub[0].name,
            status: pub[0].status,
            verificationStatus: pub[0].verification_status,
          }
        : { exists: false },
      sourceLinksCount: srcLinks.length,
      sourceUrlPresent: Boolean(sourceUrl),
      sourceUrlHost: sourceUrl ? (() => { try { return new URL(sourceUrl).hostname } catch { return null } })() : null,
      sourceFetch,
      actorStatus,
      actorProven: Boolean(human?.proven),
      authority: pg.authority,
      hasApprovedAt: Boolean(pg.has_approved_at),
      bodyLength: pgBody.length,
      qualityFlags: qFlags,
      fidelity,
      similarity: {
        evaluated: sim.evaluated,
        limitation: sim.limitation,
        overlapCategory: sim.overlapCategory,
        scoreBucket:
          typeof sim.similarity === 'number'
            ? sim.similarity >= 0.7
              ? 'HIGH'
              : sim.similarity >= 0.3
                ? 'MEDIUM'
                : 'LOW'
            : null,
        flaggedForReview: sim.flaggedForReview,
        rightsAllowed: sim.rightsAllowed,
        rightsReason: sim.rightsReason,
      },
      rightsStatus: asStr(fsData?.rightsStatus),
      rightsBasis: asStr(fsData?.rightsBasis),
      transformClass,
      transformNote,
      social,
      clusters: clusters.map((c) => ({ id: c.id, publishedNewsId: c.published_news_id })),
      httpStatus,
      batch: pg.batch,
      image: {
        hasThumb: Boolean(pg.thumbnail_url),
        hasCover: Boolean(pg.cover_image_url),
      },
      bodyPreview: pgBody.slice(0, 280),
      fsBodyPreview: fsBody.slice(0, 280),
    })
  }

  // Sitemap leakage check
  const sitemap = await (await fetch('https://www.nahaber.com/news-sitemap.xml')).text()
  const sitemapHits = IDS.filter((id) => sitemap.includes(id)).length

  // Social totals unchanged probe
  const [socialTotals] = await sql`SELECT
    (SELECT count(*)::int FROM article_likes) likes,
    (SELECT count(*)::int FROM saved_articles) saves,
    (SELECT count(*)::int FROM article_comments) comments,
    (SELECT count(*)::int FROM user_content_impressions) seen`

  const out = {
    authority: {
      local: '1f8962b',
      production: 'see health',
    },
    counts,
    pilotCount: pilots.length,
    pilotPublished,
    socialTotals,
    sitemapHits,
    reviews,
  }
  writeFileSync(resolve(process.cwd(), 'scripts/_p18_4d_review_out.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
