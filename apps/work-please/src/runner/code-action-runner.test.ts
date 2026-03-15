import type { AgentMessage, CodeActionConfig, Issue, ServiceConfig } from '../types'
import type { AgentSession } from './types'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { CodeActionRunner } from './code-action-runner'

const DEFAULT_CODE_ACTION: CodeActionConfig = {
  repository: 'myorg/my-repo',
  workflow_file: '.github/workflows/claude.yml',
  ref: 'main',
  event_type: 'claude-code-action',
  poll_interval_ms: 50, // fast for tests
  timeout_ms: 2000,
  github_token: 'ghp_test_token',
}

function makeConfig(overrides: Partial<CodeActionConfig> = {}): ServiceConfig {
  return {
    tracker: { kind: 'github_projects', endpoint: 'https://api.github.com', api_key: 'token', owner: 'myorg', project_number: 1, label_prefix: null, filter: { assignee: [], label: [] } },
    polling: { interval_ms: 30000 },
    workspace: { root: '/tmp' },
    hooks: { after_create: null, before_run: null, after_run: null, before_remove: null, timeout_ms: 60000 },
    agent: { runner: 'code_action', max_concurrent_agents: 5, max_turns: 1, max_retry_backoff_ms: 300000, max_concurrent_agents_by_state: {} },
    claude: { model: null, effort: 'high' as const, command: 'claude', permission_mode: 'bypassPermissions', allowed_tools: [], setting_sources: [], turn_timeout_ms: 3600000, read_timeout_ms: 5000, stall_timeout_ms: 300000, system_prompt: { type: 'preset', preset: 'claude_code' }, settings: { attribution: { commit: null, pr: null } } },
    code_action: { ...DEFAULT_CODE_ACTION, ...overrides },
    env: {},
    server: { port: null },
  }
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: '#42',
    title: 'Test issue',
    description: 'A test issue',
    priority: null,
    state: 'In Progress',
    branch_name: null,
    url: 'https://github.com/myorg/my-repo/issues/42',
    assignees: [],
    labels: [],
    blocked_by: [],
    pull_requests: [],
    review_decision: null,
    created_at: null,
    updated_at: null,
    project: null,
    ...overrides,
  }
}

// Helper to create a mock fetch that responds to specific API calls
function createMockFetch(responses: Array<{ url: string | RegExp, status: number, body?: unknown }>) {
  const calls: Array<{ url: string, init?: RequestInit }> = []
  return {
    calls,
    fn: mock((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url)
      calls.push({ url: urlStr, init })
      const match = responses.find(r =>
        typeof r.url === 'string' ? urlStr.includes(r.url) : r.url.test(urlStr),
      )
      if (!match) {
        return Promise.resolve(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
      }
      return Promise.resolve(new Response(JSON.stringify(match.body ?? {}), { status: match.status }))
    }),
  }
}

