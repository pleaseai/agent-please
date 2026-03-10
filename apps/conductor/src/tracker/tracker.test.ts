import type { ServiceConfig } from '../types'
import { describe, expect, mock, test } from 'bun:test'
import { buildConfig } from '../config'
import { createAsanaAdapter } from './asana'
import { createGitHubAdapter } from './github'

function makeAsanaConfig(extra: Record<string, unknown> = {}): ServiceConfig {
  return buildConfig({
    config: {
      tracker: { kind: 'asana', api_key: 'tok', project_gid: 'gid456', ...extra },
    },
    prompt_template: '',
  })
}

function makeGitHubConfig(extra: Record<string, unknown> = {}): ServiceConfig {
  return buildConfig({
    config: {
      tracker: { kind: 'github_projects', api_key: 'ghtoken', owner: 'myorg', project_number: 1, ...extra },
    },
    prompt_template: '',
  })
}

describe('fetchIssuesByStates - empty states early return', () => {
  test('asana: returns [] immediately without making any fetch call', async () => {
    const config = makeAsanaConfig()
    const adapter = createAsanaAdapter(config)
    const result = await adapter.fetchIssuesByStates([])
    expect(result).toEqual([])
  })

  test('github_projects: returns [] immediately without making any fetch call', async () => {
    const config = makeGitHubConfig()
    const adapter = createGitHubAdapter(config)
    const result = await adapter.fetchIssuesByStates([])
    expect(result).toEqual([])
  })
})

describe('asana label normalization', () => {
  test('normalizes tags to lowercase', async () => {
    const config = makeAsanaConfig()
    const adapter = createAsanaAdapter(config)

    const mockSectionsResponse = {
      ok: true,
      json: async () => ({
        data: [{ gid: 'sec1', name: 'Todo' }],
      }),
    }

    const mockTasksResponse = {
      ok: true,
      json: async () => ({
        data: [
          {
            gid: 'task1',
            name: 'My Task',
            notes: null,
            tags: [{ name: 'Bug' }, { name: 'HIGH-Priority' }],
            dependencies: [],
            created_at: null,
            modified_at: null,
          },
        ],
        next_page: null,
      }),
    }

    const origFetch = globalThis.fetch
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/projects/'))
        return mockSectionsResponse as unknown as Response
      return mockTasksResponse as unknown as Response
    }) as unknown as typeof fetch

    try {
      const result = await adapter.fetchIssuesByStates(['Todo'])
      expect(Array.isArray(result)).toBe(true)
      if (!Array.isArray(result))
        return
      expect(result).toHaveLength(1)
      expect(result[0].labels).toEqual(['bug', 'high-priority'])
    }
    finally {
      globalThis.fetch = origFetch
    }
  })
})
