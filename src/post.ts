import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/action'
import * as stepTracer from './stepTracer'
import * as buildevents from './buildevents'
import * as util from './util'
import * as logger from './logger'
import { WorkflowJobType } from './interfaces'

const { pull_request } = github.context.payload
const { workflow, job, repo, runId, sha } = github.context
const PAGE_SIZE = 100
const octokit: Octokit = new Octokit()

async function hidePreviousComments(excludeCommentId?: number): Promise<void> {
  if (!pull_request?.number) {
    return
  }

  try {
    // Get all comments on the PR
    const comments = await octokit.rest.issues.listComments({
      ...github.context.repo,
      issue_number: pull_request.number,
      per_page: 100
    })

    // Get current commit SHA
    const currentCommit = (pull_request && pull_request.head && pull_request.head.sha) || sha

    // Find comments made by this action for older commits, excluding the new comment
    const actionComments = comments.data.filter(comment => {
      const body = comment.body || ''
      
      // Check if it's a comment from this action
      const isActionComment = body.includes('### 🔍 Workflow Trace') && 
                             body.includes('📊 Open Trace in Honeycomb') &&
                             body.includes('## Workflow Step Trace -')
      
      if (!isActionComment || comment.id === excludeCommentId) {
        return false
      }
      
      // Extract commit SHA from comment body
      const commitMatch = body.match(/commit\/([a-f0-9]{40})/i)
      if (commitMatch) {
        const commentCommit = commitMatch[1]
        // Only hide if it's for a different (older) commit
        return commentCommit !== currentCommit
      }
      
      return false
    })

    // Hide each previous comment using GraphQL API
    for (const comment of actionComments) {
      try {
        await octokit.graphql(`
          mutation($commentId: ID!) {
            minimizeComment(input: {
              subjectId: $commentId,
              classifier: OUTDATED
            }) {
              minimizedComment {
                isMinimized
              }
            }
          }
        `, {
          commentId: comment.node_id
        })
        
        logger.debug(`Hidden comment from older commit: ${comment.id}`)
      } catch (error) {
        logger.debug(`Failed to hide comment ${comment.id}: ${error}`)
      }
    }
  } catch (error) {
    logger.debug(`Failed to hide previous comments: ${error}`)
  }
}

function generateTraceContent(
  currentJob: WorkflowJobType,
  traceUrl: string
): string {
  const stepCount = currentJob.steps?.length || 0
  const duration =
    currentJob.completed_at && currentJob.started_at
      ? Math.round(
          (new Date(currentJob.completed_at).getTime() -
            new Date(currentJob.started_at).getTime()) /
            1000
        )
      : 0

  const content = [
    '',
    '### 🔍 Workflow Trace',
    '',
    `View the complete execution trace for this workflow in Honeycomb:`,
    '',
    `**[📊 Open Trace in Honeycomb](${traceUrl})**`,
    '',
    `**Job Summary:**`,
    `- **Steps**: ${stepCount}`,
    `- **Duration**: ${duration}s`,
    `- **Status**: ${currentJob.conclusion || 'completed'}`,
    '',
    `This trace includes detailed timing and context for all ${stepCount} workflow steps.`
  ]

  return content.join('\n')
}



