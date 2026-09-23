/**
 * SCALE P2 hardening — consecutive quality-gate unlock + daily cap.
 * Existing (non-scaleHardened) editors are unchanged.
 */

import type { AiEditorDocument, AiPublishPolicy } from '@/types/aiEditor'

export const SCALE_UNLOCK_THRESHOLD = 20
export const SCALE_INITIAL_MAX_DAILY_NEWS = 3
export const SCALE_UNLOCKED_MAX_DAILY_NEWS = 40

export function isScaleHardened(
  editor: Pick<AiEditorDocument, 'scaleHardened'> | null | undefined
): boolean {
  return editor?.scaleHardened === true
}

export function isScalePublishLocked(
  editor: Pick<
    AiEditorDocument,
    'scaleHardened' | 'consecutiveQualityGatePasses' | 'autoPublishUnlockThreshold' | 'publishPolicy'
  > | null | undefined
): boolean {
  if (!isScaleHardened(editor)) return false
  const have = editor?.consecutiveQualityGatePasses ?? 0
  const need = editor?.autoPublishUnlockThreshold ?? SCALE_UNLOCK_THRESHOLD
  return have < need
}

export function nextScaleGateState(
  editor: Pick<
    AiEditorDocument,
    | 'scaleHardened'
    | 'consecutiveQualityGatePasses'
    | 'autoPublishUnlockThreshold'
    | 'publishPolicy'
    | 'maxDailyNews'
  >,
  gatePassed: boolean
): {
  consecutiveQualityGatePasses: number
  publishPolicy: AiPublishPolicy
  maxDailyNews: number
  unlocked: boolean
} {
  if (!isScaleHardened(editor)) {
    return {
      consecutiveQualityGatePasses: editor.consecutiveQualityGatePasses ?? 0,
      publishPolicy: editor.publishPolicy,
      maxDailyNews: editor.maxDailyNews,
      unlocked: editor.publishPolicy === 'AUTO_PUBLISH',
    }
  }
  const need = editor.autoPublishUnlockThreshold ?? SCALE_UNLOCK_THRESHOLD
  const consecutive = gatePassed ? (editor.consecutiveQualityGatePasses ?? 0) + 1 : 0
  const unlocked = consecutive >= need
  return {
    consecutiveQualityGatePasses: consecutive,
    publishPolicy: unlocked ? 'AUTO_PUBLISH' : editor.publishPolicy,
    maxDailyNews: unlocked ? SCALE_UNLOCKED_MAX_DAILY_NEWS : SCALE_INITIAL_MAX_DAILY_NEWS,
    unlocked,
  }
}

export function isScaleDailyCapped(
  editor: Pick<AiEditorDocument, 'scaleHardened' | 'maxDailyNews' | 'scaleDailyNewsCount' | 'scaleDailyNewsYmd'>,
  todayYmd: string
): boolean {
  if (!isScaleHardened(editor)) return false
  if (editor.scaleDailyNewsYmd !== todayYmd) return false
  return (editor.scaleDailyNewsCount ?? 0) >= editor.maxDailyNews
}

export function nextScaleDailyCount(
  editor: Pick<AiEditorDocument, 'scaleDailyNewsCount' | 'scaleDailyNewsYmd'>,
  todayYmd: string
): { scaleDailyNewsCount: number; scaleDailyNewsYmd: string } {
  const count = editor.scaleDailyNewsYmd === todayYmd ? (editor.scaleDailyNewsCount ?? 0) + 1 : 1
  return { scaleDailyNewsCount: count, scaleDailyNewsYmd: todayYmd }
}

export const SCALE_HARDENED_CREATE_DEFAULTS = {
  scaleHardened: true as const,
  autoPublishUnlockThreshold: SCALE_UNLOCK_THRESHOLD,
  consecutiveQualityGatePasses: 0,
  publishPolicy: 'REQUIRES_APPROVAL' as const,
  maxDailyNews: SCALE_INITIAL_MAX_DAILY_NEWS,
  scaleDailyNewsCount: 0,
  scaleDailyNewsYmd: null as string | null,
}
