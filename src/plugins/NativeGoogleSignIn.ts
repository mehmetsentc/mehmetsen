/**
 * NativeGoogleSignIn — native Capacitor iOS plugin bridge for official GoogleSignIn-iOS SDK.
 *
 * Uses official GoogleSignIn-iOS SDK to present the system Google account chooser on iOS.
 * Returns idToken, accessToken, userId, email, and name for Firebase Auth credential exchange.
 * On web, this plugin is not called — googleAuth.ts branches to Firebase popup/redirect.
 */
import { registerPlugin } from '@capacitor/core'

export interface NativeGoogleSignInResult {
  idToken: string
  accessToken: string
  userId?: string
  email?: string
  name?: string
  givenName?: string
  familyName?: string
  imageUrl?: string
}

export interface NativeGoogleSignInPlugin {
  signIn(): Promise<NativeGoogleSignInResult>
  signOut(): Promise<void>
}

const NativeGoogleSignIn = registerPlugin<NativeGoogleSignInPlugin>('NativeGoogleSignIn', {
  web: {
    signIn: () => Promise.reject(new Error('NativeGoogleSignIn is iOS only')),
    signOut: () => Promise.resolve(),
  },
})

export default NativeGoogleSignIn
