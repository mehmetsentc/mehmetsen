/**
 * Social inbox (pure, browser-safe): replying to comments and direct messages
 * of connected accounts from the NaHaber panel, with AI drafts and a narrow,
 * opt-in auto-reply.
 *
 * Official sources (verified 17.11.2026):
 *   Instagram (Instagram Login) — comment reply/hide/delete: instagram_business_manage_comments
 *     POST /{ig-comment-id}/replies (message) · POST /{ig-comment-id} (hide) · DELETE /{ig-comment-id}
 *   Instagram messaging (Instagram Login) — instagram_business_manage_messages,
 *     POST /{ig-id}/messages; the user must message first; 24-hour response window;
 *     webhook field `messages`; Advanced Access for accounts the app does not own/manage.
 *   Instagram via Facebook Login — instagram_manage_comments, instagram_manage_messages,
 *     pages_manage_metadata (webhooks).
 *   Facebook Page — pages_manage_engagement (create/edit/delete comments as the Page; hide),
 *     pages_messaging (Messenger conversations; depends on pages_manage_metadata),
 *     Send API messaging_type RESPONSE in the 24-hour window; HUMAN_AGENT tag up to 7 days.
 *   Threads — threads_manage_replies (POST reply_to_id + threads_publish; POST /{reply-id}/manage_reply hide).
 *   YouTube — comments.insert needs the youtube.force-ssl scope.
 *   Webhooks — GET hub.mode/hub.verify_token/hub.challenge; POST signed with
 *     X-Hub-Signature-256 = sha256 HMAC of the raw body with the App Secret.
 *
 * Nothing here talks to a platform; see ./platform.ts and ./store.ts.
 */
import type { SocialAccountPlatform, SocialConnectionMethod } from '../accounts/types'

// ── Permissions ──────────────────────────────────────────────────────────────

export const YOUTUBE_FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'

export interface InboxScopes {
  /** Read comment texts (already part of the engagement opt-in). */
  read: string[]
  /** Reply to / hide comments as the account. */
  reply: string[]
  /** Read and answer direct messages (empty = the platform has no DM API). */
  messages: string[]
}

export function inboxScopesFor(platform: SocialAccountPlatform, method: SocialConnectionMethod): InboxScopes {
  if (platform === 'instagram' && method === 'instagram_login') {
    return { read: ['instagram_business_manage_comments'], reply: ['instagram_business_manage_comments'], messages: ['instagram_business_manage_messages'] }
  }
  if (platform === 'instagram' && method === 'facebook_login') {
    return { read: ['instagram_manage_comments'], reply: ['instagram_manage_comments'], messages: ['instagram_manage_messages', 'pages_manage_metadata'] }
  }
  if (platform === 'facebook' && method === 'facebook_login') {
    return { read: ['pages_read_user_content'], reply: ['pages_manage_engagement', 'pages_read_user_content'], messages: ['pages_messaging', 'pages_manage_metadata'] }
  }
  if (platform === 'threads' && method === 'threads_oauth') {
    return { read: ['threads_read_replies'], reply: ['threads_manage_replies'], messages: [] }
  }
  if (platform === 'youtube') return { read: [], reply: [YOUTUBE_FORCE_SSL_SCOPE], messages: [] }
  // legacy (Onyeditivi) and TikTok: no inbox through NaHaber.
  return { read: [], reply: [], messages: [] }
}

/** Every optional permission the «Mesaj ve cevap izni ver» consent asks for. */
export function allInboxScopes(platform: SocialAccountPlatform, method: SocialConnectionMethod): string[] {
  const s = inboxScopesFor(platform, method)
  return [...new Set([...s.read, ...s.reply, ...s.messages])]
}

export type CapabilityState = 'granted' | 'missing' | 'unknown' | 'unsupported'

/**
 * `null` granted list (legacy / unverified) → unknown: the action is attempted
 * and a permission error is reported honestly; never shown as granted.
 */
export function capability(granted: readonly string[] | null | undefined, needed: readonly string[]): CapabilityState {
  if (needed.length === 0) return 'unsupported'
  if (!granted) return 'unknown'
  return needed.every((p) => granted.includes(p)) ? 'granted' : 'missing'
}

