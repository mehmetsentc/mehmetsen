import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function createProcessTempDir(jobId: string): Promise<string> {
  const dir = join(tmpdir(), `vl-process-${jobId}`)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function cleanupTempDir(dir: string | null | undefined): Promise<void> {
  if (!dir) return
  await rm(dir, { recursive: true, force: true })
}
