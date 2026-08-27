/**
 * Server-side Publisher Studio page gate — global OR allowlist (P11).
 */
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isStudioEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import type { PublisherRecord } from '@/types/publisher'

export async function loadStudioPublisherForPage(
  slugRaw: string
): Promise<PublisherRecord | null> {
  if (!hasDatabaseUrl()) return null
  const slug = slugRaw.trim().toLowerCase()
  if (!slug) return null
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) return null
  const studioOn =
    isPublisherStudioEnabled() || (await isStudioEffectiveForPublisher(publisher.id))
  if (!studioOn) return null
  return publisher
}
