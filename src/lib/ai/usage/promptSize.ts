/**
 * Prompt size accounting without storing prompt or article text.
 * Heuristic: ~4 characters per token (same order of magnitude as tiktoken for mixed TR/EN).
 */

export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0
  return Math.ceil(chars / 4)
}

export type Stage1PromptPartSizes = {
  systemChars: number
  sourceChars: number
  instructionChars: number
  otherChars: number
  systemTokens: number
  sourceTokens: number
  instructionTokens: number
  otherTokens: number
  totalChars: number
  totalTokens: number
}

/**
 * Split Stage1 prompt into system / source article / instructions / other.
 * Returns counts only — never the strings.
 */
export function measureStage1PromptParts(input: {
  systemContent: string
  userContent: string
  sourceArticle: string
}): Stage1PromptPartSizes {
  const systemChars = input.systemContent.length
  const sourceChars = input.sourceArticle.length
  const userChars = input.userContent.length
  const userMinusSource = Math.max(0, userChars - sourceChars)

  const jsonIdx = input.userContent.lastIndexOf('\nJSON:')
  const rewriteIdx = input.userContent.indexOf('YENİDEN DÜZENLEME GÖREVİ:')
  let instructionChars = 0
  if (jsonIdx >= 0) instructionChars += userChars - jsonIdx
  if (rewriteIdx >= 0) {
    const rewriteEnd = jsonIdx >= 0 ? jsonIdx : userChars
    instructionChars += Math.max(0, rewriteEnd - rewriteIdx)
  }
  const gazeteIdx = input.userContent.indexOf('GAZETE HABERİ yaz')
  if (gazeteIdx >= 0 && (jsonIdx < 0 || gazeteIdx < jsonIdx)) {
    const end = jsonIdx >= 0 ? jsonIdx : userChars
    instructionChars += Math.max(0, end - gazeteIdx)
  }
  instructionChars = Math.min(userMinusSource, instructionChars)
  const otherChars = Math.max(0, userMinusSource - instructionChars)

  const systemTokens = estimateTokensFromChars(systemChars)
  const sourceTokens = estimateTokensFromChars(sourceChars)
  const instructionTokens = estimateTokensFromChars(instructionChars)
  const otherTokens = estimateTokensFromChars(otherChars)

  return {
    systemChars,
    sourceChars,
    instructionChars,
    otherChars,
    systemTokens,
    sourceTokens,
    instructionTokens,
    otherTokens,
    totalChars: systemChars + userChars,
    totalTokens: systemTokens + sourceTokens + instructionTokens + otherTokens,
  }
}
