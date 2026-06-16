'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  type PushPermission,
} from '@/lib/pushNotifications'

export interface PushState {
  supported: boolean
  permission: PushPermission
  subscribed: boolean
  loading: boolean
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: 'default',
    subscribed: false,
    loading: true,
  })

  useEffect(() => {
    const supported = isPushSupported()
    const permission = getPushPermission()

    if (!supported) {
      setState({ supported: false, permission: 'unsupported', subscribed: false, loading: false })
      return
    }

    isPushSubscribed().then((subscribed) => {
      setState({ supported: true, permission, subscribed, loading: false })
    })
  }, [])

  const subscribe = useCallback(async () => {
    if (!user) return { success: false, permission: 'default' as PushPermission, reason: 'Login required' }
    setState((s) => ({ ...s, loading: true }))
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) {
      setState((s) => ({ ...s, loading: false }))
      return { success: false, permission: 'default' as PushPermission, reason: 'Auth failed' }
    }
    const result = await subscribeToPush(idToken)
    setState((s) => ({
      ...s,
      loading: false,
      permission: result.permission,
      subscribed: result.success,
    }))
    return result
  }, [user])

  const unsubscribe = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    const idToken = await auth.currentUser?.getIdToken()
    if (idToken) await unsubscribeFromPush(idToken)
    setState((s) => ({ ...s, loading: false, subscribed: false }))
  }, [])

  return { ...state, subscribe, unsubscribe }
}
