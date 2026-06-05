import { useAuthStore } from '@/store/authStore'
import { authService } from '@/services/authService'
import type { LoginFormData, RegisterFormData } from '@/lib/validators/auth'

export function useAuth() {
  const { user, loading } = useAuthStore()

  const login = (data: LoginFormData) =>
    authService.login(data.email, data.password)

  const register = (data: RegisterFormData) =>
    authService.register(data.email, data.password, data.username, data.displayName)

  const loginWithGoogle = () => authService.loginWithGoogle()

  const logout = () => authService.logout()

  return { user, loading, login, register, loginWithGoogle, logout }
}
