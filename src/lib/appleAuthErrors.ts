/**
 * Apple Sign-In hata yorumlayıcısı.
 *
 * User-facing copy must stay App Review–safe: no Firebase Console / developer
 * instructions. Capacitor 8 may surface custom codes as UNAVAILABLE.
 */

const SILENT_APPLE_AUTH_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
  'SIGN_IN_CANCELED',
  'SIGN_IN_IN_PROGRESS',
])

/** User-facing Turkish messages for Firebase/native Apple sign-in errors. */
export function getAppleAuthErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''

  if (SILENT_APPLE_AUTH_CODES.has(code)) return null
  if (message.includes('SIGN_IN_CANCELED') || message.includes('Sign in cancelled')) return null

  const messages: Record<string, string> = {
    'auth/popup-blocked':
      'Apple giriş penceresi engellendi — lütfen tekrar deneyin',
    'auth/operation-not-allowed':
      'Apple ile giriş şu anda kullanılamıyor — lütfen daha sonra tekrar deneyin',
    'auth/invalid-credential':
      'Apple girişi doğrulanamadı — lütfen tekrar deneyin',
    'auth/invalid-oauth-client-id':
      'Apple girişi yapılandırılamadı — lütfen daha sonra tekrar deneyin',
    'auth/unauthorized-domain':
      'Apple ile giriş bu ortamda kullanılamıyor — lütfen tekrar deneyin',
    'auth/account-exists-with-different-credential':
      'Bu e-posta zaten farklı bir yöntemle kayıtlı — eski yöntemle giriş yapın',
    'auth/credential-already-in-use':
      'Bu Apple hesabı zaten başka bir kullanıcıyla ilişkili',
    'auth/network-request-failed':
      'Ağ hatası — bağlantınızı kontrol edip tekrar deneyin',
    'auth/internal-error':
      'Apple bağlantı hatası — lütfen tekrar deneyin',
    'auth/web-storage-unsupported':
      'Tarayıcı depolama desteklemiyor — çerezleri etkinleştirin',
    'auth/timeout': 'Apple ile giriş zaman aşımına uğradı — tekrar deneyin',
    'auth/too-many-requests': 'Çok fazla deneme — lütfen bekleyin ve tekrar deneyin',
    'auth/missing-or-invalid-nonce':
      'Apple giriş doğrulaması başarısız — uygulamayı yeniden başlatıp deneyin',
    'auth/user-disabled': 'Bu hesap devre dışı bırakılmış',
    'auth/requires-recent-login': 'Devam etmek için tekrar giriş yapın',
    'permission-denied':
      'Hesap oluşturulamadı — lütfen tekrar deneyin',
    UNAVAILABLE:
      'Apple ile giriş şu anda kullanılamıyor — tekrar deneyin',
    'internal-error':
      'Apple bağlantı hatası — tekrar deneyin',
  }

  if (messages[code]) return messages[code]

  const isNativeFailure =
    code === 'SIGN_IN_FAILED' ||
    code === 'UNAVAILABLE' ||
    message.includes('SIGN_IN_FAILED') ||
    message.includes('AuthorizationError') ||
    message.includes('ASAuthorizationError') ||
    message.includes('plugin is not implemented') ||
    message.includes('"NativeAppleSignIn" plugin')

  if (isNativeFailure) {
    const asMatch = message.match(/SIGN_IN_FAILED:(\d+):/)
    if (asMatch) {
      const errNum = asMatch[1]
      switch (errNum) {
        case '1001':
          return null
        case '1004':
        case '1005':
          return 'Apple ile giriş açılamadı — uygulamayı kapatıp yeniden açın ve tekrar deneyin'
        default:
          return 'Apple ile giriş başarısız oldu — tekrar deneyin'
      }
    }
    return 'Apple ile giriş şu anda kullanılamıyor — tekrar deneyin'
  }

  if (code || message.trim()) {
    return 'Apple ile giriş başarısız oldu — tekrar deneyin'
  }
  return 'Apple ile giriş başarısız oldu'
}
