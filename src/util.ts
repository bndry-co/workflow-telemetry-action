import * as core from '@actions/core'
import * as os from 'os'
import md5 from 'md5'

export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

export function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}

export function getEnv(key: string): string {
  return process.env[key] || ''
}

export function setEnv(key: string, value: string): void {
  core.exportVariable(key, value)
}

export function replaceSpaces(input: string): string {
  return input.replace(/\s+/g, '_')
}

export function buildTraceId(): string {
  const traceComponents = [
    getEnv('GITHUB_REPOSITORY'),
    getEnv('GITHUB_WORKFLOW'),
    getEnv('GITHUB_RUN_NUMBER'),
    getEnv('GITHUB_RUN_ATTEMPT')
  ]
  const rawTraceId = replaceSpaces(
    traceComponents.filter(value => value).join('-')
  )
  const otelTraceIdFlag = core.getInput('otel-traceid').toLowerCase() === 'true'
  if (otelTraceIdFlag) {
    // md5 returns a 32-char hex string (128 bits)
    return md5(rawTraceId)
  }
  return rawTraceId
}

export function constructExecutableName(): string {
  const platform = os.platform()
  const arch = os.arch()

  let osName = ''
  let archName = ''

  switch (platform) {
    case 'win32':
      osName = 'windows'
      break
    case 'darwin':
      osName = 'darwin'
      break
    case 'linux':
      osName = 'linux'
      break
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }

  switch (arch) {
    case 'x64':
      archName = 'amd64'
      break
    case 'arm64':
      archName = 'arm64'
      break
    case 'ia32':
      archName = '386'
      break
    default:
      throw new Error(`Unsupported architecture: ${arch}`)
  }

  const extension = platform === 'win32' ? '.exe' : ''
  return `buildevents-${osName}-${archName}${extension}`
}
