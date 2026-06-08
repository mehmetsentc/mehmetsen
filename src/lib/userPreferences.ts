export interface PrivacyPreferences {
  publicProfile: boolean
  showActivity: boolean
  allowMentions: boolean
  allowMessages: boolean
  shareLocation: boolean
}

export interface NotificationPreferences {
  likes: boolean
  comments: boolean
  follows: boolean
  mentions: boolean
  newsUpdates: boolean
  emailNotifications: boolean
}

const PRIVACY_KEY = 'nahaber-privacy-prefs'
const NOTIFICATION_KEY = 'nahaber-notification-prefs'

const DEFAULT_PRIVACY: PrivacyPreferences = {
  publicProfile: true,
  showActivity: true,
  allowMentions: true,
  allowMessages: true,
  shareLocation: false,
}

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  likes: true,
  comments: true,
  follows: true,
  mentions: true,
  newsUpdates: false,
  emailNotifications: false,
}

function readPrefs<T>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

function writePrefs<T>(key: string, prefs: T): void {
  localStorage.setItem(key, JSON.stringify(prefs))
}

export function getPrivacyPreferences(): PrivacyPreferences {
  return readPrefs(PRIVACY_KEY, DEFAULT_PRIVACY)
}

export function savePrivacyPreferences(prefs: PrivacyPreferences): void {
  writePrefs(PRIVACY_KEY, prefs)
}

export function getNotificationPreferences(): NotificationPreferences {
  return readPrefs(NOTIFICATION_KEY, DEFAULT_NOTIFICATIONS)
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  writePrefs(NOTIFICATION_KEY, prefs)
}
