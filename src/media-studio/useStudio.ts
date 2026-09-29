'use client'

import { useSyncExternalStore } from 'react'
import { getStudioSession, subscribeStudio, type StudioSession } from './session'

export function useStudio(): StudioSession {
  return useSyncExternalStore(subscribeStudio, getStudioSession, getStudioSession)
}
