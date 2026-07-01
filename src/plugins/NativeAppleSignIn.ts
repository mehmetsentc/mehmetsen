/**
 * NativeAppleSignIn — yerel Capacitor plugin
 *
 * iOS'ta ASAuthorizationAppleIDProvider üzerinden native "Sign in with Apple"
 * sheet'ini açar; identityToken + raw nonce döner.
 * Web'de bu plugin çağrılmaz — appleAuth.ts fallback olarak Firebase popup/redirect kullanır.
 */
import { registerPlugin } from '@capacitor/core'

export interface NativeAppleSignInResult {
  /** ASAuthorizationAppleIDCredential.user — kararlı kullanıcı kimliği */
  user: string
  /** JWT identity token — Firebase'e gönderilir */
  identityToken: string
  /** SHA-256 öncesi ham nonce — Firebase credential'ında kullanılır */
  nonce: string
  /** Yalnızca ilk girişte Apple tarafından döner; sonraki girişlerde boş */
  email?: string
  givenName?: string
  familyName?: string
  authorizationCode?: string
}

export interface NativeAppleSignInPlugin {
  authorize(): Promise<NativeAppleSignInResult>
}

const NativeAppleSignIn = registerPlugin<NativeAppleSignInPlugin>('NativeAppleSignIn', {
  // Web stub — bu ortamda hiç çağrılmamali; appleAuth.ts zaten dallanır
  web: {
    authorize: () => Promise.reject(new Error('NativeAppleSignIn is iOS only')),
  },
})

export default NativeAppleSignIn