async function getCurrentJob(): Promise<WorkflowJobType | null> {
  const _getCurrentJob = async (): Promise<WorkflowJobType | null> => {
    for (let page = 0; ; page++) {
      const result = await octokit.rest.actions.listJobsForWorkflowRun({
        owner: repo.owner,
        repo: repo.repo,
        run_id: runId,
        per_page: PAGE_SIZE,
        page
      })
      const jobs: WorkflowJobType[] = result.data.jobs
      // If there are no jobs, stop here
      if (!jobs || !jobs.length) {
        break
      }
      const currentJobs = jobs.filter(
        it =>
          it.status === 'in_progress' &&
          it.runner_name === process.env.RUNNER_NAME
      )
      if (currentJobs && currentJobs.length) {
        return currentJobs[0]
      }
      // Since returning job count is less than page size, this means that there are no other jobs.
      // So no need to make another request for the next page.
      if (jobs.length < PAGE_SIZE) {
        break
      }
    }
    return null
  }
  try {
    for (let i = 0; i < 10; i++) {
      const currentJob: WorkflowJobType | null = await _getCurrentJob()
      if (currentJob && currentJob.id) {
        return currentJob
      }
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch (error: unknown) {
    logger.error(
      `Unable to get current workflow job info. ` +
        `Please sure that your workflow have "actions:read" permission!`
    )
  }
  return null
}

async function reportAll(
  currentJob: WorkflowJobType,
  content: string
): Promise<void> {
  logger.info(`Reporting all content ...`)

  logger.debug(`Workflow - Job: ${workflow} - ${job}`)

  const jobUrl = `https://github.com/${repo.owner}/${repo.repo}/runs/${currentJob.id}?check_suite_focus=true`
  logger.debug(`Job url: ${jobUrl}`)

  const title = `## Workflow Step Trace - ${workflow} / ${currentJob.name}`
  logger.debug(`Title: ${title}`)

  const commit: string =
    (pull_request && pull_request.head && pull_request.head.sha) || sha
  logger.debug(`Commit: ${commit}`)

  const commitUrl = `https://github.com/${repo.owner}/${repo.repo}/commit/${commit}`
  logger.debug(`Commit url: ${commitUrl}`)

  const info =
    `Workflow step trace for commit [${commit}](${commitUrl})\n` +
    `You can access workflow job details [here](${jobUrl})`

  const postContent: string = [title, info, content].join('\n')

  const jobSummary: string = core.getInput('job_summary')
  if ('true' === jobSummary) {
    core.summary.addRaw(postContent)
    await core.summary.write()
  }

  const commentOnPR: string = core.getInput('comment_on_pr')
  if (pull_request && 'true' === commentOnPR) {
    if (logger.isDebugEnabled()) {
      logger.debug(`Found Pull Request: ${JSON.stringify(pull_request)}`)
    }

    const newComment = await octokit.rest.issues.createComment({
      ...github.context.repo,
      issue_number: Number(github.context.payload.pull_request?.number),
      body: postContent
    })

    // Hide previous comments from this action after creating the new one
    await hidePreviousComments(newComment.data.id)
  } else {
    logger.debug(`Couldn't find Pull Request`)
  }

  logger.info(`Reporting all content completed`)
}

async function runPost(currentJob: WorkflowJobType): Promise<string | null> {
  try {
    const postStart = util.getTimestamp()

    const traceId = util.buildTraceId()
    // use trace-start if it's provided otherwise use the start time for current job
    const traceStart = core.getState('buildStart')
    const workflowStatus =
      process.env.GITHUB_ACTION_WORKFLOW_STATUS || 'success'
    const result =
      workflowStatus.toUpperCase() === 'SUCCESS' ? 'success' : 'failure'

    buildevents.addFields({
      'job.status': workflowStatus,
      'workflow.status': workflowStatus
    })

    // Send individual step traces to Honeycomb
    await stepTracer.finish(currentJob)

    await buildevents.step(
      traceId,
      util.randomInt(2 ** 32).toString(),
      postStart.toString(),
      'workflow-step-telemetry_post'
    )

    // Capture the trace URL from buildevents build command
    const traceUrl = await buildevents.build(traceId, traceStart, result)
    return traceUrl
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
    return null
  }
}

async function run(): Promise<void> {
  try {
    logger.info(`Finishing ...`)

    const currentJob: WorkflowJobType | null = await getCurrentJob()

    if (!currentJob) {
      logger.error(
        `Couldn't find current job. So action will not report any data.`
      )
      return
    }

    logger.debug(`Current job: ${JSON.stringify(currentJob)}`)

    // Check if this is the post hook and if we should end the trace
    const isPost = !!core.getState('isPost')
    const endTrace = !!core.getState('endTrace')

    let traceUrl: string | null = null
    if (isPost && endTrace) {
      traceUrl = await runPost(currentJob)
    }

    // Post Honeycomb trace URL as PR comment if enabled
    const commentOnPR = core.getInput('comment_on_pr') === 'true'
    const jobSummary = core.getInput('job_summary') === 'true'

    if ((commentOnPR || jobSummary) && traceUrl) {
      const traceContent = generateTraceContent(currentJob, traceUrl)
      await reportAll(currentJob, traceContent)
    }

    logger.info(`Finish completed`)
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(error.message)
    }
  }
}

run()