export function inboxCapabilities(a: { platform: SocialAccountPlatform; connectionMethod: SocialConnectionMethod; grantedPermissions: string[] | null }): {
  reply: CapabilityState
  messages: CapabilityState
  missing: string[]
} {
  const s = inboxScopesFor(a.platform, a.connectionMethod)
  const reply = capability(a.grantedPermissions, s.reply)
  const messages = capability(a.grantedPermissions, s.messages)
  const granted = new Set(a.grantedPermissions ?? [])
  const missing = a.grantedPermissions ? allInboxScopes(a.platform, a.connectionMethod).filter((p) => !granted.has(p)) : []
  return { reply, messages, missing }
}

// ── Text limits / cleaning ───────────────────────────────────────────────────

/** Conservative per-platform reply length (characters). */
export const REPLY_MAX: Record<SocialAccountPlatform, number> = { instagram: 2000, facebook: 2000, threads: 500, youtube: 2000, tiktok: 0 }
export const DM_MAX = 1000

/** Plain text, no control / bidi characters, bounded, trimmed. */
export function cleanReplyText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return t.length > max ? t.slice(0, max).trim() : t
}

const URL_RE = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi
const ALLOWED_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?nahaber\.com(?:[/?#]|$)/i

/** Links other than nahaber.com are never sent (AI or template). */
export function hasForeignLink(text: string): boolean {
  return (text.match(URL_RE) ?? []).some((u) => !ALLOWED_HOST_RE.test(u))
}

// ── Classification (deterministic, Turkish) ──────────────────────────────────

/**
 * Categories. Only the SAFE ones may ever be answered automatically; every
 * other category goes to a person.
 */
export const INBOX_CATEGORIES = [
  'thanks', // teşekkür / tebrik
  'link_request', // haberin linki / kaynağı nerede
  'contact', // ihbar, haber gönderme, iletişim
  'question', // genel soru
  'complaint', // şikâyet / düzeltme talebi
  'abuse', // hakaret / küfür / tehdit
  'legal', // hukuk / dava / avukat / KVKK
  'political', // siyasi tartışma
  'sensitive', // ölüm, kaza, intihar, taziye…
  'spam', // reklam / link spam
  'other',
] as const
export type InboxCategory = (typeof INBOX_CATEGORIES)[number]

export const AUTO_SAFE_CATEGORIES: readonly InboxCategory[] = ['thanks', 'link_request', 'contact']
export const CATEGORY_TR: Record<InboxCategory, string> = {
  thanks: 'Teşekkür / tebrik',
  link_request: 'Link / kaynak isteği',
  contact: 'İhbar / iletişim',
  question: 'Soru',
  complaint: 'Şikâyet / düzeltme',
  abuse: 'Hakaret / tehdit',
  legal: 'Hukuki',
  political: 'Siyasi',
  sensitive: 'Hassas konu',
  spam: 'Spam',
  other: 'Diğer',
}

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()

// Order matters: «needs a person» rules win over «safe» ones.
const RULES: Array<[InboxCategory, RegExp]> = [
  ['legal', /(?<![\p{L}\p{N}])(avukat|dava(?![\p{L}\p{N}])|davacı|mahkeme|suç duyurusu|savcılı|tazminat|kvkk|kişisel veri|hakkımda|ihtarname|yasal işlem|telif)/u],
  ['abuse', /(?<![\p{L}\p{N}])(aptal|salak|gerizekal|şerefsiz|namussuz|orospu|piç|siktir|sikeyim|amk|aq(?![\p{L}\p{N}])|oç(?![\p{L}\p{N}])|yavşak|hain|gebertece|öldürece|seni bulaca|kafanı)/u],
  ['sensitive', /(?<![\p{L}\p{N}])(öldü|ölüm|vefat|hayatını kaybet|cenaze|taziye|başsağlığı|allah rahmet|mekanı cennet|intihar|tecavüz|taciz|istismar|yaralı|kaza|şehit|deprem|yangın)/u],
  ['political', /(?<![\p{L}\p{N}])(akp|ak parti|chp|mhp|dem parti|hdp|iyi parti|zafer partisi|erdoğan|özgür özel|imamoğlu|bahçeli|seçim|muhalefet|iktidar|hükümet|cumhurbaşkanı|darbe)/u],
  ['complaint', /(?<![\p{L}\p{N}])(yanlış haber|yalan haber|düzelt|hatalı|yalan|asılsız|kaldırın|silin|şikayet|şikâyet|rezalet|yanlış bilgi|tekzip)/u],
  ['spam', /(takipçi|kazanç|bahis|casino|bonus|kripto|whatsapp.*\d{3}|dm at.*kazan|link bio|linke tıkla|💰)/u],
  ['link_request', /(?<![\p{L}\p{N}])(link|linki|linkini|kaynak|haberin devamı|detaylar(?:ı)? nerede|nereden oku|haberi nerede|sitede var mı|haberin tamamı)/u],
  ['contact', /(?<![\p{L}\p{N}])(ihbar|haber vermek|haberim var|haber göndermek|iletişim|nasıl ulaş|numaranız|mail adres|e-?posta|muhabir)/u],
  ['thanks', /(?<![\p{L}\p{N}])(teşekkür|tesekkur|sağ ?ol|sagol|eline sağlık|emeğinize sağlık|emeğine sağlık|tebrik|harika haber|güzel haber|bravo|helal olsun|👏|🙏|❤️)/u],
  ['question', /\?|(?<![\p{L}\p{N}])(ne zaman|nerede|neden|nasıl|kim|hangi|kaç)(?![\p{L}\p{N}])/u],
]

export function classifyByRules(text: string): InboxCategory {
  const t = norm(text)
  if (!t) return 'other'
  if ((t.match(URL_RE) ?? []).length >= 2) return 'spam'
  for (const [cat, re] of RULES) if (re.test(t)) return cat
  return 'other'
}

export function isAutoSafe(category: InboxCategory): boolean {
  return (AUTO_SAFE_CATEGORIES as readonly string[]).includes(category)
}

// ── Templates (no AI cost; used when AI is off or as the auto text) ──────────

export function templateReply(category: InboxCategory, ctx: { newsUrl: string | null; kind: 'comment' | 'dm' }): string | null {
  if (category === 'thanks') return 'İlginiz için teşekkür ederiz. 🙏'
  if (category === 'link_request') {
    return ctx.newsUrl ? `Haberin tamamı NaHaber'de: ${ctx.newsUrl}` : "Haberin tamamına nahaber.com üzerinden ulaşabilirsiniz."
  }
  if (category === 'contact') {
    return ctx.kind === 'dm'
      ? 'Mesajınız için teşekkürler. Haber ve ihbarlarınızı buradan iletebilirsiniz; editörlerimiz en kısa sürede inceleyecek.'
      : 'Haber ve ihbarlarınızı bize özel mesajla iletebilirsiniz; editörlerimiz inceleyecek.'
  }
  return null
}

// ── Settings ─────────────────────────────────────────────────────────────────

export type InboxMode = 'off' | 'draft' | 'auto'
export interface InboxSettings {
  /** off: only manual replies · draft: AI/template draft prepared for the editor · auto: safe categories answered automatically. */
  commentMode: InboxMode
  dmMode: InboxMode
  /** Subset of AUTO_SAFE_CATEGORIES allowed to be answered automatically. */
  autoCategories: InboxCategory[]
  /** Automatic replies per account per day (Europe/Istanbul). */
  dailyLimit: number
  /** Minimum seconds between two automatic replies of the account. */
  minIntervalSec: number
  /** Emergency stop for this account's automatic replies. */
  paused: boolean
  updatedAt: number | null
  updatedBy: string | null
}

export const DEFAULT_INBOX_SETTINGS: InboxSettings = {
  commentMode: 'off',
  dmMode: 'off',
  autoCategories: ['thanks', 'link_request'],
  dailyLimit: 20,
  minIntervalSec: 120,
  paused: false,
  updatedAt: null,
  updatedBy: null,
}

const MODES: InboxMode[] = ['off', 'draft', 'auto']
const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
}

/** Validates a client patch; unknown fields are ignored, nothing outside the allowed ranges is stored. */
export function parseInboxSettings(raw: unknown, prev: InboxSettings = DEFAULT_INBOX_SETTINGS): InboxSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mode = (v: unknown, d: InboxMode): InboxMode => (MODES.includes(v as InboxMode) ? (v as InboxMode) : d)
  const cats = Array.isArray(r.autoCategories)
    ? [...new Set(r.autoCategories.filter((c): c is InboxCategory => typeof c === 'string' && isAutoSafe(c as InboxCategory)))]
    : prev.autoCategories
  return {
    commentMode: mode(r.commentMode, prev.commentMode),
    dmMode: mode(r.dmMode, prev.dmMode),
    autoCategories: cats,
    dailyLimit: r.dailyLimit === undefined ? prev.dailyLimit : clampInt(r.dailyLimit, 1, 200, prev.dailyLimit),
    minIntervalSec: r.minIntervalSec === undefined ? prev.minIntervalSec : clampInt(r.minIntervalSec, 30, 3600, prev.minIntervalSec),
    paused: typeof r.paused === 'boolean' ? r.paused : prev.paused,
    updatedAt: prev.updatedAt,
    updatedBy: prev.updatedBy,
  }
}

