let geminiSkipUntil = 0

export function isGeminiCircuitOpen(): boolean {
  return Date.now() < geminiSkipUntil
}

export function openGeminiCircuit(ms = 60_000): void {
  geminiSkipUntil = Date.now() + ms
}

export function resetGeminiCircuit(): void {
  geminiSkipUntil = 0
}
