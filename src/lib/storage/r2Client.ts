/**
 * Cloudflare R2 storage provider via S3-compatible API.
 *
 * Required env:
 *   R2_ACCOUNT_ID        — Cloudflare account ID
 *   R2_ACCESS_KEY_ID     — R2 API token access key
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *   R2_BUCKET_NAME       — bucket name (e.g. "nahaber-media")
 *   R2_PUBLIC_URL        — public bucket URL (custom domain or r2.dev)
 */

import type { StorageProvider, StorageObject, StorageUploadOptions } from './types'

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME || 'nahaber-media'
  const publicUrl = process.env.R2_PUBLIC_URL

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.'
    )
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl }
}

function getEndpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`
}

async function signRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  config: ReturnType<typeof getR2Config>
): Promise<Record<string, string>> {
  const { AwsClient } = await import('aws4fetch')
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  const signed = await client.sign(url, {
    method,
    headers,
  })

  const signedHeaders: Record<string, string> = {}
  signed.headers.forEach((v: string, k: string) => {
    signedHeaders[k] = v
  })
  return signedHeaders
}

export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2' as const

  async upload(
    key: string,
    body: Buffer | ReadableStream | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageObject> {
    const config = getR2Config()
    const endpoint = getEndpoint(config.accountId)
    const url = `${endpoint}/${config.bucket}/${key}`

    const headers: Record<string, string> = {}
    if (options?.contentType) headers['content-type'] = options.contentType
    if (options?.cacheControl) headers['cache-control'] = options.cacheControl

    if (options?.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${k}`] = v
      }
    }

    const signedHeaders = await signRequest('PUT', url, headers, config)

    const res = await fetch(url, {
      method: 'PUT',
      headers: signedHeaders,
      body: body as BodyInit,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`R2 upload failed (${res.status}): ${text}`)
    }

    return {
      key,
      url: this.getPublicUrl(key),
      contentType: options?.contentType,
    }
  }

  getPublicUrl(key: string): string {
    const publicUrl = process.env.R2_PUBLIC_URL
    if (publicUrl) {
      return `${publicUrl.replace(/\/$/, '')}/${key}`
    }
    const bucket = process.env.R2_BUCKET_NAME || 'nahaber-media'
    return `https://${bucket}.r2.dev/${key}`
  }

  async delete(key: string): Promise<void> {
    const config = getR2Config()
    const endpoint = getEndpoint(config.accountId)
    const url = `${endpoint}/${config.bucket}/${key}`

    const signedHeaders = await signRequest('DELETE', url, {}, config)

    const res = await fetch(url, {
      method: 'DELETE',
      headers: signedHeaders,
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`R2 delete failed (${res.status})`)
    }
  }

  async exists(key: string): Promise<boolean> {
    const config = getR2Config()
    const endpoint = getEndpoint(config.accountId)
    const url = `${endpoint}/${config.bucket}/${key}`

    const signedHeaders = await signRequest('HEAD', url, {}, config)

    const res = await fetch(url, {
      method: 'HEAD',
      headers: signedHeaders,
    })

    return res.ok
  }
}
