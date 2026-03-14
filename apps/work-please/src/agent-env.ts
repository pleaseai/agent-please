import type { ServiceConfig } from './types'
import process from 'node:process'

const RUNTIME_VAR_RE = /^\$\{(\w+)\}$/

export interface TokenProvider {
  installationAccessToken: () => Promise<string | null>
}

export async function resolveAgentEnv(
  config: ServiceConfig,
  tokenProvider?: TokenProvider,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {}
  let cachedToken: string | null | undefined

  for (const [key, val] of Object.entries(config.env)) {
    const runtimeMatch = val.match(RUNTIME_VAR_RE)
    if (runtimeMatch) {
      const varName = runtimeMatch[1]
      if (varName === 'INSTALLATION_ACCESS_TOKEN' && tokenProvider) {
        if (cachedToken === undefined) {
          cachedToken = await tokenProvider.installationAccessToken()
        }
        if (cachedToken)
          resolved[key] = cachedToken
      }
      // Unknown runtime vars and unresolvable tokens are dropped
      continue
    }
    resolved[key] = val
  }

  // Merge: process.env as base, custom env overlay on top
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined)
      env[k] = v
  }
  Object.assign(env, resolved)
  return env
}
