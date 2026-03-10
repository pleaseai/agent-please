import { describe, expect, it } from 'bun:test'
import { parseArgs } from './cli'

describe('parseArgs - workflow path', () => {
  it('uses WORKFLOW.md default when no positional arg is provided', () => {
    const result = parseArgs([])
    expect(result.workflowPath).toBe('WORKFLOW.md')
    expect(result.portOverride).toBeNull()
  })

  it('uses explicit positional path argument', () => {
    const result = parseArgs(['/path/to/MY_WORKFLOW.md'])
    expect(result.workflowPath).toBe('/path/to/MY_WORKFLOW.md')
  })

  it('uses first positional arg when multiple are given', () => {
    const result = parseArgs(['first.md', 'second.md'])
    expect(result.workflowPath).toBe('first.md')
  })
})

describe('parseArgs - --port flag', () => {
  it('parses --port <value> with space separator', () => {
    const result = parseArgs(['--port', '8080'])
    expect(result.portOverride).toBe(8080)
  })

  it('parses --port=<value> with equals separator', () => {
    const result = parseArgs(['--port=3000'])
    expect(result.portOverride).toBe(3000)
  })

  it('accepts port 0 for ephemeral binding', () => {
    const result = parseArgs(['--port', '0'])
    expect(result.portOverride).toBe(0)
  })

  it('ignores --port with non-numeric value', () => {
    const result = parseArgs(['--port', 'abc'])
    expect(result.portOverride).toBeNull()
  })

  it('parses --port with workflow path together', () => {
    const result = parseArgs(['my.md', '--port', '9000'])
    expect(result.workflowPath).toBe('my.md')
    expect(result.portOverride).toBe(9000)
  })

  it('returns null portOverride when --port not provided', () => {
    const result = parseArgs(['my.md'])
    expect(result.portOverride).toBeNull()
  })
})
