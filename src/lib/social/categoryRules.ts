/**
 * Kategori bazlı sosyal medya varsayılanları.
 * Firestore: config/socialCategoryRules
 *
 *   {
 *     categories: {
 *       gundem: { defaultMode: 'story', autoPost: false, autoStory: true },
 *       spor:   { defaultMode: 'post',  autoPost: true,  autoStory: false },
 *     },
 *     default: { defaultMode: 'post', autoPost: true, autoStory: false }
 *   }
 */

export type SocialCategoryMode = 'post' | 'story' | 'both' | 'none'

export interface SocialCategoryPlatforms {
  facebook?: boolean
  instagram?: boolean
  twitter?: boolean
  threads?: boolean
}

export interface SocialCategoryRule {
  /** Composer varsayılan paylaşım modu */
  defaultMode: SocialCategoryMode
  /** Cron otomatik feed post'a dahil olsun mu? (false = veto) */
  autoPost?: boolean
  /** Cron otomatik hikâyeye dahil olsun mu? (true = gundem/featured dışı opt-in; false = veto) */
  autoStory?: boolean
  /** Composer platform varsayılanları (opsiyonel) */
  platforms?: SocialCategoryPlatforms
}

export interface SocialCategoryRulesDoc {
  categories: Record<string, SocialCategoryRule>
  default: SocialCategoryRule
  updatedAt?: unknown
  updatedBy?: string
}

export const FALLBACK_CATEGORY_RULE: SocialCategoryRule = {
  defaultMode: 'post',
  autoPost: true,
  autoStory: false,
}

export const VALID_CATEGORY_MODES: SocialCategoryMode[] = ['post', 'story', 'both', 'none']

export function isValidCategoryMode(v: unknown): v is SocialCategoryMode {
  return typeof v === 'string' && (VALID_CATEGORY_MODES as string[]).includes(v)
}

export function normalizeCategoryRule(
  raw: unknown,
  fallback: SocialCategoryRule = FALLBACK_CATEGORY_RULE,
): SocialCategoryRule {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const r = raw as Record<string, unknown>
  const mode = isValidCategoryMode(r.defaultMode) ? r.defaultMode : fallback.defaultMode
  const platforms =
    r.platforms && typeof r.platforms === 'object'
      ? {
          facebook: (r.platforms as SocialCategoryPlatforms).facebook,
          instagram: (r.platforms as SocialCategoryPlatforms).instagram,
          twitter: (r.platforms as SocialCategoryPlatforms).twitter,
          threads: (r.platforms as SocialCategoryPlatforms).threads,
        }
      : fallback.platforms
  return {
    defaultMode: mode,
    autoPost: typeof r.autoPost === 'boolean' ? r.autoPost : fallback.autoPost,
    autoStory: typeof r.autoStory === 'boolean' ? r.autoStory : fallback.autoStory,
    ...(platforms ? { platforms } : {}),
  }
}

export function normalizeCategoryRulesDoc(data: unknown): SocialCategoryRulesDoc {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const fallback = normalizeCategoryRule(d.default, FALLBACK_CATEGORY_RULE)
  const catsRaw =
    d.categories && typeof d.categories === 'object'
      ? (d.categories as Record<string, unknown>)
      : {}
  const categories: Record<string, SocialCategoryRule> = {}
  for (const [id, rule] of Object.entries(catsRaw)) {
    if (!id.trim()) continue
    categories[id] = normalizeCategoryRule(rule, fallback)
  }
  return {
    categories,
    default: fallback,
    updatedAt: d.updatedAt,
    updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : undefined,
  }
}

/** Kategori id (veya slug) için kural; yoksa default. */
export function resolveCategoryRule(
  doc: SocialCategoryRulesDoc,
  categoryId?: string | null,
): SocialCategoryRule {
  const id = (categoryId ?? '').trim().toLowerCase()
  if (id && doc.categories[id]) return doc.categories[id]
  return doc.default
}

/**
 * Composer açılışında kullanılacak paylaşma modu.
 * `none` → sekme varsayılanına düş.
 */
export function composerModeFromRule(
  rule: SocialCategoryRule,
  tabFallback: 'post' | 'story',
): 'post' | 'story' | 'both' {
  if (rule.defaultMode === 'none') return tabFallback
  if (rule.defaultMode === 'post' || rule.defaultMode === 'story' || rule.defaultMode === 'both') {
    return rule.defaultMode
  }
  return tabFallback
}

/** Cron post adayı: defaultMode none veya autoPost===false → atla */
export function allowsAutoPost(rule: SocialCategoryRule): boolean {
  if (rule.defaultMode === 'none') return false
  if (rule.autoPost === false) return false
  return true
}

/**
 * Cron story:
 *  - defaultMode none veya autoStory===false → veto
 *  - autoStory===true → gundem/featured dışında da opt-in
 *  - aksi halde mevcut uygunluk (baseEligible) geçerli
 */
export function allowsAutoStory(rule: SocialCategoryRule, baseEligible: boolean): boolean {
  if (rule.defaultMode === 'none') return false
  if (rule.autoStory === false) return false
  if (rule.autoStory === true) return true
  return baseEligible
}
