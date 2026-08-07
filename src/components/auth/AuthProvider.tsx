'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import type { User as FirebaseUser } from 'firebase/auth'
import type { LoginFormData, RegisterFormData } from '@/lib/validators/auth'
import type { User } from '@/types/user'
import { applyAdminBootstrap, syncCmsRoleFromServer } from '@/lib/admin'
import { EulaModal } from '@/components/auth/EulaModal'
import { isPublicRoute, ROUTES } from '@/constants/routes'
import { devLog, withTimeout } from '@/lib/asyncUtils'

const PROFILE_TIMEOUT_MS = 8_000
const PUBLIC_AUTH_IDLE_TIMEOUT_MS = 2_500

interface AuthContextValue {
  user: User | null
  /** True until persisted Firebase session is restored on first load. */
  loading: boolean
  login: (data: LoginFormData) => Promise<unknown>
  register: (data: RegisterFormData) => Promise<unknown>
  loginWithGoogle: () => Promise<unknown>
  loginWithApple: () => Promise<unknown>
  logout: () => Promise<unknown>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function shouldDeferAuthBootstrap(pathname: string): boolean {
  if (pathname === ROUTES.LOGIN || pathname === ROUTES.REGISTER) return false
  if (pathname === ROUTES.ONBOARDING) return false
  if (pathname.startsWith('/admin')) return false
  return isPublicRoute(pathname)
}

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
    const { authService } = await import('@/services/authService')
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
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const resumeBootstrapRef = useRef<(() => void) | null>(null)

  // If the user navigates to login/admin while public auth is still deferred, start immediately.
  useEffect(() => {
    if (!shouldDeferAuthBootstrap(pathname)) {
      resumeBootstrapRef.current?.()
    }
  }, [pathname])

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined
    const initialPath = pathname

    void (async () => {
      if (shouldDeferAuthBootstrap(initialPath)) {
        await new Promise<void>((resolve) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            resumeBootstrapRef.current = null
            window.removeEventListener('pointerdown', finish)
            window.removeEventListener('keydown', finish)
            window.removeEventListener('touchstart', finish)
            if (idleId != null && typeof window.cancelIdleCallback === 'function') {
              window.cancelIdleCallback(idleId)
            }
            if (timer != null) clearTimeout(timer)
            resolve()
          }

          resumeBootstrapRef.current = finish
          window.addEventListener('pointerdown', finish, { once: true })
          window.addEventListener('keydown', finish, { once: true })
          window.addEventListener('touchstart', finish, { once: true, passive: true })

          let idleId: number | null = null
          let timer: ReturnType<typeof setTimeout> | null = null
          if (typeof window.requestIdleCallback === 'function') {
            idleId = window.requestIdleCallback(finish, { timeout: PUBLIC_AUTH_IDLE_TIMEOUT_MS })
          } else {
            timer = setTimeout(finish, Math.min(PUBLIC_AUTH_IDLE_TIMEOUT_MS, 1500))
          }
        })
      }
      if (!mounted) return

      try {
        const [
          { onAuthStateChanged },
          { auth, ensureAuthReady },
          { completeGoogleRedirectSignIn },
          { authService, finalizeGoogleSignIn },
        ] = await Promise.all([
          import('firebase/auth'),
          import('@/lib/firebase/auth'),
          import('@/lib/googleAuth'),
          import('@/services/authService'),
        ])

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
      } catch (error) {
        console.error('[AuthProvider] Failed to load auth runtime:', error)
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
      resumeBootstrapRef.current = null
      unsubscribe?.()
    }
    // Bootstrap once per mount — intentional empty deps; pathname only gates deferral.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (data: LoginFormData) => {
    const { authService } = await import('@/services/authService')
    return authService.login(data.email, data.password)
  }, [])

  const register = useCallback(async (data: RegisterFormData) => {
    const { authService } = await import('@/services/authService')
    return authService.register(data.email, data.password, data.username, data.displayName)
  }, [])

  const loginWithGoogle = useCallback(async () => {
    const { authService } = await import('@/services/authService')
    return authService.loginWithGoogle()
  }, [])

  const loginWithApple = useCallback(async () => {
    const { authService } = await import('@/services/authService')
    const result = await authService.loginWithApple()
    // finalizeAppleSignIn tamamlandığında Firestore doc garantili yazılmış olur.
    // refreshUser çağırarak state'i doğru username ile güncelle; yoksa
    // buildFallbackUser'ın farklı username'i Navbar'da yanlış profil URL'ine yol açar.
    if (result !== null) {
      await refreshUser()
    }
    return result
  }, [refreshUser])

  const logout = useCallback(async () => {
    const { authService } = await import('@/services/authService')
    return authService.logout()
  }, [])

  const refreshUser = useCallback(async () => {
    const [{ auth }, { authService }] = await Promise.all([
      import('@/lib/firebase/auth'),
      import('@/services/authService'),
    ])
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
    const [{ auth }, { db, Collections }, { doc, updateDoc, serverTimestamp }] = await Promise.all([
      import('@/lib/firebase/auth'),
      import('@/lib/firebase/firestore'),
      import('firebase/firestore'),
    ])
    const current = auth.currentUser
    if (!current) {
      throw new Error('Oturum bulunamadı — lütfen yeniden giriş yapın')
    }

    const now = new Date().toISOString()

    try {
      await updateDoc(doc(db, Collections.USERS, current.uid), {
        termsAcceptedAt: serverTimestamp(),
      })
    } catch (clientErr) {
      // Client write başarısız olursa Bearer token ile API fallback
      console.warn('[AuthProvider] client acceptTerms failed, trying API:', clientErr)
      const idToken = await current.getIdToken()
      const res = await fetch('/api/user/accept-terms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) {
        throw new Error(`accept-terms failed (${res.status})`)
      }
    }

    // Firestore refresh beklemeden local state'i anında güncelle —
    // needsEula false'a döner ve modal unmount edilir.
    setUser((prev) => (prev ? { ...prev, termsAcceptedAt: now } : null))
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
