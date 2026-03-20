import type { Orchestrator } from '@pleaseai/agent-core'
import { resolve } from 'node:path'
import { createLogger } from '@pleaseai/agent-core'

const log = createLogger('auth')

export default defineNitroPlugin(async (nitroApp) => {
  const orchestrator = (nitroApp as any).orchestrator as Orchestrator | undefined
  if (!orchestrator) {
    log.warn('orchestrator not available — auth not initialized')
    return
  }

  const config = orchestrator.getConfig()
  if (!config?.auth?.secret) {
    log.info('auth not configured — dashboard authentication disabled')
    return
  }

  const dbPath = resolve(config.workspace.root, config.db.path)
  const auth = initAuth(config.auth, dbPath)

  try {
    await auth.api.runMigrations()
    log.info('auth migrations complete')
  }
  catch (err) {
    log.error('auth migration failed:', err)
    return
  }

  if (config.auth.admin.username && config.auth.admin.password) {
    try {
      const existing = await auth.api.listUsers({
        query: { limit: 1, offset: 0 },
      }).catch(() => null)

      const adminExists = existing?.users?.some(
        (u: any) => u.role === 'admin',
      )

      if (!adminExists) {
        await auth.api.createUser({
          body: {
            email: `${config.auth.admin.username}@local`,
            name: config.auth.admin.username,
            password: config.auth.admin.password,
            role: 'admin',
          },
        })
        log.info(`admin user "${config.auth.admin.username}" seeded`)
      }
    }
    catch (err) {
      log.warn('admin seeding failed:', err)
    }
  }
})
