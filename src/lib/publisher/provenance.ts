/**
 * LP7R.1 — publisher-attribution provenance guard.
 *
 * A canonical article may be presented as a publisher's own/direct content
 * ("[PUBLISHER] HABERLERİ") only when the publisher's crawler source was the
 * PRIMARY (originating) member of the article's cluster. Every other role —
 * SUPPORTING, DUPLICATE, LOW_QUALITY, MATERIAL_UPDATE — means the source
 * merely corroborated, duplicated, or updated a story another source broke,
 * and must NOT be attributed to this publisher directly.
 *
 * MATERIAL_UPDATE is explicitly NOT treated as PRIMARY here: per
 * src/services/crawler/cluster/roles.ts' assignMembershipRole, a member is
 * only ever assigned MATERIAL_UPDATE when it is NOT the cluster's primary
 * article (`if (opts.isPrimary) return 'PRIMARY'` is checked first). Some
 * unrelated crawler-dispatch code treats PRIMARY and MATERIAL_UPDATE alike
 * for AI-reprocessing eligibility (src/services/crawler/store/drizzle.ts) —
 * that is a different concern (freshness/reprocessing) and must not be
 * confused with publisher attribution.
 *
 * This function is intentionally applied in application code as a second,
 * independent check *in addition to* the SQL-level
 * `cluster_memberships.membershipRole = 'PRIMARY'` join used at the query
 * site — defense in depth, and the only part of the provenance rule that
 * can be unit-tested without a live database (see provenance.test.ts).
 */
export function isPrimaryMembershipRole(role: string | null | undefined): boolean {
  return role === 'PRIMARY'
}
