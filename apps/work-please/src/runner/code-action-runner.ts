import type { AgentMessage, Issue, ServiceConfig } from '../types'
import type { AgentRunner, AgentSession, SessionResult } from './types'
import { randomUUID } from 'node:crypto'

interface WorkflowRun {
  id: number
  status: string
  conclusion: string | null
}

export class CodeActionRunner implements AgentRunner {
  private config: ServiceConfig
  private agentEnv: Record<string, string> | null = null
  private activeRunId: number | null = null
  private aborted = false

  constructor(config: ServiceConfig) {
    this.config = config
  }

  setAgentEnv(env: Record<string, string>): void {
    this.agentEnv = env
  }

  async startSession(sessionId?: string): Promise<AgentSession | Error> {
    const { github_token, repository } = this.config.code_action
    if (!github_token)
      return new Error('code_action: missing github_token')
    if (!repository)
      return new Error('code_action: missing repository')

    return {
      sessionId: sessionId ?? randomUUID(),
      workspace: null,
    }
  }

  async runTurn(
    session: AgentSession,
    prompt: string,
    issue: Issue,
    onMessage: (msg: AgentMessage) => void,
  ): Promise<SessionResult | Error> {
    const { repository, event_type, github_token, poll_interval_ms, timeout_ms } = this.config.code_action
    const turnId = randomUUID()
    this.aborted = false
    this.activeRunId = null

    onMessage({
      event: 'session_started',
      timestamp: new Date(),
      session_id: session.sessionId,
      turn_id: turnId,
    })

    // 1. Dispatch repository_dispatch event
    const dispatchErr = await this.dispatch(repository!, event_type, prompt, issue, github_token!)
    if (dispatchErr) {
      onMessage({
        event: 'startup_failed',
        timestamp: new Date(),
        payload: { reason: dispatchErr.message },
      })
      return dispatchErr
    }

    // 2. Find the triggered run
    const dispatchedAt = Date.now()
    const run = await this.findRun(repository!, dispatchedAt, github_token!, timeout_ms)
    if (this.aborted)
      return new Error('cancelled')
    if (run instanceof Error) {
      onMessage({
        event: 'turn_failed',
        timestamp: new Date(),
        payload: { reason: run.message },
      })
      return run
    }

    this.activeRunId = run.id

    // If already completed, handle immediately
    if (run.status === 'completed') {
      return this.handleConclusion(run, turnId, session.sessionId, onMessage)
    }

    // 3. Poll until completion
    const completedRun = await this.pollUntilComplete(
      repository!,
      run.id,
      github_token!,
      poll_interval_ms,
      timeout_ms,
      dispatchedAt,
    )
    if (this.aborted)
      return new Error('cancelled')
    if (completedRun instanceof Error) {
      onMessage({
        event: 'turn_failed',
        timestamp: new Date(),
        payload: { reason: completedRun.message },
      })
      return completedRun
    }

    return this.handleConclusion(completedRun, turnId, session.sessionId, onMessage)
  }

  stopSession(): void {
    this.aborted = true
    if (this.activeRunId) {
      const { repository, github_token } = this.config.code_action
      if (repository && github_token) {
        this.cancelRun(repository, this.activeRunId, github_token).catch(() => {})
      }
    }
    this.activeRunId = null
  }

  private handleConclusion(
    run: WorkflowRun,
    turnId: string,
    sessionId: string,
    onMessage: (msg: AgentMessage) => void,
  ): SessionResult | Error {
    if (run.conclusion === 'success') {
      onMessage({ event: 'turn_completed', timestamp: new Date() })
      return { turn_id: turnId, session_id: sessionId }
    }
    onMessage({
      event: 'turn_failed',
      timestamp: new Date(),
      payload: { conclusion: run.conclusion },
    })
    return new Error(`workflow_${run.conclusion ?? 'unknown'}`)
  }

  private async dispatch(
    repository: string,
    eventType: string,
    prompt: string,
    issue: Issue,
    token: string,
  ): Promise<Error | null> {
    const url = `https://api.github.com/repos/${repository}/dispatches`
    const payload: Record<string, unknown> = {
      event_type: eventType,
      client_payload: {
        prompt,
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        issue_title: issue.title,
        before_run: this.config.hooks.before_run ?? '',
        after_run: this.config.hooks.after_run ?? '',
        ...(this.agentEnv ? { env: this.agentEnv } : {}),
      },
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(payload),
      })
      if (resp.status !== 204) {
        const body = await resp.text().catch(() => '')
        return new Error(`dispatch_failed: HTTP ${resp.status} ${body}`)
      }
      return null
    }
    catch (err) {
      return new Error(`dispatch_failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async findRun(
    repository: string,
    dispatchedAt: number,
    token: string,
    timeoutMs: number,
  ): Promise<WorkflowRun | Error> {
    const deadline = dispatchedAt + timeoutMs
    // GH Actions may take a few seconds to register the run
    const maxAttempts = Math.ceil(Math.min(timeoutMs, 60_000) / this.config.code_action.poll_interval_ms)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.aborted)
        return new Error('cancelled')

      await this.sleep(this.config.code_action.poll_interval_ms)
      if (Date.now() > deadline)
        return new Error('timeout: run not found')

      const createdFilter = new Date(dispatchedAt - 5000).toISOString()
      const url = `https://api.github.com/repos/${repository}/actions/runs?event=repository_dispatch&per_page=5&created=>=${createdFilter}`
      try {
        const resp = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        if (!resp.ok)
          continue

        const data = await resp.json() as { workflow_runs: WorkflowRun[] }
        const runs = data.workflow_runs ?? []
        if (runs.length > 0)
          return runs[0]
      }
      catch {
        // retry
      }
    }

    return new Error('timeout: run not found')
  }

  private async pollUntilComplete(
    repository: string,
    runId: number,
    token: string,
    pollIntervalMs: number,
    timeoutMs: number,
    startedAt: number,
  ): Promise<WorkflowRun | Error> {
    const deadline = startedAt + timeoutMs

    while (Date.now() < deadline) {
      if (this.aborted)
        return new Error('cancelled')

      await this.sleep(pollIntervalMs)

      const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}`
      try {
        const resp = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        if (!resp.ok)
          continue

        const run = await resp.json() as WorkflowRun
        if (run.status === 'completed')
          return run
      }
      catch {
        // retry
      }
    }

    // Timeout — cancel the run
    await this.cancelRun(repository, runId, token)
    return new Error('timeout: workflow did not complete')
  }

  private async cancelRun(repository: string, runId: number, token: string): Promise<void> {
    const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}/cancel`
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
    }
    catch {
      // best-effort
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
