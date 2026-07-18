/**
 * Apple Sign-In hata yorumlayıcısı.
 *
 * Apple flow'unda en sık görülen yapılandırma hataları:
 *  - Firebase Console → Authentication → Sign-in method → Apple aktif değil
 *    → `auth/operation-not-allowed`
 *  - Apple Developer Service ID / Key ID / Team ID eksik veya hatalı
 *    → `auth/invalid-credential` / `auth/internal-error`
 *  - Authorized domains listesine production domain eklenmemiş
 *    → `auth/unauthorized-domain`
 *
 * Capacitor 8 not: custom rejection codes ("SIGN_IN_FAILED") may arrive as
 * 'UNAVAILABLE' or with an empty code. We therefore check both the `code`
 * property and the `message` string for our sentinel prefixes.
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
  // Also suppress by message (Capacitor 8 may not propagate custom codes)
  if (message.includes('SIGN_IN_CANCELED') || message.includes('Sign in cancelled')) return null

  const messages: Record<string, string> = {
    'auth/popup-blocked':
      'Tarayıcı Apple penceresini engelledi — yönlendirme deneniyor',
    'auth/operation-not-allowed':
      "Apple ile giriş henüz aktifleştirilmemiş — Firebase Console → Authentication → Sign-in method → Apple'ı etkinleştirin",
    'auth/invalid-credential':
      "Apple kimlik bilgileri geçersiz — Firebase Console'daki Service ID / Key ID / Team ID değerlerini kontrol edin",
    'auth/invalid-oauth-client-id':
      "Apple Service ID eşleşmiyor — Firebase Console → Apple provider içindeki Services ID değerini Apple Developer'daki değerle aynı yapın",
    'auth/unauthorized-domain':
      'Bu alan adı Apple girişi için yetkili değil — Firebase Console → Authentication → Authorized domains listesine ekleyin',
    'auth/account-exists-with-different-credential':
      'Bu e-posta zaten farklı bir yöntemle kayıtlı — eski yöntemle giriş yapın',
    'auth/credential-already-in-use':
      'Bu Apple hesabı zaten başka bir kullanıcıyla ilişkili',
    'auth/network-request-failed':
      'Ağ hatası — bağlantınızı kontrol edip tekrar deneyin',
    'auth/internal-error':
      "Apple bağlantı hatası — Apple Developer Service ID konfigürasyonunu doğrulayın ya da farklı tarayıcı/cihazdan deneyin",
    'auth/web-storage-unsupported':
      'Tarayıcı depolama desteklemiyor — çerezleri etkinleştirin',
    'auth/timeout': 'Apple ile giriş zaman aşımına uğradı — tekrar deneyin',
    'auth/too-many-requests': 'Çok fazla deneme — lütfen bekleyin ve tekrar deneyin',
    'auth/missing-or-invalid-nonce':
      'Apple giriş doğrulaması başarısız — uygulamayı yeniden başlatıp deneyin',
    'auth/user-disabled': 'Bu hesap devre dışı bırakılmış',
    'auth/requires-recent-login': 'Devam etmek için tekrar giriş yapın',
    'permission-denied':
      'Hesap kaydı oluşturulamadı — Firestore izin hatası (Apple ilk girişte profil yazımı engellendi)',
    // Capacitor / internal-error variants
    'UNAVAILABLE':
      'Apple ile giriş şu anda kullanılamıyor — tekrar deneyin',
    'internal-error':
      'Apple bağlantı hatası — tekrar deneyin',
  }

  if (messages[code]) return messages[code]

  // SIGN_IN_FAILED — native plugin hatası
  // Kapasitör 8 custom code'u 'SIGN_IN_FAILED' yerine undefined/'UNAVAILABLE' olarak
  // iletebilir; bu yüzden hem code hem de message'ı kontrol ediyoruz.
  const isNativeFailure =
    code === 'SIGN_IN_FAILED' ||
    code === 'UNAVAILABLE' ||
    message.includes('SIGN_IN_FAILED') ||
    message.includes('AuthorizationError') ||
    message.includes('ASAuthorizationError')

  if (isNativeFailure) {
    // Attempt to extract the ASAuthorizationError code embedded in the message:
    // Format: "SIGN_IN_FAILED:<errorCode>:<localizedDescription>"
    const asMatch = message.match(/SIGN_IN_FAILED:(\d+):/)
    if (asMatch) {
      const errNum = asMatch[1]
      switch (errNum) {
        case '1001': return null // canceled — already handled above but belt-and-suspenders
        case '1004': return 'Apple ile giriş açılamadı — uygulamayı kapatıp yeniden açın ve tekrar deneyin'
        default: return `Apple ile giriş başarısız oldu (Hata ${errNum}) — tekrar deneyin`
      }
    }
    return 'Apple ile giriş şu anda kullanılamıyor — tekrar deneyin'
  }

  if (code) {
    return `Apple ile giriş başarısız oldu — tekrar deneyin`
  }
  if (message.trim()) {
    return `Apple ile giriş başarısız oldu — tekrar deneyin`
  }
  return 'Apple ile giriş başarısız oldu'
}
