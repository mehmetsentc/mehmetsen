const SILENT_GOOGLE_AUTH_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
])

/** User-facing messages for Firebase Google sign-in errors. Returns null when no toast is needed. */
export function getGoogleAuthErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''

  if (SILENT_GOOGLE_AUTH_CODES.has(code)) return null

  const messages: Record<string, string> = {
    'auth/popup-blocked': 'Tarayıcı Google penceresini engelledi — yönlendirme deneniyor',
    'auth/unauthorized-domain':
      'Bu site Google girişi için yetkili değil — Firebase Console → Authentication → Authorized domains listesine www.nahaber.com ekleyin',
    'auth/operation-not-allowed': 'Google girişi Firebase konsolunda kapalı',
    'auth/account-exists-with-different-credential':
      'Bu e-posta başka bir yöntemle kayıtlı — e-posta/şifre ile giriş yapın',
    'auth/network-request-failed': 'Ağ hatası — bağlantınızı kontrol edin',
    'auth/argument-error': 'Google giriş yapılandırma hatası — sayfayı yenileyip tekrar deneyin',
    'auth/internal-error':
      'Google bağlantı hatası — sayfayı yenileyip tekrar deneyin veya farklı tarayıcı kullanın',
    'auth/web-storage-unsupported': 'Tarayıcı depolama desteklemiyor — çerezleri etkinleştirin',
    'permission-denied': 'Hesap kaydı oluşturulamadı — Firestore izin hatası',
    'failed-precondition': 'Veritabanı yapılandırma hatası — lütfen daha sonra tekrar deneyin',
  }

  if (messages[code]) return messages[code]
  if (/unauthorized/i.test(message)) {
    return 'Yetkilendirme hatası — sayfayı yenileyip tekrar deneyin'
  }
  if (message.trim()) {
    return `Google ile giriş başarısız: ${message.slice(0, 120)}`
  }
  return 'Google ile giriş başarısız oldu'
}
