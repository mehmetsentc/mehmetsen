import { sql, eq, and } from 'drizzle-orm'
import { getDb } from '@/db'
import {
  publisherAdInventory,
  publisherContentItems,
  publisherMembers,
  publishers,
} from '@/db/schema'
import type { PublisherSetupStatus } from '@/types/publisherRollout'

const DISMISS_KEY_PREFIX = 'p11_onboarding_dismissed:'

/** Server-side setup progress for Studio home (no gamification). */
export async function getPublisherSetupStatus(
  publisherId: string,
  dismissedViaCookie?: boolean
): Promise<PublisherSetupStatus> {
  const db = getDb()

  const [pub] = await db.select().from(publishers).where(eq(publishers.id, publisherId)).limit(1)

  const [newsCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(publisherContentItems)
    .where(
      and(
        eq(publisherContentItems.publisherId, publisherId),
        eq(publisherContentItems.status, 'PUBLISHED')
      )
    )

  const [teamCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(publisherMembers)
    .where(
      and(eq(publisherMembers.publisherId, publisherId), eq(publisherMembers.status, 'ACTIVE'))
    )

  const [invCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(publisherAdInventory)
    .where(eq(publisherAdInventory.publisherId, publisherId))

  const profileComplete = Boolean(
    pub?.displayName && (pub.description?.trim() || pub.websiteUrl?.trim())
  )
  const hasLogoOrCover = Boolean(pub?.logoUrl || pub?.coverImageUrl)

  return {
    profileComplete,
    hasLogoOrCover,
    hasPublishedNews: (newsCount?.c ?? 0) > 0,
    hasTeam: (teamCount?.c ?? 0) > 0,
    hasAdInventory: (invCount?.c ?? 0) > 0,
    checklistDismissed: Boolean(dismissedViaCookie),
  }
}

export function onboardingDismissCookieName(publisherId: string) {
  return `${DISMISS_KEY_PREFIX}${publisherId}`
}
