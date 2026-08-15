import { NextResponse } from 'next/server'
import { gmailClientErrorPayload, normalizeGmailError } from '@/lib/gmail/errors'

export function gmailJsonError(err: unknown): NextResponse {
  const n = normalizeGmailError(err)
  const payload = gmailClientErrorPayload(n)
  return NextResponse.json(payload, { status: n.httpStatus })
}
