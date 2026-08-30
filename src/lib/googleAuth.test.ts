import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { signInWithGoogle } from '@/lib/googleAuth'
import type { Auth } from 'firebase/auth'

vi.mock('firebase/auth', () => {
  return {
    GoogleAuthProvider: class {
      static credential = vi.fn((idToken: string, accessToken: string | null) => ({
        providerId: 'google.com',
        signInMethod: 'google.com',
        idToken,
        accessToken,
      }))
    },
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
    signInWithCredential: vi.fn(),
    getRedirectResult: vi.fn(),
  }
})

vi.mock('@/plugins/NativeGoogleSignIn', () => {
  return {
    default: {
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
  }
})

describe('googleAuth provider handler', () => {
  const dummyAuth = {} as unknown as Auth
  let originalWindow: unknown

  beforeEach(() => {
    vi.clearAllMocks()
    originalWindow = globalThis.window
  })

  afterEach(() => {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow as typeof window
    } else {
      delete (globalThis as Record<string, unknown>).window
    }
  })

  it('uses Firebase popup on Web environment by default', async () => {
    globalThis.window = {} as unknown as typeof window
    const { signInWithPopup } = await import('firebase/auth')
    const mockUserCred = { user: { uid: 'web-user-123' } }
    vi.mocked(signInWithPopup).mockResolvedValueOnce(mockUserCred as never)

    const result = await signInWithGoogle(dummyAuth)
    expect(signInWithPopup).toHaveBeenCalledTimes(1)
    expect(result).toBe(mockUserCred)
  })

  it('uses NativeGoogleSignIn plugin and Firebase signInWithCredential on Capacitor environment', async () => {
    globalThis.window = {
      Capacitor: {
        isNativePlatform: () => true,
      },
    } as unknown as typeof window

    const { default: NativeGoogleSignIn } = await import('@/plugins/NativeGoogleSignIn')
    const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth')

    vi.mocked(NativeGoogleSignIn.signIn).mockResolvedValueOnce({
      idToken: 'mock-google-id-token',
      accessToken: 'mock-google-access-token',
      userId: '12345',
      email: 'user@example.com',
    })

    const mockCredResult = { user: { uid: 'native-user-123' } }
    vi.mocked(signInWithCredential).mockResolvedValueOnce(mockCredResult as never)

    const result = await signInWithGoogle(dummyAuth)

    expect(NativeGoogleSignIn.signIn).toHaveBeenCalledTimes(1)
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith(
      'mock-google-id-token',
      'mock-google-access-token'
    )
    expect(signInWithCredential).toHaveBeenCalledTimes(1)
    expect(result).toBe(mockCredResult)
  })

  it('translates native SIGN_IN_CANCELED error to auth/cancelled-popup-request', async () => {
    globalThis.window = {
      Capacitor: {
        isNativePlatform: () => true,
      },
    } as unknown as typeof window

    const { default: NativeGoogleSignIn } = await import('@/plugins/NativeGoogleSignIn')
    vi.mocked(NativeGoogleSignIn.signIn).mockRejectedValueOnce({
      code: 'SIGN_IN_CANCELED',
      message: 'Sign in cancelled',
    })

    await expect(signInWithGoogle(dummyAuth)).rejects.toMatchObject({
      code: 'auth/cancelled-popup-request',
    })
  })
})
