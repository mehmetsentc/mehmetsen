/**
 * AES-256-GCM encryption for Gmail refresh tokens stored in Firestore.
 * Key sourced from GMAIL_TOKEN_ENCRYPTION_KEY env var (32-byte hex string).
 * Fail-closed: throws if key is missing in production.
 */
import 'server-only'

function getKey(): Buffer {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length < 64) {
    throw new Error('[gmail/crypto] GMAIL_TOKEN_ENCRYPTION_KEY is missing or too short')
  }
  return Buffer.from(hex.slice(0, 64), 'hex')
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = getKey()
  const { createCipheriv, randomBytes } = await import('crypto')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(12):tag(16):ciphertext — all hex
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export async function decrypt(ciphertext: string): Promise<string> {
  const key = getKey()
  const { createDecipheriv } = await import('crypto')
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('[gmail/crypto] Invalid ciphertext format')
  const [ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}
