#!/usr/bin/env node
/**
 * Put CORS on the existing nahaber-media bucket via the S3-compatible API.
 * Does not create a bucket. Does not print credentials.
 *
 *   node --env-file=.env.local scripts/apply-r2-nahaber-media-cors.mjs
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rules = JSON.parse(await readFile(join(root, 'scripts/r2-nahaber-media-cors.json'), 'utf8'))

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function corsXml(policy) {
  const rulesXml = policy
    .map((rule) => {
      const origins = (rule.AllowedOrigins ?? []).map((o) => `<AllowedOrigin>${xmlEscape(o)}</AllowedOrigin>`).join('')
      const methods = (rule.AllowedMethods ?? []).map((m) => `<AllowedMethod>${xmlEscape(m)}</AllowedMethod>`).join('')
      const headers = (rule.AllowedHeaders ?? []).map((h) => `<AllowedHeader>${xmlEscape(h)}</AllowedHeader>`).join('')
      const expose = (rule.ExposeHeaders ?? []).map((h) => `<ExposeHeader>${xmlEscape(h)}</ExposeHeader>`).join('')
      const maxAge =
        typeof rule.MaxAgeSeconds === 'number' ? `<MaxAgeSeconds>${rule.MaxAgeSeconds}</MaxAgeSeconds>` : ''
      return `<CORSRule>${origins}${methods}${headers}${expose}${maxAge}</CORSRule>`
    })
    .join('')
  return `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${rulesXml}</CORSConfiguration>`
}

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET_NAME || 'nahaber-media'

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('R2 credentials missing (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).')
  process.exit(1)
}

const body = corsXml(rules)
const md5 = createHash('md5').update(body).digest('base64')
const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}?cors`
const { AwsClient } = await import('aws4fetch')
const client = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
})
const signed = await client.sign(url, {
  method: 'PUT',
  headers: {
    'content-type': 'application/xml',
    'content-md5': md5,
  },
  body,
})
const res = await fetch(signed)
if (!res.ok) {
  const text = await res.text()
  console.error(`CORS apply failed (${res.status})`)
  if (text) console.error(text.slice(0, 500))
  process.exit(1)
}
console.log(`CORS applied on existing bucket ${bucket}`)
console.log(
  `origins=${rules[0].AllowedOrigins.join(',')} methods=${rules[0].AllowedMethods.join(',')}`
)
