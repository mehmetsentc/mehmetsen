/**
 * Phase 4F.3 — safe deterministic schema normalize only.
 * No fabricate, no paid repair, no DeepSeek re-run.
 */

export type SafeNormalizeResult = {
  changed: boolean
  text: string
  actions: string[]
}

/**
 * Strip markdown fences / leading prose before JSON object/array.
 * Never invents fields or facts.
 */
export function safeNormalizeModelJsonText(raw: string): SafeNormalizeResult {
  const actions: string[] = []
  let text = (raw || '').trim()
  if (!text) return { changed: false, text: '', actions }

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fence) {
    text = fence[1].trim()
    actions.push('strip_markdown_fence')
  }

  const firstObj = text.indexOf('{')
  const firstArr = text.indexOf('[')
  let start = -1
  if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) start = firstObj
  else if (firstArr >= 0) start = firstArr
  if (start > 0) {
    text = text.slice(start)
    actions.push('trim_leading_prose')
  }

  // Trim trailing fence leftovers
  if (/```\s*$/.test(text)) {
    text = text.replace(/```\s*$/, '').trim()
    actions.push('trim_trailing_fence')
  }

  return { changed: actions.length > 0, text, actions }
}
