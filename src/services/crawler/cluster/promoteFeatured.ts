/**
 * Pull a confirmed multi-source story onto the national Öne Çıkan rail.
 * Matches the CMS "Genelde öne çıkan" write: Firestore featured + editor pick.
 * Does not feature drafts, yerel, or Kıbrıs items.
 */
export async function promotePublishedNewsToFeatured(
  newsId: string
): Promise<'featured' | 'not_ready' | 'ineligible' | 'error'> {
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const { Collections } = await import('@/lib/firebase/collections')
    const { isNationalFeaturedEligible } = await import('@/lib/featuredScope')
    const { demoteExcessFeaturedPins } = await import('@/lib/featuredPins')
    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWS).doc(newsId)
    const snap = await ref.get()
    if (!snap.exists) return 'not_ready'
    const data = snap.data() || {}
    if (data.status !== 'published') return 'not_ready'
    const categoryId = String(data.categoryId || data.category || '')
    const citySlug = String(data.citySlug || '')
    if (!isNationalFeaturedEligible({ categoryId, citySlug })) return 'ineligible'
    if (data.featured === true) return 'featured'
    const now = Date.now()
    await ref.update({
      featured: true,
      isEditorPick: true,
      featuredAt: now,
      updatedAt: now,
    })
    await demoteExcessFeaturedPins(db, { keepId: newsId })
    return 'featured'
  } catch {
    return 'error'
  }
}
