/**
 * Phase P16 — Editorial Supply Inventory Seeder
 *
 * Usage: npx tsx scripts/_phase_p16_publish_inventory.mts
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { neon } from '@neondatabase/serverless'

{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  const stubFile = resolve(stubDir, 'index.js')
  if (!existsSync(stubFile)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(stubFile, 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
  void require
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
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

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
}

const db = getFirestore()
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

async function run() {
  console.log('=== Phase P16: Editorial Supply Execution ===')

  // 1. Exclude Test Article XUEhKFwUCqoOgytboSIq
  console.log('1. Archiving internal test article XUEhKFwUCqoOgytboSIq...')
  await sql`
    UPDATE news
    SET status = 'archived', updated_at = now()
    WHERE id = 'XUEhKFwUCqoOgytboSIq'
  `
  await db.collection('news').doc('XUEhKFwUCqoOgytboSIq').set(
    { status: 'archived', visibility: 'private', seoNoindex: true, updatedAt: Date.now() },
    { merge: true }
  )
  console.log('Test article XUEhKFwUCqoOgytboSIq marked as archived.')

  // 2. Query top event clusters for deterministic publishing
  console.log('2. Querying top event clusters for deterministic publishing...')
  const candidateClusters = await sql`
    SELECT
      c.id, c.canonical_title, c.category_hint, c.city, c.district, c.country_code,
      c.article_count, c.unique_source_count, c.importance_score, c.primary_image_url,
      c.latest_article_at, c.first_seen_at
    FROM news_clusters c
    WHERE c.published_news_id IS NULL
      AND c.canonical_title IS NOT NULL
      AND length(c.canonical_title) >= 15
      AND c.primary_image_url IS NOT NULL
      AND c.primary_image_url NOT LIKE '%pixel%'
      AND c.primary_image_url NOT LIKE '%banner%'
    ORDER BY c.importance_score DESC, c.latest_article_at DESC NULLS LAST
    LIMIT 250
  `
  console.log(`Found ${candidateClusters.length} candidate clusters.`)

  const { validateImageCandidate } = await import('../src/services/editorial/imageGate')
  const { validateEditorialCandidate } = await import('../src/services/editorial/editorialQualityGate')
  const { selectPrimarySource } = await import('../src/services/editorial/primarySourceSelector')

  const publishedItems: any[] = []
  const categoryCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}

  for (const cl of candidateClusters) {
    if (publishedItems.length >= 35) break

    // Load member raw articles
    const rawMembers = await sql`
      SELECT
        r.id, r.source_id, r.title, r.description, r.article_body_text,
        r.canonical_url, r.original_url, r.main_image_url, r.image_urls,
        r.published_at, r.fetched_at, r.word_count, r.char_count,
        r.extraction_confidence, r.city, r.district, r.country_code,
        s.name as source_name, s.quality_tier as source_quality_tier,
        s.health_score as source_health_score, s.status as source_status
      FROM raw_articles r
      LEFT JOIN news_sources s ON s.id = r.source_id
      WHERE r.cluster_id = ${cl.id}
    `

    if (!rawMembers.length) continue

    const candidateArticles = rawMembers.map((r: any) => ({
      id: r.id,
      sourceId: r.source_id,
      sourceName: r.source_name || r.source_id,
      sourceQualityTier: r.source_quality_tier,
      sourceHealthScore: r.source_health_score ?? 50,
      sourceStatus: r.source_status,
      title: r.title,
      description: r.description,
      body: r.article_body_text || r.description || '',
      canonicalUrl: r.canonical_url,
      originalUrl: r.original_url,
      mainImageUrl: r.main_image_url,
      imageUrls: r.image_urls || [],
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      fetchedAt: new Date(r.fetched_at),
      wordCount: r.word_count,
      charCount: r.char_count,
      extractionConfidence: r.extraction_confidence,
      city: r.city || cl.city,
      district: r.district || cl.district,
      countryCode: r.country_code || cl.country_code || 'TR',
    }))

    const primary = selectPrimarySource(candidateArticles)
    if (!primary) continue

    const primaryArticle = candidateArticles.find((c) => c.id === primary.primaryArticleId)
    if (!primaryArticle) continue

    const quality = validateEditorialCandidate({
      title: cl.canonical_title || primaryArticle.title,
      body: primaryArticle.body,
      spot: primaryArticle.description,
      categoryHint: cl.category_hint,
      city: cl.city || primaryArticle.city,
      district: cl.district || primaryArticle.district,
      canonicalUrl: primaryArticle.canonicalUrl,
    })

    if (!quality.passed) continue

    const cat = quality.resolvedCategory

    // Enforce diversity: max 5 items per category unless we need to fill
    if ((categoryCounts[cat] || 0) >= 5 && publishedItems.length < 30) {
      continue
    }

    // Enforce source diversity: max 4 items per primary source
    const src = primaryArticle.sourceName
    if ((sourceCounts[src] || 0) >= 4 && publishedItems.length < 30) {
      continue
    }

    // Pick clean image
    const imageCandidates = [
      { url: primary.bestImageUrl, isPrimary: true },
      { url: cl.primary_image_url, isPrimary: true },
      { url: primaryArticle.mainImageUrl, isPrimary: false },
    ].filter((img) => Boolean(img.url))

    let heroImageUrl: string | null = null
    for (const cand of imageCandidates) {
      const v = validateImageCandidate(cand.url)
      if (v.valid && v.url) {
        heroImageUrl = v.url
        break
      }
    }

    if (!heroImageUrl) continue

    // Publish to Firestore + Postgres
    const newsDocRef = db.collection('news').doc()
    const newsId = newsDocRef.id
    const slugBase = quality.sanitizedTitle
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'haber'
    const slug = `${slugBase}-${newsId.slice(0, 8)}`

    const now = new Date()
    const publishedAt = primaryArticle.publishedAt || (cl.latest_article_at ? new Date(cl.latest_article_at) : now)
    const publishedAtMs = publishedAt.getTime()

    const firestorePayload = {
      id: newsId,
      title: quality.sanitizedTitle,
      slug,
      summary: quality.sanitizedSummary,
      spot: quality.sanitizedSummary,
      description: quality.sanitizedBody,
      content: quality.sanitizedBody,
      htmlContent: `<p>${quality.sanitizedBody.replace(/\n\n+/g, '</p><p>')}</p>`,
      category: quality.resolvedCategory,
      categoryId: quality.resolvedCategory,
      city: cl.city || primaryArticle.city || '',
      citySlug: quality.citySlug || '',
      district: cl.district || primaryArticle.district || '',
      districtSlug: quality.districtSlug || '',
      countryCode: cl.country_code || primaryArticle.countryCode || 'TR',
      thumbnail: heroImageUrl,
      coverImageUrl: heroImageUrl,
      imageUrl: heroImageUrl,
      source: primaryArticle.sourceName,
      sourceLabel: primaryArticle.sourceName,
      sourceUrl: primaryArticle.canonicalUrl || primaryArticle.originalUrl,
      author: primaryArticle.sourceName,
      authorId: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
      authorDisplayName: primaryArticle.sourceName,
      clusterId: cl.id,
      ingestionSourceId: primaryArticle.sourceId,
      rssGuid: primaryArticle.id,
      type: 'news',
      postType: 'news',
      status: 'published',
      visibility: 'public',
      seoNoindex: false,
      isBreaking: false,
      isAiGenerated: false,
      authorIsAI: false,
      publishedAt: publishedAtMs,
      createdAt: publishedAtMs,
      updatedAt: now.getTime(),
      viewsCount: 0,
      likesCount: 0,
      commentCount: 0,
      savesCount: 0,
      sharesCount: 0,
    }

    await newsDocRef.set(firestorePayload)

    // Insert into PostgreSQL news table
    await sql`
      INSERT INTO news (
        id, legacy_firestore_id, slug, title, summary, description, content, html_content,
        status, category_id, city_name, city_slug, district_name, district_slug,
        author_id, author_display_name, source, source_url, thumbnail_url, cover_image_url,
        tags, is_ai_generated, is_breaking, seo_title, seo_description,
        published_at, created_at, updated_at
      ) VALUES (
        ${newsId}, ${newsId}, ${slug}, ${quality.sanitizedTitle}, ${quality.sanitizedSummary.slice(0, 500)},
        ${quality.sanitizedBody.slice(0, 5000)}, ${quality.sanitizedBody}, ${`<p>${quality.sanitizedBody.replace(/\n\n+/g, '</p><p>')}</p>`},
        'published', ${quality.resolvedCategory}, ${cl.city || primaryArticle.city || null}, ${quality.citySlug},
        ${cl.district || primaryArticle.district || null}, ${quality.districtSlug},
        'ap3scBglLIVwflfZN4qL8PKrM1A3', ${primaryArticle.sourceName}, ${primaryArticle.sourceName},
        ${primaryArticle.canonicalUrl || primaryArticle.originalUrl}, ${heroImageUrl}, ${heroImageUrl},
        ${[quality.resolvedCategory]}, false, false,
        ${quality.sanitizedTitle.slice(0, 200)}, ${quality.sanitizedSummary.slice(0, 300)},
        ${publishedAt.toISOString()}, ${publishedAt.toISOString()}, ${now.toISOString()}
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        description = EXCLUDED.description,
        content = EXCLUDED.content,
        html_content = EXCLUDED.html_content,
        status = 'published',
        category_id = EXCLUDED.category_id,
        city_name = EXCLUDED.city_name,
        city_slug = EXCLUDED.city_slug,
        district_name = EXCLUDED.district_name,
        district_slug = EXCLUDED.district_slug,
        author_display_name = EXCLUDED.author_display_name,
        source = EXCLUDED.source,
        source_url = EXCLUDED.source_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        cover_image_url = EXCLUDED.cover_image_url,
        tags = EXCLUDED.tags,
        seo_title = EXCLUDED.seo_title,
        seo_description = EXCLUDED.seo_description,
        published_at = EXCLUDED.published_at,
        updated_at = EXCLUDED.updated_at
    `

    // Update news_clusters
    await sql`
      UPDATE news_clusters
      SET
        published_news_id = ${newsId},
        editorial_decision = 'APPROVED',
        editorial_decided_by = 'ap3scBglLIVwflfZN4qL8PKrM1A3',
        editorial_decided_at = ${now.toISOString()},
        primary_source_id = ${primary.sourceId},
        primary_source_name = ${primary.sourceName},
        primary_image_url = ${heroImageUrl},
        has_material_update = 0,
        update_review_status = 'NONE',
        updated_at = ${now.toISOString()}
      WHERE id = ${cl.id}
    `

    // Update member raw articles
    const memberIds = candidateArticles.map((a) => a.id)
    await sql`
      UPDATE raw_articles
      SET
        editorial_news_id = ${newsId},
        editorial_status = 'PUBLISHED',
        updated_at = ${now.toISOString()}
      WHERE id = ANY(${memberIds})
    `

    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    sourceCounts[src] = (sourceCounts[src] || 0) + 1

    publishedItems.push({
      pos: publishedItems.length + 1,
      newsId,
      clusterId: cl.id,
      title: quality.sanitizedTitle,
      category: cat,
      source: src,
      city: quality.citySlug,
      publishedAt: publishedAt.toISOString(),
    })

    console.log(`[${publishedItems.length}] Published: "${quality.sanitizedTitle.slice(0, 60)}..." | Cat: ${cat} | Source: ${src}`)
  }

  console.log('\n=== Publication Summary ===')
  console.log(`Total Published: ${publishedItems.length}`)
  console.log('Category Mix:', categoryCounts)
  console.log('Source Mix:', sourceCounts)

  const pgCount = (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published'`)[0].c
  console.log(`PostgreSQL published news count: ${pgCount}`)
}

run().catch(console.error)
