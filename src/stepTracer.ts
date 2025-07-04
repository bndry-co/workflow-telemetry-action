import { WorkflowJobType } from './interfaces'
import * as buildevents from './buildevents'
import * as util from './util'
import * as logger from './logger'
import md5 from 'md5'

///////////////////////////

export async function start(): Promise<boolean> {
  logger.info(`Starting step tracer ...`)

  try {
    logger.info(`Started step tracer`)

    return true
  } catch (error: any) {
    logger.error('Unable to start step tracer')
    logger.error(error)

    return false
  }
}

export async function finish(currentJob: WorkflowJobType): Promise<boolean> {
  logger.info(`Finishing step tracer ...`)

  try {
    const traceId = util.buildTraceId()

    // Send step traces to Honeycomb using buildevents
    for (const step of currentJob.steps || []) {
      if (!step.started_at || !step.completed_at) {
        continue
      }

      const stepId = md5(`${step.name}-${step.number}`).substring(0, 8)
      const startTime = Math.floor(new Date(step.started_at).getTime() / 1000)
      const stepName = util.replaceSpaces(step.name)

      // Add additional fields for this step
      buildevents.addFields({
        'step.number': step.number?.toString() || '',
        'step.conclusion': step.conclusion || '',
        'step.status': step.status || ''
      })

      await buildevents.step(traceId, stepId, startTime.toString(), stepName)
    }

    logger.info(`Finished step tracer`)

    return true
  } catch (error: any) {
    logger.error('Unable to finish step tracer')
    logger.error(error)

    return false
  }
}
