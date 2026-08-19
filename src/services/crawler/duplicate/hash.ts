import { createHash } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function normalizeForHash(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function contentHashOf(bodyText: string): string {
  return sha256Hex(normalizeForHash(bodyText))
}

export function titleHashOf(title: string): string {
  return sha256Hex(normalizeForHash(title))
}

export function tokenize(text: string): string[] {
  return normalizeForHash(text)
    .split(' ')
    .filter((token) => token.length > 2)
}

/** 64-bit SimHash as 16-char hex. Cheap near-duplicate signal — no embeddings. */
export function simhashOf(text: string): string {
  const tokens = tokenize(text)
  if (!tokens.length) return '0'.repeat(16)
  const counts = new Array<number>(64).fill(0)
  for (const token of tokens) {
    const digest = createHash('sha256').update(token).digest()
    for (let bit = 0; bit < 64; bit++) {
      const byte = digest[Math.floor(bit / 8)]
      const on = (byte >> (7 - (bit % 8))) & 1
      counts[bit] += on ? 1 : -1
    }
  }
  let hi = BigInt(0)
  for (let bit = 0; bit < 64; bit++) {
    if (counts[bit] >= 0) hi |= BigInt(1) << BigInt(63 - bit)
  }
  return hi.toString(16).padStart(16, '0')
}

export function hammingHex64(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64
  const x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let dist = 0
  let n = x
  while (n > BigInt(0)) {
    n &= n - BigInt(1)
    dist += 1
  }
  return dist
}

export function jaccardTokens(a: string, b: string): number {
  const sa = new Set(tokenize(a))
  const sb = new Set(tokenize(b))
  if (!sa.size && !sb.size) return 1
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const token of sa) if (sb.has(token)) inter += 1
  return inter / (sa.size + sb.size - inter)
}