// ── Messaging window ─────────────────────────────────────────────────────────

export const STANDARD_WINDOW_MS = 24 * 3600_000
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3600_000

export type WindowState = 'open' | 'human_agent' | 'closed'

/** Standard 24 h window; 24 h–7 d only a person may answer (Messenger HUMAN_AGENT tag); later closed. */
export function messagingWindow(lastInboundAt: number | null, now: number): WindowState {
  if (!lastInboundAt) return 'closed'
  const age = now - lastInboundAt
  if (age < STANDARD_WINDOW_MS) return 'open'
  if (age < HUMAN_AGENT_WINDOW_MS) return 'human_agent'
  return 'closed'
}

// ── Auto-reply decision ──────────────────────────────────────────────────────

export type AutoDecision =
  | { action: 'reply'; category: InboxCategory }
  | { action: 'draft'; category: InboxCategory; reason: AutoBlock | null }
  | { action: 'skip'; category: InboxCategory; reason: AutoBlock }

export type AutoBlock =
  | 'mode_off'
  | 'global_off'
  | 'paused'
  | 'not_safe_category'
  | 'category_not_allowed'
  | 'sensitive_news'
  | 'own_account'
  | 'daily_limit'
  | 'interval'
  | 'same_person'
  | 'window_closed'
  | 'no_permission'
  | 'old_item'

