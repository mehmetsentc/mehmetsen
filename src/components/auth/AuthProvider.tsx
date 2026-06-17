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
import type { User as FirebaseUser } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { authService } from '@/services/authService'
import { devLog, withTimeout } from '@/lib/asyncUtils'
import type { LoginFormData, RegisterFormData } from '@/lib/validators/auth'
import type { User } from '@/types/user'
import {
  applyAdminBootstrap,
  syncCmsRoleFromServer,
} from '@/lib/admin'

const AUTH_TIMEOUT_MS = 8_000

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (data: LoginFormData) => ReturnType<typeof authService.login>
  register: (data: RegisterFormData) => ReturnType<typeof authService.register>
  loginWithGoogle: () => ReturnType<typeof authService.loginWithGoogle>
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
  const initialAuthResolved = useRef(false)

  useEffect(() => {
    let mounted = true

    const resolveInitialLoading = () => {
      if (!initialAuthResolved.current && mounted) {
        initialAuthResolved.current = true
        setLoading(false)
        devLog('AuthProvider', 'initial auth resolved')
      }
    }

    const authTimeout = setTimeout(() => {
      console.warn('[AuthProvider] Auth state timeout — forcing loading to false')
      resolveInitialLoading()
    }, AUTH_TIMEOUT_MS)

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      devLog('AuthProvider', 'auth state changed', { uid: firebaseUser?.uid ?? null })

      try {
        if (firebaseUser) {
          const profile = await withTimeout(
            authService.getUserProfile(firebaseUser.uid),
            AUTH_TIMEOUT_MS,
            'getUserProfile'
          )
          const resolved = applyAdminBootstrap(profile ?? buildFallbackUser(firebaseUser))
          if (mounted) {
            setUser(resolved)
          }
          void refreshProfileAfterCmsSync(firebaseUser, mounted, setUser)
          devLog('AuthProvider', 'profile loaded', {
            uid: firebaseUser.uid,
            found: !!profile,
            fallback: !profile,
            admin: resolved.role === 'admin',
          })
        } else if (mounted) {
          setUser(null)
        }
      } catch (error) {
        console.error('[AuthProvider] Failed to load user profile:', error)
        if (mounted) {
          setUser(firebaseUser ? applyAdminBootstrap(buildFallbackUser(firebaseUser)) : null)
        }
      } finally {
        resolveInitialLoading()
        clearTimeout(authTimeout)
      }
    })

    return () => {
      mounted = false
      clearTimeout(authTimeout)
      unsubscribe()
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
      logout,
      refreshUser,
    }),
    [user, loading, login, register, loginWithGoogle, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
