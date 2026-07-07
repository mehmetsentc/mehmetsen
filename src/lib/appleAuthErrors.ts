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
 */

const SILENT_APPLE_AUTH_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
  'SIGN_IN_CANCELED',
  'SIGN_IN_IN_PROGRESS',
])

/** User-facing Turkish messages for Firebase Apple sign-in errors. */
export function getAppleAuthErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''

  if (SILENT_APPLE_AUTH_CODES.has(code)) return null

  const messages: Record<string, string> = {
    'auth/popup-blocked':
      'Tarayıcı Apple penceresini engelledi — yönlendirme deneniyor',
    'auth/operation-not-allowed':
      'Apple ile giriş henüz aktifleştirilmemiş — Firebase Console → Authentication → Sign-in method → Apple\'ı etkinleştirin',
    'auth/invalid-credential':
      'Apple kimlik bilgileri geçersiz — Firebase Console\'daki Service ID / Key ID / Team ID değerlerini kontrol edin',
    'auth/invalid-oauth-client-id':
      'Apple Service ID eşleşmiyor — Firebase Console → Apple provider içindeki Services ID değerini Apple Developer\'daki değerle aynı yapın',
    'auth/unauthorized-domain':
      'Bu alan adı Apple girişi için yetkili değil — Firebase Console → Authentication → Authorized domains listesine ekleyin',
    'auth/account-exists-with-different-credential':
      'Bu e-posta zaten farklı bir yöntemle kayıtlı — eski yöntemle giriş yapın',
    'auth/network-request-failed':
      'Ağ hatası — bağlantınızı kontrol edip tekrar deneyin',
    'auth/internal-error':
      'Apple bağlantı hatası — Apple Developer Service ID konfigürasyonunu doğrulayın ya da farklı tarayıcı/cihazdan deneyin',
    'auth/web-storage-unsupported':
      'Tarayıcı depolama desteklemiyor — çerezleri etkinleştirin',
    'auth/timeout': 'Apple ile giriş zaman aşımına uğradı — tekrar deneyin',
    'permission-denied':
      'Hesap kaydı oluşturulamadı — Firestore izin hatası (Apple ilk girişte profil yazımı engellendi)',
  }

  if (messages[code]) return messages[code]

  // SIGN_IN_FAILED — native plugin hatası
  if (code === 'SIGN_IN_FAILED' || message.includes('SIGN_IN_FAILED')) {
    return 'Apple ile giriş şu anda kullanılamıyor — tekrar deneyin'
  }

  if (code) {
    return 'Apple ile giriş başarısız oldu — tekrar deneyin'
  }
  if (message.trim()) {
    return 'Apple ile giriş başarısız oldu — tekrar deneyin'
  }
  return 'Apple ile giriş başarısız oldu'
}
