import type { RelayConfig } from './types'
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { RelayTransport } from './relay-transport'

// Mock partysocket - we test the transport logic, not the WebSocket library
const mockSocket = {
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {}),
  close: mock(() => {}),
  readyState: 1, // OPEN
}

mock.module('partysocket', () => ({
  PartySocket: mock(() => mockSocket),
}))

describe('RelayTransport', () => {
  let config: RelayConfig
  let triggerRefresh: ReturnType<typeof mock>

  beforeEach(() => {
    config = {
      url: 'https://relay.example.com',
      token: 'test-token',
      room: 'test-room',
      secret: null,
    }
    triggerRefresh = mock(() => {})
    mockSocket.addEventListener.mockClear()
    mockSocket.close.mockClear()
  })

  afterEach(() => {
    mock.restore()
  })

  it('creates with valid config', () => {
    const transport = new RelayTransport(config, triggerRefresh)
    expect(transport).toBeDefined()
  })

  it('throws when url is null', () => {
    config.url = null
    expect(() => new RelayTransport(config, triggerRefresh)).toThrow('relay.url is required')
  })

  it('throws when room is null', () => {
    config.room = null
    expect(() => new RelayTransport(config, triggerRefresh)).toThrow('relay.room is required')
  })

  it('connect registers message handler', () => {
    const transport = new RelayTransport(config, triggerRefresh)
    transport.connect()
    expect(mockSocket.addEventListener).toHaveBeenCalled()
  })

  it('disconnect closes socket', () => {
    const transport = new RelayTransport(config, triggerRefresh)
    transport.connect()
    transport.disconnect()
    expect(mockSocket.close).toHaveBeenCalled()
  })

  it('isConnected returns false before connect', () => {
    const transport = new RelayTransport(config, triggerRefresh)
    expect(transport.isConnected()).toBe(false)
  })
})
