## ⚠️ REPOSITORY ARCHIVED ⚠️

**This repository has been archived and is no longer maintained. We have moved to [Blacksmith](https://www.blacksmith.sh/) for CI/CD observability and performance optimization.**

**Please visit [https://www.blacksmith.sh/](https://www.blacksmith.sh/) for the latest tools and solutions.**

---

# Workflow Step Telemetry Action

A GitHub Action that instruments GitHub Actions workflow steps and sends distributed traces to Honeycomb for CI/CD observability. This action tracks step performance, timing, and status.

## How It Works

The action operates in two phases:

### 1. **Initialization Phase** (`main.ts`)
When the action runs, it:
- Downloads and installs the [Honeycomb buildevents binary](https://github.com/honeycombio/buildevents) for the current platform
- Generates a unique trace ID based on repository, workflow, run number, and attempt
- Configures environment variables for Honeycomb API communication
- Adds GitHub context fields (repository, workflow, job, actor, etc.) to all trace data
- Creates an initial span to time the action's setup process

### 2. **Post-Execution Phase** (`post.ts`)
After all workflow steps complete, the action:
- Retrieves the current job information via GitHub API
- Creates individual spans for each workflow step with timing and status data
- Sends a final "build" span representing the entire workflow execution
- Optionally posts Honeycomb trace URLs to PR comments or job summaries

## Features

- **Automatic Step Tracing**: Instruments every step in your workflow without manual configuration
- **GitHub Context Data**: Includes GitHub metadata, runner information, and custom fields
- **Platform Support**: Works across Linux, macOS, and Windows runners
- **Matrix Build Support**: Handles build matrices with unique trace identification
- **OpenTelemetry Compatible**: Optional 128-bit trace ID generation
- **Trace URL Sharing**: Optional posting of Honeycomb trace URLs to PR comments and job summaries

## Usage

### Basic Setup

Add the action as the **first step** in your job to instrument all subsequent steps:

```yaml
jobs:
  your-job:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Workflow Telemetry
        uses: bndry-co/workflow-telemetry-action@v2
        with:
          apikey: ${{ secrets.HONEYCOMB_API_KEY }}
          dataset: 'ci-builds'
          
      # All subsequent steps will be automatically traced
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Run tests
        run: npm test
```

### Complete Example with Trace URL Sharing

```yaml
name: CI Pipeline
on: [push, pull_request]

permissions:
  actions: read          # Required to fetch job information
  pull-requests: write   # Required for PR comments (if enabled)

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Workflow Telemetry
        uses: bndry-co/workflow-telemetry-action@v2
        with:
          # Required Honeycomb configuration
          apikey: ${{ secrets.HONEYCOMB_API_KEY }}
          dataset: 'ci-builds'
          
          # Optional: Share trace URLs in PR comments and job summaries
          comment_on_pr: 'true'
          job_summary: 'true'
          
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build application  
        run: npm run build
```

## Configuration

### Required Inputs

| Input     | Description |
|-----------|-------------|
| `apikey`  | Your Honeycomb API key. Store this as a repository secret. |
| `dataset` | The Honeycomb dataset name where traces will be sent. |

### Optional Inputs

| Input            | Default | Description |
|------------------|---------|-------------|
| `apihost`        | `https://api.honeycomb.io` | Honeycomb API endpoint. Use for self-hosted instances. |
| `matrix-key`     | _(empty)_ | Unique identifier for matrix builds (e.g., `node-${{ matrix.node-version }}`). |
| `otel-traceid`   | `false` | Generate OpenTelemetry-compatible 128-bit trace IDs using MD5 hashing. |
| `github_token`   | `${{ github.token }}` | GitHub token for API access. Uses default token if not specified. |
| `comment_on_pr`  | `false` | Post Honeycomb trace URLs as PR comments. Requires `pull-requests: write` permission. |
| `job_summary`    | `false` | Add Honeycomb trace URLs to the job summary page. |

### Required Permissions

```yaml
permissions:
  actions: read          # Required to fetch job step information
  pull-requests: write   # Required only if comment_on_pr is enabled
```

## Quick Start

### 1. Get Your Honeycomb API Key

1. Sign up or log in to [Honeycomb](https://ui.honeycomb.io/)
2. Navigate to **Team Settings** → **API Keys**
3. Create a new API key or copy an existing one
4. Add it as a repository secret named `HONEYCOMB_API_KEY`

### 2. Add the Action to Your Workflow

```yaml
steps:
  - name: Setup Workflow Telemetry
    uses: bndry-co/workflow-telemetry-action@v2
    with:
      apikey: ${{ secrets.HONEYCOMB_API_KEY }}
      dataset: 'ci-builds'  # Choose any dataset name
```

The action must be added as the **first step** to properly instrument all subsequent workflow steps.

## What Data is Collected

The action automatically captures and sends the following information to Honeycomb:

### Trace Structure
- **Root Span**: Represents the entire workflow run
- **Step Spans**: Individual spans for each workflow step
- **Init Span**: Tracks the action's setup time

### Automatic Fields

| Field | Description | Example |
|-------|-------------|---------|
| `github.repository` | Repository name | `owner/repo-name` |
| `github.workflow` | Workflow name | `CI Pipeline` |
| `github.run_id` | Unique run identifier | `1234567890` |
| `github.run_number` | Sequential run number | `42` |
| `github.actor` | User who triggered the run | `dependabot` |
| `github.event_name` | Trigger event | `push`, `pull_request` |
| `github.sha` | Commit SHA | `abc123...` |
| `github.ref` | Git reference | `refs/heads/main` |
| `github.job` | Job name | `test` |
| `runner.os` | Runner OS | `Linux`, `macOS`, `Windows` |
| `step.number` | Step sequence number | `1`, `2`, `3` |
| `step.conclusion` | Step result | `success`, `failure`, `skipped` |
| `step.status` | Step status | `completed`, `in_progress` |
| `meta.source` | Source identifier | `workflow-step-telemetry` |

### Trace ID Generation

Trace IDs are automatically generated using the pattern:
```
{repository}-{workflow}-{run_number}-{run_attempt}
```

With `otel-traceid: true`, this becomes an MD5 hash for OpenTelemetry compatibility.

## Advanced Usage

### Matrix Builds

Use the `matrix-key` input to distinguish between matrix combinations:

```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
    os: [ubuntu-latest, windows-latest]
    
steps:
  - name: Setup Workflow Telemetry
    uses: bndry-co/workflow-telemetry-action@v2
    with:
      apikey: ${{ secrets.HONEYCOMB_API_KEY }}
      dataset: 'ci-matrix-builds'
      matrix-key: 'node${{ matrix.node-version }}-${{ matrix.os }}'
```

### Trace URL Sharing

Share Honeycomb trace URLs in PR comments and job summaries:

```yaml
- name: Setup Workflow Telemetry
  uses: bndry-co/workflow-telemetry-action@v2
  with:
    apikey: ${{ secrets.HONEYCOMB_API_KEY }}
    dataset: 'ci-builds'
    comment_on_pr: 'true'    # Posts trace URLs as PR comments
    job_summary: 'true'      # Adds trace URLs to job summary
```

### Self-Hosted Honeycomb

For self-hosted Honeycomb instances:

```yaml
- name: Setup Workflow Telemetry
  uses: bndry-co/workflow-telemetry-action@v2
  with:
    apikey: ${{ secrets.HONEYCOMB_API_KEY }}
    dataset: 'ci-builds'
    apihost: 'https://your-honeycomb-instance.com'
```

## Under the Hood

The action works by leveraging GitHub Actions' built-in [post-job hooks](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runspost). Here's what happens:

1. **Initialization**: Downloads the appropriate `buildevents` binary for the runner's platform (Linux/macOS/Windows, x64/ARM64)
2. **Environment Setup**: Configures Honeycomb environment variables and creates initial telemetry files
3. **Step Collection**: After all steps complete, uses GitHub's API to fetch detailed step information including:
   - Step names, numbers, and status
   - Start and completion timestamps  
   - Exit codes and conclusions
4. **Trace Generation**: Creates spans for each step and sends them to Honeycomb using the `buildevents` tool
5. **Optional Reporting**: Posts Honeycomb trace URLs to PR comments or job summaries (if enabled)

### Dependencies

The action automatically downloads and uses:
- [Honeycomb buildevents](https://github.com/honeycombio/buildevents) - Official tool for sending traces to Honeycomb
- GitHub Actions APIs - For fetching job and step information
- Platform-specific binaries - Supports Linux (x64/ARM64), macOS (x64/ARM64), and Windows (x64/ARM64)

## Troubleshooting

### Common Issues

**"Unable to get current workflow job info"**
- Ensure your workflow has `actions: read` permission
- The action needs to access GitHub's API to fetch step information

**No traces appearing in Honeycomb**
- Verify your API key is correctly set as a repository secret
- Check the dataset name exists or will be created in your Honeycomb environment
- Ensure the action is placed as the first step in your job

**Permission denied errors**
- Add required permissions to your workflow:
  ```yaml
  permissions:
    actions: read
    pull-requests: write  # Only if using comment_on_pr
  ```

### Debug Mode

Enable debug logging by adding a repository secret:
```
ACTIONS_RUNNER_DEBUG = true
```

This will show detailed information about the action's execution in the workflow logs.
