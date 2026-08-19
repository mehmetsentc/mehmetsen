/**
 * Static billed-request audit of the existing newsroom pipeline for ONE event.
 * No paid provider calls. Numbers are from code inspection (Phase 2L/2J compatible).
 *
 * Typical path (skipAiRewrite=false):
 *   Stage1 writer          1 DeepSeek (source_once pack)
 *   Stage1 HTTP retry      0 typical / 1 if 429/empty
 *   Quality rewrite loop   0 typical / up to NEWSROOM_REWRITE_MAX_RETRIES (default 2)
 *   Stage2 quickFactCheck  0 billed (heuristic)
 *   Stage3 category        1 DeepSeek (heuristic fallback possible; reused on quality_retry)
 *   FactChecker.check      1 DeepSeek
 *   classifyArticleCategory 1 DeepSeek (optional yerel/kibris extras)
 *   Chief editor           1 DeepSeek
 *   Stage4 gate            0 billed (heuristic)
 *
 * STAGE1_FAIL_FAST_ENABLED: after a short/incomplete Stage1, Stage3 + listed
 * downstream agents are skipped; settlement must use actual, not reserved max.
 */
export const NEWSROOM_PIPELINE_AUDIT = {
  stage1Min: 1,
  stage1Typical: 1,
  stage1WorstBounded: 1 + 1 + 2,
  continuationTypical: 0,
  continuationWorst: 1,
  stage3Min: 0,
  stage3Typical: 1,
  stage3Worst: 1,
  factCheckerMin: 0,
  factCheckerTypical: 1,
  factCheckerWorst: 1,
  classifierMin: 0,
  classifierTypical: 1,
  classifierWorst: 3,
  chiefMin: 0,
  chiefTypical: 1,
  chiefWorst: 1,
  otherDeepSeekTypical: 0,
  otherDeepSeekWorst: 1,
} as const

export function pipelineRequestBounds() {
  const a = NEWSROOM_PIPELINE_AUDIT
  return {
    minRequestsPerEvent: a.stage1Min + a.stage3Min + a.factCheckerMin + a.classifierMin + a.chiefMin,
    typicalRequestsPerEvent:
      a.stage1Typical +
      a.stage3Typical +
      a.factCheckerTypical +
      a.classifierTypical +
      a.chiefTypical,
    worstBoundedRequestsPerEvent:
      a.stage1WorstBounded +
      a.continuationWorst +
      a.stage3Worst +
      a.factCheckerWorst +
      a.classifierWorst +
      a.chiefWorst +
      a.otherDeepSeekWorst,
  }
}

export function pipelineTokenBounds(inputTokens: number, outputTokens: number) {
  const req = pipelineRequestBounds()
  const perCall = inputTokens + outputTokens
  return {
    minTokensPerEvent: perCall * req.minRequestsPerEvent,
    typicalTokensPerEvent: perCall * req.typicalRequestsPerEvent,
    worstBoundedTokensPerEvent: perCall * req.worstBoundedRequestsPerEvent,
  }
}
