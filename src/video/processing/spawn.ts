import { spawn } from 'node:child_process'

export class SpawnTimeoutError extends Error {
  readonly code = 'TIMEOUT'
  constructor(message = 'Child process timed out') {
    super(message)
    this.name = 'SpawnTimeoutError'
  }
}

export class SpawnFailedError extends Error {
  readonly code: string
  readonly stderr: string
  constructor(code: string, stderr: string, message = code) {
    super(message)
    this.name = 'SpawnFailedError'
    this.code = code
    this.stderr = stderr
  }
}

export type SpawnRunResult = {
  stdout: string
  stderr: string
  code: number | null
}

export type SpawnRunOptions = {
  timeoutMs: number
  maxStderrBytes?: number
  maxStdoutBytes?: number
}

/**
 * argv spawn only — never shell interpolation.
 */
export function ffmpegBin(): string {
  const fromEnv = process.env.VIDEO_LIBRARY_FFMPEG_BIN?.trim()
  return fromEnv || 'ffmpeg'
}

export function ffprobeBin(): string {
  const fromEnv = process.env.VIDEO_LIBRARY_FFPROBE_BIN?.trim()
  return fromEnv || 'ffprobe'
}

export function cwebpBin(): string {
  const fromEnv = process.env.VIDEO_LIBRARY_CWEBP_BIN?.trim()
  return fromEnv || 'cwebp'
}

export function assertSafeSpawnArg(arg: string): string {
  if (arg.includes('\0')) throw new Error('INVALID_SPAWN_ARG')
  return arg
}

export async function runSpawn(
  binary: string,
  args: string[],
  opts: SpawnRunOptions
): Promise<SpawnRunResult> {
  const safeArgs = args.map(assertSafeSpawnArg)
  const maxStderr = opts.maxStderrBytes ?? 8_192
  const maxStdout = opts.maxStdoutBytes ?? 256_000

  return new Promise((resolve, reject) => {
    const child = spawn(binary, safeArgs, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, opts.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (stdout.length > maxStdout) stdout = stdout.slice(-maxStdout)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > maxStderr) stderr = stderr.slice(-maxStderr)
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new SpawnTimeoutError())
        return
      }
      resolve({ stdout, stderr, code })
    })
  })
}

export async function detectBinaryVersion(binary: string, timeoutMs = 8_000): Promise<string> {
  const result = await runSpawn(binary, ['-version'], { timeoutMs, maxStdoutBytes: 4_096 })
  if (result.code !== 0) {
    throw new SpawnFailedError('FFMPEG_MISSING', result.stderr, 'Binary version check failed')
  }
  return (result.stdout.split('\n')[0] ?? binary).trim()
}