export const AUTO_BLOCK_TR: Record<AutoBlock, string> = {
  mode_off: 'hesapta kapalı',
  global_off: 'otomatik cevap genel olarak kapalı',
  paused: 'hesap için durduruldu',
  not_safe_category: 'kişi incelemeli',
  category_not_allowed: 'bu kategori otomatikte seçili değil',
  sensitive_news: 'hassas haber — kişi incelemeli',
  own_account: 'hesabın kendi yorumu',
  daily_limit: 'günlük sınır doldu',
  interval: 'paylaşım aralığı dolmadı',
  same_person: 'bu kişiye bugün zaten otomatik cevap verildi',
  window_closed: '24 saatlik mesaj penceresi kapandı',
  no_permission: 'cevap izni yok',
  old_item: 'yorum çok eski',
}

/** Items older than this are never auto-answered (late replies read as bots). */
export const AUTO_MAX_AGE_MS = 6 * 3600_000

export function decideAuto(input: {
  kind: 'comment' | 'dm'
  category: InboxCategory
  settings: InboxSettings
  globalEnabled: boolean
  newsSensitivity: number
  ownAccount: boolean
  canReply: boolean
  itemAt: number | null
  now: number
  counter: { count: number; lastAt: number | null; authors: string[] }
  authorKey: string | null
  window?: WindowState
}): AutoDecision {
  const { category, settings } = input
  const mode = input.kind === 'comment' ? settings.commentMode : settings.dmMode
  if (mode === 'off') return { action: 'skip', category, reason: 'mode_off' }
  if (input.ownAccount) return { action: 'skip', category, reason: 'own_account' }
  if (category === 'spam') return { action: 'skip', category, reason: 'not_safe_category' }
  const draft = (reason: AutoBlock | null): AutoDecision => ({ action: 'draft', category, reason })
  if (mode === 'draft') return draft(null)
  // mode === 'auto' — every check below falls back to a draft for a person.
  if (!input.globalEnabled) return draft('global_off')
  if (settings.paused) return draft('paused')
  if (!isAutoSafe(category)) return draft('not_safe_category')
  if (!settings.autoCategories.includes(category)) return draft('category_not_allowed')
  if (input.newsSensitivity >= 2) return draft('sensitive_news')
  if (!input.canReply) return draft('no_permission')
  if (input.kind === 'dm' && input.window !== 'open') return draft('window_closed')
  if (input.itemAt !== null && input.now - input.itemAt > AUTO_MAX_AGE_MS) return draft('old_item')
  if (input.counter.count >= settings.dailyLimit) return draft('daily_limit')
  if (input.counter.lastAt !== null && input.now - input.counter.lastAt < settings.minIntervalSec * 1000) return draft('interval')
  if (input.authorKey && input.counter.authors.includes(input.authorKey)) return draft('same_person')
  return { action: 'reply', category }
}

