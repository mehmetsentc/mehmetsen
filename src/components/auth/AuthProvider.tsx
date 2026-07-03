'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User as FirebaseUser } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, ensureAuthReady } from '@/lib/firebase/auth'
import { completeGoogleRedirectSignIn } from '@/lib/googleAuth'
import { authService, finalizeGoogleSignIn } from '@/services/authService'
// Apple redirect aynı getRedirectResult'ı paylaşır; ekstra çağrı gerekmez.
import { devLog, withTimeout } from '@/lib/asyncUtils'
import type { LoginFormData, RegisterFormData } from '@/lib/validators/auth'
import type { User } from '@/types/user'
import {
  applyAdminBootstrap,
  syncCmsRoleFromServer,
} from '@/lib/admin'
import { EulaModal } from '@/components/auth/EulaModal'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'

const PROFILE_TIMEOUT_MS = 8_000

interface AuthContextValue {
  user: User | null
  /** True until persisted Firebase session is restored on first load. */
  loading: boolean
  login: (data: LoginFormData) => ReturnType<typeof authService.login>
  register: (data: RegisterFormData) => ReturnType<typeof authService.register>
  loginWithGoogle: () => ReturnType<typeof authService.loginWithGoogle>
  loginWithApple: () => ReturnType<typeof authService.loginWithApple>
  logout: () => ReturnType<typeof authService.logout>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function buildFallbackUser(firebaseUser: FirebaseUser): User {
  const email = firebaseUser.email ?? ''
  const base = email.split('@')[0] || firebaseUser.uid.slice(0, 8)
  const username = base.replace(/[^a-z0-9_]/gi, '_').toLowerCase()

  const baseUser: User = {
    uid: firebaseUser.uid,
    username,
    displayName: firebaseUser.displayName ?? username,
    email,
    photoURL: firebaseUser.photoURL,
    bio: null,
    website: null,
    location: null,
    role: 'user',
    isVerified: false,
    isBlocked: false,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    // Fallback users are built only when the profile doc fails to load; assume
    // onboarding is complete so we never trap a user during an error state.
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return applyAdminBootstrap(baseUser)
}

async function refreshProfileAfterCmsSync(
  firebaseUser: FirebaseUser,
  mounted: boolean,
  setUser: (user: User | null) => void
): Promise<void> {
  try {
    const token = await firebaseUser.getIdToken()
    await syncCmsRoleFromServer(token)
    if (!mounted) return
    const refreshed = await authService.getUserProfile(firebaseUser.uid)
    if (refreshed) {
      setUser(applyAdminBootstrap(refreshed))
    }
  } catch {
    // Profile refresh is best-effort after CMS sync.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined

    const handleAuthUser = async (firebaseUser: FirebaseUser | null) => {
      if (!mounted) return

      if (!firebaseUser) {
        setUser(null)
        return
      }

      setUser(applyAdminBootstrap(buildFallbackUser(firebaseUser)))

      try {
        const profile = await withTimeout(
          authService.getUserProfile(firebaseUser.uid),
          PROFILE_TIMEOUT_MS,
          'getUserProfile'
        )
        if (mounted && profile) {
          setUser(applyAdminBootstrap(profile))
        }
        void refreshProfileAfterCmsSync(firebaseUser, mounted, setUser)
        devLog('AuthProvider', 'profile loaded', {
          uid: firebaseUser.uid,
          found: !!profile,
        })
      } catch (error) {
        console.error('[AuthProvider] Failed to load user profile:', error)
      }
    }

    void (async () => {
      try {
        const redirectResult = await completeGoogleRedirectSignIn(auth)
        if (redirectResult?.user) {
          void finalizeGoogleSignIn(redirectResult.user)
        }

        await ensureAuthReady()
      } catch (error) {
        console.error('[AuthProvider] Auth bootstrap failed:', error)
      }

      if (!mounted) return

      // Keep loading=true until the first handleAuthUser call fully completes (profile
      // fetched from Firestore). This prevents AdminGuard from briefly seeing the
      // fallback user (role='user') and firing the "admin yetkisi gerekli" toast.
      let firstHandled = false
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        devLog('AuthProvider', 'auth state changed', { uid: firebaseUser?.uid ?? null })
        void handleAuthUser(firebaseUser).finally(() => {
          if (mounted && !firstHandled) {
            firstHandled = true
            setLoading(false)
          }
        })
      })
    })()

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const login = useCallback(
    (data: LoginFormData) => authService.login(data.email, data.password),
    []
  )

  const register = useCallback(
    (data: RegisterFormData) =>
      authService.register(data.email, data.password, data.username, data.displayName),
    []
  )

  const loginWithGoogle = useCallback(() => authService.loginWithGoogle(), [])

  const loginWithApple = useCallback(() => authService.loginWithApple(), [])

  const logout = useCallback(() => authService.logout(), [])

  const refreshUser = useCallback(async () => {
    const current = auth.currentUser
    if (!current) {
      setUser(null)
      return
    }
    try {
      const profile = await authService.getUserProfile(current.uid)
      setUser(applyAdminBootstrap(profile ?? buildFallbackUser(current)))
    } catch (error) {
      console.error('[AuthProvider] Failed to refresh user profile:', error)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      loginWithApple,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, loginWithGoogle, loginWithApple, logout, refreshUser]
  )

  // EULA — kullanıcı giriş yaptıysa ama koşulları kabul etmediyse modal göster
  const needsEula = !!user && !loading && !user.termsAcceptedAt

  const acceptTerms = async () => {
    const current = auth.currentUser
    if (!current) return
    const now = new Date().toISOString()
    await updateDoc(doc(db, Collections.USERS, current.uid), {
      termsAcceptedAt: serverTimestamp(),
    })
    // Firestore refresh beklemeden local state'i anında güncelle —
    // needsEula false'a döner ve modal unmount edilir.
    setUser(prev => prev ? { ...prev, termsAcceptedAt: now } : null)
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      {needsEula && <EulaModal onAccept={acceptTerms} />}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
