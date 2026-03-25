import { createLogger, RelayTransport } from '@pleaseai/agent-core'

const log = createLogger('relay')

export default defineNitroPlugin(async (nitroApp) => {
  const orchestrator = (nitroApp as any).orchestrator as import('@pleaseai/agent-core').Orchestrator | undefined
  if (!orchestrator) {
    log.warn('orchestrator not available — relay transport not started')
    return
  }

  const config = orchestrator.getConfig()
  if (config.polling.mode !== 'relay') {
    return
  }

  if (!config.relay.url || !config.relay.room) {
    log.warn('relay mode configured but relay.url or relay.room is missing — skipping relay transport')
    return
  }

  const transport = new RelayTransport(config.relay, () => orchestrator.triggerRefresh())
  transport.connect()

  ;(nitroApp as any).relayTransport = transport

  nitroApp.hooks.hook('close', async () => {
    transport.disconnect()
  })
})