/** Istanbul calendar day (UTC+3, no DST) for daily counters. */
export function istanbulDay(now: number): string {
  return new Date(now + 3 * 3600_000).toISOString().slice(0, 10)
}

// ── Reply records ────────────────────────────────────────────────────────────

export type ReplySource = 'editor' | 'ai_draft' | 'auto'
/**
 * sending   — claimed, the platform call is in flight
 * sent      — the platform returned an id
 * failed    — the platform refused (safe to try again)
 * uncertain — the call may have reached the platform but the answer was lost;
 *             never retried blindly, a person checks the platform first
 * pending_publish — Threads container created, publish step not done yet
 */
export type ReplyStatus = 'sending' | 'sent' | 'failed' | 'uncertain' | 'pending_publish'

export interface ReplySummary {
  replyId: string
  status: ReplyStatus
  text: string
  source: ReplySource
  at: number
  by: string | null
  errorCode: string | null
}

/** Uncertain = the request may have been applied (network loss / 5xx / timeout after sending). */
export function isUncertainFailure(status: number): boolean {
  return status === 0 || status >= 500
}

export function errorText(code: string | null): string {
  if (!code) return 'Bilinmeyen hata'
  if (code.includes('_190') || code.includes('_102') || code === 'account_unavailable') return 'Hesabın yetkisi geçersiz — yeniden bağlayın'
  if (/_(10|200|3)(_|$)/.test(code) || /meta_\d+_2\d\d/.test(code) || code === 'permission_missing' || code.startsWith('yt_403')) return 'İzin yok — «Mesaj ve cevap izni ver» ile izin verin'
  if (code === 'window_closed' || code.includes('_10_2018278') || code.includes('_551')) return '24 saatlik mesaj penceresi kapalı'
  if (code === 'uncertain') return 'Sonuç belirsiz — platformda kontrol edin'
  if (code === 'too_long') return 'Metin çok uzun'
  if (code === 'empty') return 'Metin boş'
  if (code === 'foreign_link') return 'nahaber.com dışındaki bağlantılar gönderilmez'
  if (code === 'unsupported') return 'Bu platform bu işlemi desteklemiyor'
  return `Platform hatası (${code})`
}

/** Opaque author key for «same person» limits — never the raw name. */
export function authorKey(platform: SocialAccountPlatform, author: string | null): string | null {
  if (!author) return null
  const s = `${platform}:${author.toLocaleLowerCase('tr-TR')}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function conversationId(accountId: string, participantId: string): string {
  return `${accountId}__${participantId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`
}

export function messageDocId(platform: SocialAccountPlatform, mid: string): string {
  return `${platform}_${mid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140)}`
}