describe('CodeActionRunner', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('startSession', () => {
    it('returns a virtual session with null workspace', async () => {
      const runner = new CodeActionRunner(makeConfig())
      const session = await runner.startSession()
      expect(session).not.toBeInstanceOf(Error)
      const s = session as AgentSession
      expect(s.workspace).toBeNull()
      expect(s.sessionId).toBeDefined()
    })

    it('accepts a provided session ID', async () => {
      const runner = new CodeActionRunner(makeConfig())
      const session = await runner.startSession('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      expect(session).not.toBeInstanceOf(Error)
      expect((session as AgentSession).sessionId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    })

    it('rejects missing github_token', async () => {
      const runner = new CodeActionRunner(makeConfig({ github_token: null }))
      const session = await runner.startSession()
      expect(session).toBeInstanceOf(Error)
      expect((session as Error).message).toContain('github_token')
    })

    it('rejects missing repository', async () => {
      const runner = new CodeActionRunner(makeConfig({ repository: null }))
      const session = await runner.startSession()
      expect(session).toBeInstanceOf(Error)
      expect((session as Error).message).toContain('repository')
    })
  })

  describe('runTurn', () => {
    it('dispatches repository_dispatch and polls until success', async () => {
      const mockFetch = createMockFetch([
        // 1. Dispatch
        { url: '/dispatches', status: 204 },
        // 2. Find run (first poll returns empty, second finds it)
        { url: /\/actions\/runs\?/, status: 200, body: { workflow_runs: [{ id: 12345, status: 'in_progress', conclusion: null }] } },
        // 3. Poll run status - completed
        { url: '/actions/runs/12345', status: 200, body: { id: 12345, status: 'completed', conclusion: 'success' } },
      ])
      globalThis.fetch = mockFetch.fn as unknown as typeof fetch

      const runner = new CodeActionRunner(makeConfig())
      const session = (await runner.startSession()) as AgentSession
      const messages: AgentMessage[] = []

      const result = await runner.runTurn(session, 'Fix the bug', makeIssue(), msg => messages.push(msg))

      expect(result).not.toBeInstanceOf(Error)
      expect(messages.some(m => m.event === 'session_started')).toBe(true)
      expect(messages.some(m => m.event === 'turn_completed')).toBe(true)

      // Verify dispatch payload
      const dispatchCall = mockFetch.calls.find(c => c.url.includes('/dispatches'))
      expect(dispatchCall).toBeDefined()
      const body = JSON.parse(dispatchCall!.init?.body as string)
      expect(body.event_type).toBe('claude-code-action')
      expect(body.client_payload.prompt).toBe('Fix the bug')
      expect(body.client_payload.issue_identifier).toBe('#42')
    })

    it('emits turn_failed when workflow fails', async () => {
      const mockFetch = createMockFetch([
        { url: '/dispatches', status: 204 },
        { url: /\/actions\/runs\?/, status: 200, body: { workflow_runs: [{ id: 99, status: 'completed', conclusion: 'failure' }] } },
        { url: '/actions/runs/99', status: 200, body: { id: 99, status: 'completed', conclusion: 'failure' } },
      ])
      globalThis.fetch = mockFetch.fn as unknown as typeof fetch

      const runner = new CodeActionRunner(makeConfig())
      const session = (await runner.startSession()) as AgentSession
      const messages: AgentMessage[] = []

      const result = await runner.runTurn(session, 'Prompt', makeIssue(), msg => messages.push(msg))

      expect(result).toBeInstanceOf(Error)
      expect(messages.some(m => m.event === 'turn_failed')).toBe(true)
    })

    it('returns error when dispatch fails', async () => {
      const mockFetch = createMockFetch([
        { url: '/dispatches', status: 422, body: { message: 'Validation Failed' } },
      ])
      globalThis.fetch = mockFetch.fn as unknown as typeof fetch

      const runner = new CodeActionRunner(makeConfig())
      const session = (await runner.startSession()) as AgentSession
      const messages: AgentMessage[] = []

      const result = await runner.runTurn(session, 'Prompt', makeIssue(), msg => messages.push(msg))

      expect(result).toBeInstanceOf(Error)
      expect((result as Error).message).toContain('dispatch_failed')
    })

    it('includes hooks in client_payload', async () => {
      const config = makeConfig()
      config.hooks.before_run = 'echo before'
      config.hooks.after_run = 'echo after'

      const mockFetch = createMockFetch([
        { url: '/dispatches', status: 204 },
        { url: /\/actions\/runs\?/, status: 200, body: { workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success' }] } },
        { url: '/actions/runs/1', status: 200, body: { id: 1, status: 'completed', conclusion: 'success' } },
      ])
      globalThis.fetch = mockFetch.fn as unknown as typeof fetch

      const runner = new CodeActionRunner(config)
      const session = (await runner.startSession()) as AgentSession
      await runner.runTurn(session, 'Prompt', makeIssue(), () => {})

      const dispatchCall = mockFetch.calls.find(c => c.url.includes('/dispatches'))
      const body = JSON.parse(dispatchCall!.init?.body as string)
      expect(body.client_payload.before_run).toBe('echo before')
      expect(body.client_payload.after_run).toBe('echo after')
    })
  })

  describe('stopSession', () => {
    it('cancels in-progress run', async () => {
      const mockFetch = createMockFetch([
        { url: '/dispatches', status: 204 },
        { url: /\/actions\/runs\?/, status: 200, body: { workflow_runs: [{ id: 77, status: 'in_progress', conclusion: null }] } },
        // Poll keeps returning in_progress
        { url: '/actions/runs/77', status: 200, body: { id: 77, status: 'in_progress', conclusion: null } },
        // Cancel
        { url: '/actions/runs/77/cancel', status: 202 },
      ])
      globalThis.fetch = mockFetch.fn as unknown as typeof fetch

      const runner = new CodeActionRunner(makeConfig({ timeout_ms: 200 }))
      const session = (await runner.startSession()) as AgentSession

      // Start runTurn in background, then cancel
      const turnPromise = runner.runTurn(session, 'Prompt', makeIssue(), () => {})

      // Give it time to dispatch and start polling
      await new Promise(resolve => setTimeout(resolve, 100))
      runner.stopSession()

      const result = await turnPromise
      expect(result).toBeInstanceOf(Error)
    })
  })
})
