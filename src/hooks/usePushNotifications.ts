'use client'

import { useCallback, useEffect, useState } from 'react'
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
    setState((s) => ({ ...s, loading: true }))
    const result = await subscribeToPush()
    setState((s) => ({
      ...s,
      loading: false,
      permission: result.permission,
      subscribed: result.success,
    }))
    return result
  }, [])

  const unsubscribe = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    await unsubscribeFromPush()
    setState((s) => ({ ...s, loading: false, subscribed: false }))
  }, [])

  return { ...state, subscribe, unsubscribe }
}
