import type { AuthConfig } from '@pleaseai/agent-core'
import { betterAuth } from 'better-auth'
import { admin, username } from 'better-auth/plugins'
import { Database } from 'bun:sqlite'

type Auth = ReturnType<typeof betterAuth>

let _auth: Auth | null = null

export function useAuth(): Auth {
  if (!_auth) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Auth not initialized',
    })
  }
  return _auth
}

export function initAuth(authConfig: AuthConfig, dbPath: string): Auth {
  const socialProviders: Record<string, { clientId: string, clientSecret: string }> = {}
  if (authConfig.github.client_id && authConfig.github.client_secret) {
    socialProviders.github = {
      clientId: authConfig.github.client_id,
      clientSecret: authConfig.github.client_secret,
    }
  }

  _auth = betterAuth({
    database: new Database(dbPath),
    secret: authConfig.secret ?? undefined,
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
    plugins: [admin(), username()],
  })

  return _auth
}
