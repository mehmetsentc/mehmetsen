import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import type { AddressInfo } from 'node:net'

export type RangeObservation = {
  status: number
  acceptRanges: string | null
  contentType: string | null
  contentRange: string | null
  contentLength: string | null
  bodyBytes: number
}

export async function observeHttpRange(url: string, range = 'bytes=0-1023'): Promise<{
  head: RangeObservation
  rangedGet: RangeObservation
}> {
  const headRes = await fetch(url, { method: 'HEAD' })
  const getRes = await fetch(url, { method: 'GET', headers: { Range: range } })
  const body = Buffer.from(await getRes.arrayBuffer())
  return {
    head: {
      status: headRes.status,
      acceptRanges: headRes.headers.get('accept-ranges'),
      contentType: headRes.headers.get('content-type'),
      contentRange: headRes.headers.get('content-range'),
      contentLength: headRes.headers.get('content-length'),
      bodyBytes: 0,
    },
    rangedGet: {
      status: getRes.status,
      acceptRanges: getRes.headers.get('accept-ranges'),
      contentType: getRes.headers.get('content-type'),
      contentRange: getRes.headers.get('content-range'),
      contentLength: getRes.headers.get('content-length'),
      bodyBytes: body.byteLength,
    },
  }
}

/** Local static file server with Accept-Ranges / Range — used when R2 is not configured. */
export async function serveFileWithRange(filePath: string, contentType: string): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const size = statSync(filePath).size
  const server = createServer((req, res) => {
    const range = req.headers.range
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)
    if (!range) {
      res.setHeader('Content-Length', size)
      res.statusCode = 200
      createReadStream(filePath).pipe(res)
      return
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) {
      res.statusCode = 416
      res.end()
      return
    }
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Number(match[2]) : size - 1
    if (start >= size || end >= size || start > end) {
      res.statusCode = 416
      res.end()
      return
    }
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    res.setHeader('Content-Length', end - start + 1)
    createReadStream(filePath, { start, end }).pipe(res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${addr.port}/playback.mp4`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}
