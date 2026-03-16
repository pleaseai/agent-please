import type { ServiceConfig } from '../types'
import type { AgentRunner } from './types'
import { CodeActionRunner } from './code-action-runner'
import { SdkRunner } from './sdk-runner'

export function createRunner(config: ServiceConfig, workspace: string | null): AgentRunner {
  const runner = config.agent.runner ?? 'sdk'

  if (runner === 'code_action') {
    return new CodeActionRunner(config)
  }

  if (!workspace) {
    throw new Error('SDK runner requires a workspace path')
  }
  return new SdkRunner(config, workspace)
}

export type { AgentRunner, AgentSession, SessionResult } from './types'
