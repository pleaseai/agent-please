import { describe, expect, it } from 'bun:test'
import { extractRateLimits, extractUsage } from './agent-runner'

describe('extractUsage - nested payload shapes (Section 17.5)', () => {
  it('extracts usage from params.usage', () => {
    const payload = {
      params: { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } },
    }
    const result = extractUsage(payload)
    expect(result.usage?.input_tokens).toBe(100)
    expect(result.usage?.output_tokens).toBe(50)
    expect(result.usage?.total_tokens).toBe(150)
  })

  it('extracts usage from params.total_token_usage (alternate field name)', () => {
    const payload = {
      params: { total_token_usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 } },
    }
    const result = extractUsage(payload)
    expect(result.usage?.input_tokens).toBe(200)
    expect(result.usage?.output_tokens).toBe(80)
    expect(result.usage?.total_tokens).toBe(280)
  })

  it('accepts camelCase token field names', () => {
    const payload = {
      params: { usage: { inputTokens: 300, outputTokens: 100, totalTokens: 400 } },
    }
    const result = extractUsage(payload)
    expect(result.usage?.input_tokens).toBe(300)
    expect(result.usage?.output_tokens).toBe(100)
    expect(result.usage?.total_tokens).toBe(400)
  })

  it('returns empty object when no usage data present', () => {
    const result = extractUsage({ params: {} })
    expect(result).toEqual({})
  })

  it('returns empty object when payload has no params', () => {
    const result = extractUsage({})
    expect(result).toEqual({})
  })
})

describe('extractRateLimits - nested payload shapes (Section 17.5)', () => {
  it('extracts rate_limits from params.rate_limits', () => {
    const limits = { requests_per_minute: 60 }
    const payload = { params: { rate_limits: limits } }
    const result = extractRateLimits(payload)
    expect(result.rate_limits).toBe(limits)
  })

  it('extracts rate_limits from params.msg.rate_limits (nested msg)', () => {
    const limits = { tokens_per_minute: 1000 }
    const payload = { params: { msg: { rate_limits: limits } } }
    const result = extractRateLimits(payload)
    expect(result.rate_limits).toBe(limits)
  })

  it('extracts rate_limits from top-level payload.rate_limits', () => {
    const limits = { retry_after: 30 }
    const payload = { rate_limits: limits }
    const result = extractRateLimits(payload)
    expect(result.rate_limits).toBe(limits)
  })

  it('returns empty object when no rate_limits present', () => {
    const result = extractRateLimits({ params: {} })
    expect(result).toEqual({})
  })

  it('ignores non-object rate_limits values', () => {
    const result = extractRateLimits({ params: { rate_limits: 'invalid' } })
    expect(result).toEqual({})
  })
})
