/**
 * Meta API host + version configuration — single source of truth.
 *
 * Facebook Graph (Facebook Login, Pages, Instagram via Facebook Login) and
 * Instagram Graph (Instagram API with Instagram Login) share the Graph API
 * version. Threads has its own versioning and host.
 *
 * Changing META_GRAPH_API_VERSION affects every Facebook/Instagram call.
 * v21.0 is available until 2027-01-21 (Graph API changelog); the upgrade is a
 * separate, tested task.
 */
export const META_GRAPH_API_VERSION = 'v21.0'

/** graph.facebook.com — Facebook Login, Pages API, Instagram API with Facebook Login. */
export const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

/** facebook.com OAuth dialog (Facebook Login). */
export const FACEBOOK_OAUTH_DIALOG_BASE = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`

/** graph.instagram.com — Instagram API with Instagram Login only. */
export const INSTAGRAM_LOGIN_GRAPH_BASE = `https://graph.instagram.com/${META_GRAPH_API_VERSION}`

/** Threads API — separate version line. */
export const THREADS_API_VERSION = 'v1.0'
export const THREADS_GRAPH_BASE = `https://graph.threads.net/${THREADS_API_VERSION}`

// ── OAuth endpoints (connection flows) — per current Meta docs ──────────────
/** Instagram API with Instagram Login (Instagram App ID, not the Meta App ID). */
export const INSTAGRAM_OAUTH_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
export const INSTAGRAM_OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
/** Long-lived exchange is unversioned on graph.instagram.com. */
export const INSTAGRAM_LONG_LIVED_TOKEN_URL = 'https://graph.instagram.com/access_token'

/** Threads (Threads App ID). Docs: authorize on threads.com, code exchange on graph.threads.com,
 *  long-lived exchange on graph.threads.net. */
export const THREADS_OAUTH_AUTHORIZE_URL = 'https://threads.com/oauth/authorize'
export const THREADS_OAUTH_TOKEN_URL = 'https://graph.threads.com/oauth/access_token'
export const THREADS_LONG_LIVED_TOKEN_URL = 'https://graph.threads.net/access_token'
