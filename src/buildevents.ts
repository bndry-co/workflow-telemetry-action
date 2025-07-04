import * as fs from 'fs'
import * as path from 'path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import * as logfmt from 'logfmt'
import * as util from './util'

export async function install(
  apikey: string,
  apihost: string,
  dataset: string
): Promise<void> {
  core.info('Downloading and installing buildevents')

  const url = `https://github.com/honeycombio/buildevents/releases/latest/download/${util.constructExecutableName()}`
  core.info(`Downloading from ${url}`)

  const downloadPath = await tc.downloadTool(url)

  // rename downloaded binary - downloadPath is similar to a UUID by default
  const toolPath = path.join(path.dirname(downloadPath), 'buildevents')
  await io.mv(downloadPath, toolPath)

  // make executable and add to path
  await exec.exec(`chmod +x ${toolPath}`)
  core.addPath(path.dirname(toolPath))

  util.setEnv('BUILDEVENT_APIKEY', apikey)
  util.setEnv('BUILDEVENT_APIHOST', apihost)
  util.setEnv('BUILDEVENT_DATASET', dataset)
  util.setEnv('BUILDEVENT_CIPROVIDER', 'workflow-step-telemetry')
}

export function addFields(keyValueMap: Record<string, string>): void {
  const BUILDEVENT_FILE = 'BUILDEVENT_FILE'

  let envPath = util.getEnv(BUILDEVENT_FILE)
  if (!envPath) {
    envPath = path.resolve('../buildevents.txt')
    util.setEnv(BUILDEVENT_FILE, envPath)
  }
  // Add the existing values from the BUILDEVENT_FILE to the fields we write out
  // this deliberately lets existing values - presumably from the workflow - override
  // the defaults we set.
  if (fs.existsSync(envPath)) {
    Object.assign(
      keyValueMap,
      logfmt.parse(fs.readFileSync(envPath).toString())
    )
  }
  fs.writeFileSync(envPath, logfmt.stringify(keyValueMap))
}

export async function build(
  buildId: string,
  buildStart: string,
  result: string
): Promise<string | null> {
  return await buildeventsExecWithOutput('build', buildId, buildStart, result)
}

export async function step(
  buildId: string,
  stepId: string,
  startTime: string,
  name: string
): Promise<void> {
  await buildeventsExec('step', buildId, stepId, startTime, name)
}

export async function cmd(
  buildId: string,
  stepId: string,
  name: string,
  command: string
): Promise<void> {
  await buildeventsExec('cmd', buildId, stepId, name, '--', command)
}

export async function buildeventsExec(
  command: string,
  ...args: string[]
): Promise<void> {
  const ret = await exec.exec(`buildevents ${command} ${args.join(' ')}`)
  if (ret !== 0) {
    throw new Error(`Could not execute 'buildevents ${command}'`)
  }
}

export async function buildeventsExecWithOutput(
  command: string,
  ...args: string[]
): Promise<string | null> {
  let output = ''
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }
  }

  const ret = await exec.exec(
    `buildevents ${command} ${args.join(' ')}`,
    [],
    options
  )

  if (ret !== 0) {
    throw new Error(`Could not execute 'buildevents ${command}'`)
  }

  return output.trim() || null
}
