import type { RelayConfig } from './types'
import { PartySocket } from 'partysocket'
import { createLogger } from './logger'

const log = createLogger('relay')

export class RelayTransport {
  private socket: PartySocket | null = null
  private readonly url: string
  private readonly room: string
  private readonly token: string | null
  private readonly triggerRefresh: () => void

  constructor(config: RelayConfig, triggerRefresh: () => void) {
    if (!config.url)
      throw new Error('relay.url is required when polling.mode is relay')
    if (!config.room)
      throw new Error('relay.room is required when polling.mode is relay')

    this.url = config.url
    this.room = config.room
    this.token = config.token
    this.triggerRefresh = triggerRefresh
  }

  connect(): void {
    if (this.socket)
      return

    const query: Record<string, string> = {}
    if (this.token)
      query.token = this.token

    this.socket = new PartySocket({
      host: this.url,
      party: 'relay',
      room: this.room,
      query,
    })

    this.socket.addEventListener('message', (_event) => {
      log.info(`received relay event for room=${this.room}`)
      this.triggerRefresh()
    })

    this.socket.addEventListener('open', () => {
      log.info(`connected to relay url=${this.url} room=${this.room}`)
    })

    this.socket.addEventListener('close', () => {
      log.warn(`relay connection closed — partysocket will auto-reconnect`)
    })

    this.socket.addEventListener('error', (event) => {
      log.error(`relay connection error:`, event)
    })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close()
      this.socket = null
      log.info('relay transport disconnected')
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN
  }
}
