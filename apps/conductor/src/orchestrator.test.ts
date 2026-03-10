import type { Issue } from './types'
import { describe, expect, it } from 'bun:test'
import { normalizeState } from './config'

// Test the sort/dispatch logic utilities in isolation

function sortForDispatch(issues: Issue[]): Issue[] {
  return issues.toSorted((a, b) => {
    const pa = a.priority ?? 999
    const pb = b.priority ?? 999
    if (pa !== pb)
      return pa - pb
    const ca = a.created_at?.getTime() ?? 0
    const cb = b.created_at?.getTime() ?? 0
    if (ca !== cb)
      return ca - cb
    return (a.identifier ?? '').localeCompare(b.identifier ?? '')
  })
}

function retryBackoffMs(attempt: number, maxMs: number): number {
  const base = 10_000
  return Math.min(base * (2 ** (attempt - 1)), maxMs)
}

function hasNonTerminalBlockers(issue: Issue, terminalStates: string[]): boolean {
  return issue.blocked_by.some((blocker) => {
    if (!blocker.state)
      return false
    const norm = normalizeState(blocker.state)
    return !terminalStates.some(ts => normalizeState(ts) === norm)
  })
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id1',
    identifier: 'MT-1',
    title: 'Test',
    description: null,
    priority: null,
    state: 'In Progress',
    branch_name: null,
    url: null,
    labels: [],
    blocked_by: [],
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('dispatch sort order', () => {
  it('sorts by priority ascending (lower number = higher priority)', () => {
    const issues = [
      makeIssue({ id: '3', priority: 3, identifier: 'C' }),
      makeIssue({ id: '1', priority: 1, identifier: 'A' }),
      makeIssue({ id: '2', priority: 2, identifier: 'B' }),
    ]
    const sorted = sortForDispatch(issues)
    expect(sorted.map(i => i.identifier)).toEqual(['A', 'B', 'C'])
  })

  it('sorts null priority last', () => {
    const issues = [
      makeIssue({ id: '2', priority: null, identifier: 'B' }),
      makeIssue({ id: '1', priority: 1, identifier: 'A' }),
    ]
    const sorted = sortForDispatch(issues)
    expect(sorted[0].identifier).toBe('A')
    expect(sorted[1].identifier).toBe('B')
  })

  it('sorts by created_at oldest first when priority equals', () => {
    const issues = [
      makeIssue({ id: '2', priority: 1, identifier: 'B', created_at: new Date('2024-01-02') }),
      makeIssue({ id: '1', priority: 1, identifier: 'A', created_at: new Date('2024-01-01') }),
    ]
    const sorted = sortForDispatch(issues)
    expect(sorted[0].identifier).toBe('A')
  })

  it('uses identifier as tie-breaker', () => {
    const issues = [
      makeIssue({ id: '2', priority: null, identifier: 'B', created_at: null }),
      makeIssue({ id: '1', priority: null, identifier: 'A', created_at: null }),
    ]
    const sorted = sortForDispatch(issues)
    expect(sorted[0].identifier).toBe('A')
  })
})

describe('retry backoff', () => {
  it('uses 10s base with exponential growth', () => {
    expect(retryBackoffMs(1, 300_000)).toBe(10_000)
    expect(retryBackoffMs(2, 300_000)).toBe(20_000)
    expect(retryBackoffMs(3, 300_000)).toBe(40_000)
  })

  it('caps at max_retry_backoff_ms', () => {
    expect(retryBackoffMs(10, 300_000)).toBe(300_000)
  })
})

describe('token aggregation (delta tracking)', () => {
  // Replicate the handleAgentMessage token delta logic for unit testing

  interface TokenState {
    agent_input_tokens: number
    agent_output_tokens: number
    agent_total_tokens: number
    last_reported_input_tokens: number
    last_reported_output_tokens: number
    last_reported_total_tokens: number
  }

  function applyTokenUpdate(state: TokenState, usage: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }): void {
    const { input_tokens = 0, output_tokens = 0, total_tokens = 0 } = usage
    if (total_tokens > state.last_reported_total_tokens) {
      const inputDelta = input_tokens - state.last_reported_input_tokens
      const outputDelta = output_tokens - state.last_reported_output_tokens
      const totalDelta = total_tokens - state.last_reported_total_tokens
      state.agent_input_tokens += inputDelta
      state.agent_output_tokens += outputDelta
      state.agent_total_tokens += totalDelta
      state.last_reported_input_tokens = input_tokens
      state.last_reported_output_tokens = output_tokens
      state.last_reported_total_tokens = total_tokens
    }
  }

  function makeTokenState(): TokenState {
    return {
      agent_input_tokens: 0,
      agent_output_tokens: 0,
      agent_total_tokens: 0,
      last_reported_input_tokens: 0,
      last_reported_output_tokens: 0,
      last_reported_total_tokens: 0,
    }
  }

  it('accumulates tokens correctly across multiple updates', () => {
    const state = makeTokenState()
    applyTokenUpdate(state, { input_tokens: 100, output_tokens: 50, total_tokens: 150 })
    applyTokenUpdate(state, { input_tokens: 200, output_tokens: 80, total_tokens: 280 })
    expect(state.agent_input_tokens).toBe(200)
    expect(state.agent_output_tokens).toBe(80)
    expect(state.agent_total_tokens).toBe(280)
  })

  it('ignores update when total_tokens does not increase', () => {
    const state = makeTokenState()
    applyTokenUpdate(state, { input_tokens: 100, output_tokens: 50, total_tokens: 150 })
    applyTokenUpdate(state, { input_tokens: 100, output_tokens: 50, total_tokens: 150 })
    expect(state.agent_total_tokens).toBe(150)
  })

  it('ignores update when total_tokens is zero', () => {
    const state = makeTokenState()
    applyTokenUpdate(state, { input_tokens: 0, output_tokens: 0, total_tokens: 0 })
    expect(state.agent_total_tokens).toBe(0)
  })
})

describe('blocker rules', () => {
  it('does not block when blockers are terminal', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [{ id: 'x', identifier: 'MT-0', state: 'Done' }],
    })
    expect(hasNonTerminalBlockers(issue, ['Done', 'Cancelled'])).toBe(false)
  })

  it('blocks when any blocker is non-terminal', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [{ id: 'x', identifier: 'MT-0', state: 'In Progress' }],
    })
    expect(hasNonTerminalBlockers(issue, ['Done', 'Cancelled'])).toBe(true)
  })

  it('treats null blocker state as non-blocking', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [{ id: 'x', identifier: 'MT-0', state: null }],
    })
    expect(hasNonTerminalBlockers(issue, ['Done', 'Cancelled'])).toBe(false)
  })

  it('state comparison is case-insensitive', () => {
    const issue = makeIssue({
      state: 'Todo',
      blocked_by: [{ id: 'x', identifier: 'MT-0', state: 'DONE' }],
    })
    expect(hasNonTerminalBlockers(issue, ['Done', 'Cancelled'])).toBe(false)
  })
})
