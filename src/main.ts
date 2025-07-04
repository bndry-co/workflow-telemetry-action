import * as core from '@actions/core'
import * as stepTracer from './stepTracer'
import * as buildevents from './buildevents'
import * as util from './util'
import * as logger from './logger'

async function run(): Promise<void> {
  try {
    logger.info(`Initializing ...`)

    const buildStart = util.getTimestamp()
    const traceId = util.buildTraceId()

    core.info(`Trace ID: ${traceId}`)
    // set TRACE_ID to be used throughout the job
    util.setEnv('TRACE_ID', traceId)

    const apikey = core.getInput('apikey', { required: true })
    core.setSecret(apikey)
    // defaults to api.honeycomb.io
    const apihost = core.getInput('apihost')
    const dataset = core.getInput('dataset', { required: true })

    await buildevents.install(apikey, apihost, dataset)

    buildevents.addFields({
      // available environment variables
      // https://docs.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
      'github.workflow': util.getEnv('GITHUB_WORKFLOW'),
      'github.run_id': util.getEnv('GITHUB_RUN_ID'),
      'github.run_number': util.getEnv('GITHUB_RUN_NUMBER'),
      'github.actor': util.getEnv('GITHUB_ACTOR'),
      'github.repository': util.getEnv('GITHUB_REPOSITORY'),
      'github.repository_owner': util.getEnv('GITHUB_REPOSITORY_OWNER'), // undocumented
      'github.event_name': util.getEnv('GITHUB_EVENT_NAME'),
      'github.sha': util.getEnv('GITHUB_SHA'),
      'github.ref': util.getEnv('GITHUB_REF'),
      'github.head_ref': util.getEnv('GITHUB_HEAD_REF'),
      'github.base_ref': util.getEnv('GITHUB_BASE_REF'),
      'github.job': util.getEnv('GITHUB_JOB'), // undocumented
      'github.matrix-key': core.getInput('matrix-key'),
      'runner.os': util.getEnv('RUNNER_OS'), // undocumented
      'meta.source': 'workflow-step-telemetry'
    })

    // create a first step to time installation of buildevents
    const initStepComponents = [
      'workflow-step-telemetry_init',
      util.getEnv('GITHUB_JOB'),
      core.getInput('matrix-key')
    ]
    await buildevents.step(
      traceId,
      util.randomInt(2 ** 32).toString(),
      buildStart.toString(),
      util.replaceSpaces(initStepComponents.filter(value => value).join('-'))
    )

    core.info('Init done! buildevents is now available on the path.')

    // save buildStart to be used in the post section
    core.saveState('buildStart', buildStart.toString())
    core.saveState('isPost', 'true')
    core.saveState('endTrace', 'true')

    // Start step tracer
    await stepTracer.start()

    logger.info(`Initialization completed`)
  } catch (error: any) {
    logger.error(error.message)
    core.setFailed(error.message)
  }
}

run()
